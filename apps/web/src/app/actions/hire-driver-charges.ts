"use server";

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { can, canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import { assertStaffHireSubcompanyAccess } from "@/lib/auth/rental-subcompany-access";
import {
  calendarYmdToUtcNoonIso,
  parseStaffManualChargeDateYmd,
  parseStaffManualChargeFields,
  parseStaffManualChargeResolution,
  staffManualChargeMutationBlock,
  staffManualExtraChargeEditBlock,
  staffManualExtraChargeVoidBlock,
} from "@/lib/fleet/hire-driver-charge-mutation";
import {
  mergeHireDriverChargeHistory,
  type HireDriverChargeHistoryEventInput,
} from "@/lib/fleet/hire-driver-charge-history";
import {
  hireDriverChargeTypeLabel,
  mapDriverChargeLineItemFromDb,
  outstandingExtraChargesGbp,
  type DriverChargeLineItemDbRow,
} from "@/lib/fleet/hire-driver-charges";
import { applySignedChargeDeltaToSettlementBalance } from "@/lib/fleet/hire-inspection-damage-charges";
import {
  allocateExtraChargePaymentAcrossRows,
  buildExtraChargePaymentTableRows,
  EXTRA_CHARGE_PAYMENT_EVENT_TYPES,
  extraChargeSubmitBlock,
  planExtraChargePaidAmendment,
  resolveOpenExtraChargePayment,
  selectedExtraChargeRowIdsAreValid,
  submittedExtraChargeAllocationsAreValid,
  type OpenExtraChargePayment,
} from "@/lib/fleet/hire-driver-charge-payment";
import { isHirePaymentsWorkspaceOpen } from "@/lib/fleet/hire-lifecycle-attention";
import { loadHireAuditActorDisplayNames, logHireGroupEvent } from "@/lib/fleet/hire-audit";
import type { HirePaymentRowEventDisplay } from "@/lib/fleet/hire-payment-row-history";
import { notifyCompanyHirePaymentReviewers, notifyHireDriver } from "@/lib/platform-notifications";
import { settlementPaymentMethodRequiresAccount } from "@/lib/fleet/hire-settlement-payment-method";
import { HIRE_DEPOSIT_REFUND_METHODS } from "@/lib/fleet/hire-termination-summary";
import { revalidateVehicleFinancialsForHireGroup } from "@/app/actions/rental-vehicle-financials";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const CHARGE_LINE_SELECT =
  "id, hire_group_id, charge_type, amount_gbp, resolution, source_kind, source_id, description, balance_payment_id, charged_on, created_at, paid_gbp, collection_status";

type AuthorizedHire = {
  id: string;
  status: string;
  parentCompanyId: string;
  settlementBalanceGbp: number;
  settlementBalanceDirection: "driver_owes_company" | "company_owes_driver" | "settled" | null;
  defaultPaymentAccountId: string | null;
};

async function revalidateHireCharges(hireGroupId: string) {
  const id = hireGroupId.trim();
  revalidatePath("/rental/hires");
  revalidatePath("/rental/balances");
  revalidatePath(`/rental/balances/${id}`);
  revalidatePath(`/rental/hires/${id}`);
  revalidatePath(`/rental/hires/${id}/details`);
  revalidatePath(`/rental/hires/${id}/payments`);
  revalidatePath(`/rental/hires/${id}/settlement`);
  revalidatePath(`/driver/hires/${id}`);
  revalidatePath(`/driver/hires/${id}/payments`);
  revalidatePath(`/driver/hires/${id}/settlement`);
  await revalidateVehicleFinancialsForHireGroup(id);
}

async function loadAuthorizedHireForChargeWrite(
  hireGroupId: string,
): Promise<{ ok: true; hire: AuthorizedHire } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, parent_company_id, subcompany_id, settlement_balance_gbp, settlement_balance_direction, default_payment_account_id",
    )
    .eq("id", id)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: "Could not load hire." };
  if (!group) return { ok: false, error: "Hire not found." };
  const writeScope = await assertStaffHireSubcompanyAccess(
    profile,
    (group.subcompany_id as string | null) ?? null,
  );
  if (!writeScope.ok) return writeScope;

  return {
    ok: true,
    hire: {
      id: group.id as string,
      status: String(group.status ?? ""),
      parentCompanyId: group.parent_company_id as string,
      settlementBalanceGbp: Number(group.settlement_balance_gbp ?? 0),
      settlementBalanceDirection: (group.settlement_balance_direction as
        | "driver_owes_company"
        | "company_owes_driver"
        | "settled"
        | null) ?? null,
      defaultPaymentAccountId: (group.default_payment_account_id as string | null) ?? null,
    },
  };
}

async function persistEndedSettlementDelta(
  hire: AuthorizedHire,
  deltaGbp: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ended = hire.status === "terminated" || hire.status === "completed";
  if (!ended || Math.abs(deltaGbp) <= 0.005) return { ok: true };
  const next = applySignedChargeDeltaToSettlementBalance({
    settlementBalanceDirection: hire.settlementBalanceDirection,
    settlementBalanceGbp: hire.settlementBalanceGbp,
    deltaGbp,
  });
  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicle_hire_groups")
    .update({
      settlement_balance_direction: next.settlementBalanceDirection,
      settlement_balance_gbp: next.settlementBalanceGbp,
    })
    .eq("id", hire.id)
    .eq("parent_company_id", hire.parentCompanyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function extraChargePaymentSnapshot(hireGroupId: string): Promise<{
  outstandingGbp: number;
  pending: OpenExtraChargePayment | null;
}> {
  const admin = createSupabaseAdminClient();
  const [{ data: chargeRows }, { data: receipts }, { data: events }] = await Promise.all([
    admin
      .from("vehicle_hire_driver_charge_line_items")
      .select(CHARGE_LINE_SELECT)
      .eq("hire_group_id", hireGroupId),
    admin
      .from("vehicle_hire_balance_payments")
      .select("amount_gbp, direction, payment_category")
      .eq("hire_group_id", hireGroupId),
    admin
      .from("vehicle_hire_group_events")
      .select("event_type, created_at, metadata, summary")
      .eq("hire_group_id", hireGroupId)
      .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
      .order("created_at", { ascending: true }),
  ]);

  const outstandingGbp = outstandingExtraChargesGbp(
    (chargeRows ?? []).map((row) => mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow)).filter(
      (row): row is NonNullable<typeof row> => row != null,
    ),
    (receipts ?? []).map((payment) => ({
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction: (payment.direction as string | null) ?? null,
      paymentCategory: (payment.payment_category as string | null) ?? "settlement",
    })),
  );
  const pending = resolveOpenExtraChargePayment(
    (events ?? []).map((event) => ({
      eventType: String(event.event_type ?? ""),
      createdAt: event.created_at as string,
      metadata: (event.metadata as Record<string, unknown> | null) ?? {},
      summary: (event.summary as string | null) ?? null,
    })),
  );
  return { outstandingGbp, pending };
}

function driverHirePaymentsHref(hireGroupId: string): string {
  return `/driver/hires/${hireGroupId}/payments`;
}

async function resolvePaymentAccount(input: {
  companyId: string;
  method: string;
  paymentAccountId?: string | null;
  defaultPaymentAccountId?: string | null;
  /** When true, an account is required even for cash. */
  requireAccount?: boolean;
}): Promise<{ ok: true; accountId: string | null; accountName: string | null } | { ok: false; error: string }> {
  const accountRequired =
    input.requireAccount === true || settlementPaymentMethodRequiresAccount(input.method);
  const paymentAccountId = input.paymentAccountId?.trim() || input.defaultPaymentAccountId || null;
  if (accountRequired && !paymentAccountId) {
    return { ok: false, error: "Select the payment account this money was paid into." };
  }
  if (!accountRequired) return { ok: true, accountId: null, accountName: null };

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("company_payment_accounts")
    .select("id, name")
    .eq("id", paymentAccountId)
    .eq("parent_company_id", input.companyId)
    .eq("is_active", true)
    .maybeSingle();
  if (!account?.id) return { ok: false, error: "Payment account not found." };
  return {
    ok: true,
    accountId: account.id as string,
    accountName: ((account.name as string | null)?.trim() || "Account") ?? "Account",
  };
}

function parsePaymentMethod(value: string): (typeof HIRE_DEPOSIT_REFUND_METHODS)[number] | null {
  return (HIRE_DEPOSIT_REFUND_METHODS as readonly string[]).includes(value.trim())
    ? (value.trim() as (typeof HIRE_DEPOSIT_REFUND_METHODS)[number])
    : null;
}

/** Empty / omitted → auto FIFO. Non-empty → manual pour order (validated separately). */
function normalizeSelectedExtraChargeLineItemIds(
  value: string[] | null | undefined,
): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean);
}

function mapDriverChargeTimedPayments(
  paymentRows: readonly {
    id?: unknown;
    amount_gbp?: unknown;
    direction?: unknown;
    payment_category?: unknown;
    paid_at?: unknown;
  }[],
): Array<{ id: string; amountGbp: number; paidAt: string }> {
  return paymentRows
    .filter(
      (payment) =>
        (payment.payment_category as string | null) === "driver_charge" &&
        (payment.direction as string | null) === "received_from_driver",
    )
    .map((payment) => ({
      id: String(payment.id ?? ""),
      amountGbp: Number(payment.amount_gbp ?? 0),
      paidAt: (payment.paid_at as string) ?? "",
    }))
    .filter((payment) => payment.id && payment.paidAt && payment.amountGbp > 0);
}

function mapExtraChargeAllocationEvents(
  eventRows: readonly { event_type?: unknown; metadata?: unknown }[],
): Array<{ eventType: string; metadata: Record<string, unknown> | null }> {
  return eventRows.map((event) => ({
    eventType: String(event.event_type ?? ""),
    metadata: (event.metadata as Record<string, unknown> | null) ?? {},
  }));
}

export async function addHireDriverChargeAction(input: {
  hireGroupId: string;
  amountGbp: number;
  chargeType: string;
  chargedOnYmd: string;
  description: string;
  /** Default add_to_balance. paid_now also records a linked driver_charge receipt. */
  resolution?: string;
  paymentMethod?: string | null;
  paymentAccountId?: string | null;
  paymentReference?: string | null;
}): Promise<{ ok: true; chargeId: string } | { ok: false; error: string }> {
  const authorized = await loadAuthorizedHireForChargeWrite(input.hireGroupId);
  if (!authorized.ok) return authorized;
  const { hire } = authorized;
  const mutationBlock = staffManualChargeMutationBlock({
    canWriteRentals: true,
    hireStatus: hire.status,
    settlementDirection: hire.settlementBalanceDirection,
    action: "add",
  });
  if (mutationBlock) return { ok: false, error: mutationBlock };

  const parsed = parseStaffManualChargeFields({
    amountGbp: input.amountGbp,
    chargeType: input.chargeType,
    chargedOnYmd: input.chargedOnYmd,
    description: input.description,
    requireReason: false,
  });
  if (!parsed.ok) return parsed;

  const resolution = parseStaffManualChargeResolution(input.resolution ?? "add_to_balance");
  if (!resolution) return { ok: false, error: "Choose how this charge should be collected." };

  let paymentMethod: string | null = null;
  let paymentAccountId: string | null = null;
  let paymentAccountName: string | null = null;
  let paymentReference: string | null = input.paymentReference?.trim() || null;
  if (resolution === "paid_now") {
    const method = parsePaymentMethod(input.paymentMethod ?? "");
    if (!method) return { ok: false, error: "Select a payment method for the paid charge." };
    paymentMethod = method;
    const selectedAccountId = input.paymentAccountId?.trim() || null;
    if (!selectedAccountId) {
      return { ok: false, error: "Select the payment account this money was paid into." };
    }
    const account = await resolvePaymentAccount({
      companyId: hire.parentCompanyId,
      method,
      paymentAccountId: selectedAccountId,
      // Charged-now always requires an explicit account selection (no silent default).
      defaultPaymentAccountId: null,
      requireAccount: true,
    });
    if (!account.ok) return account;
    paymentAccountId = account.accountId;
    paymentAccountName = account.accountName;
  }

  const { user } = await requireRentalCompanyArea();
  const supabase = await createClient();

  let balancePaymentId: string | null = null;
  if (resolution === "paid_now") {
    // Use the real collection instant — not calendar noon — so history matches charge added.
    const paidAt = new Date().toISOString();
    const { data: insertedPayment, error: paymentError } = await supabase
      .from("vehicle_hire_balance_payments")
      .insert({
        hire_group_id: hire.id,
        amount_gbp: parsed.data.amountGbp,
        payment_method: paymentMethod,
        payment_account_id: paymentAccountId,
        payment_reference: paymentReference,
        direction: "received_from_driver",
        payment_category: "driver_charge",
        notes: "Extra charge collected when posted (charged now).",
        paid_at: paidAt,
        recorded_by_user_id: user.id,
      })
      .select("id")
      .maybeSingle();
    if (paymentError) return { ok: false, error: paymentError.message };
    if (!insertedPayment?.id) return { ok: false, error: "Could not record the payment for this charge." };
    balancePaymentId = insertedPayment.id as string;
  }

  const { data: inserted, error } = await supabase
    .from("vehicle_hire_driver_charge_line_items")
    .insert({
      hire_group_id: hire.id,
      parent_company_id: hire.parentCompanyId,
      charge_type: parsed.data.chargeType,
      amount_gbp: parsed.data.amountGbp,
      resolution,
      source_kind: "staff_manual",
      description: parsed.data.description,
      charged_on: parsed.data.chargedOnYmd,
      balance_payment_id: balancePaymentId,
      created_by_user_id: user.id,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (balancePaymentId) {
      await supabase.from("vehicle_hire_balance_payments").delete().eq("id", balancePaymentId);
    }
    return { ok: false, error: error.message };
  }
  if (!inserted?.id) {
    if (balancePaymentId) {
      await supabase.from("vehicle_hire_balance_payments").delete().eq("id", balancePaymentId);
    }
    return { ok: false, error: "Could not add this charge." };
  }

  // paid_now is already collected — only open-balance charges move settlement on ended hires.
  if (resolution === "add_to_balance") {
    const settled = await persistEndedSettlementDelta(hire, parsed.data.amountGbp);
    if (!settled.ok) return settled;
  }

  const admin = createSupabaseAdminClient();
  const summary =
    resolution === "paid_now"
      ? `${hireDriverChargeTypeLabel(parsed.data.chargeType)} charge of £${parsed.data.amountGbp.toFixed(2)} charged now (paid).`
      : `${hireDriverChargeTypeLabel(parsed.data.chargeType)} charge of £${parsed.data.amountGbp.toFixed(2)} added.`;
  await logHireGroupEvent(admin, {
    hireGroupId: hire.id,
    eventType: "driver_charge_added",
    summary,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      chargeLineItemId: inserted.id,
      amountGbp: parsed.data.amountGbp,
      chargeType: parsed.data.chargeType,
      chargeTypeLabel: hireDriverChargeTypeLabel(parsed.data.chargeType),
      description: parsed.data.description,
      chargedOnYmd: parsed.data.chargedOnYmd,
      resolution,
      balancePaymentId,
      ...(resolution === "paid_now"
        ? {
            paymentMethod,
            paymentAccountId,
            paymentAccountName,
            paymentReference,
          }
        : {}),
    },
  });

  if (resolution === "paid_now" && balancePaymentId) {
    await logHireGroupEvent(admin, {
      hireGroupId: hire.id,
      eventType: "driver_charge_payment_recorded",
      summary: `Recorded £${parsed.data.amountGbp.toFixed(2)} against ${hireDriverChargeTypeLabel(parsed.data.chargeType)} (charged now).`,
      actorRole: "company_staff",
      actorUserId: user.id,
      metadata: {
        balancePaymentId,
        amountGbp: parsed.data.amountGbp,
        paymentMethod,
        paymentAccountId,
        paymentAccountName,
        paymentReference,
        paidOnYmd: parsed.data.chargedOnYmd,
        allocations: [
          {
            chargeLineItemId: inserted.id,
            amountGbp: parsed.data.amountGbp,
            label: hireDriverChargeTypeLabel(parsed.data.chargeType),
          },
        ],
      },
    });
  }

  await revalidateHireCharges(hire.id);
  return { ok: true, chargeId: inserted.id as string };
}

export async function amendHireDriverChargeAction(input: {
  hireGroupId: string;
  chargeLineItemId: string;
  amountGbp: number;
  chargeType: string;
  chargedOnYmd: string;
  description: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await loadAuthorizedHireForChargeWrite(input.hireGroupId);
  if (!authorized.ok) return authorized;
  const { hire } = authorized;
  const { user } = await requireRentalCompanyArea();

  const parsed = parseStaffManualChargeFields({
    amountGbp: input.amountGbp,
    chargeType: input.chargeType,
    chargedOnYmd: input.chargedOnYmd,
    description: input.description,
    reason: input.reason,
    requireReason: true,
  });
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_driver_charge_line_items")
    .select(CHARGE_LINE_SELECT)
    .eq("id", input.chargeLineItemId.trim())
    .eq("hire_group_id", hire.id)
    .eq("parent_company_id", hire.parentCompanyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Charge not found." };

  const mapped = mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow);
  if (!mapped) return { ok: false, error: "Charge not found." };
  if (mapped.resolution === "voided") {
    return { ok: false, error: "This charge has already been voided." };
  }

  const mutationBlock = staffManualChargeMutationBlock({
    canWriteRentals: true,
    hireStatus: hire.status,
    settlementDirection: hire.settlementBalanceDirection,
    action: "amend",
    sourceKind: mapped.sourceKind,
    balancePaymentId: mapped.balancePaymentId ?? null,
  });
  if (mutationBlock) return { ok: false, error: mutationBlock };

  const snapshot = await extraChargePaymentSnapshot(hire.id);
  const [{ data: chargeRowsForEdit }, { data: receiptRowsForEdit }, { data: eventRowsForEdit }] =
    await Promise.all([
      supabase
        .from("vehicle_hire_driver_charge_line_items")
        .select(CHARGE_LINE_SELECT)
        .eq("hire_group_id", hire.id)
        .eq("parent_company_id", hire.parentCompanyId),
      supabase
        .from("vehicle_hire_balance_payments")
        .select("id, amount_gbp, direction, payment_category, paid_at")
        .eq("hire_group_id", hire.id),
      supabase
        .from("vehicle_hire_group_events")
        .select("event_type, metadata")
        .eq("hire_group_id", hire.id)
        .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES]),
    ]);
  const editCharges = (chargeRowsForEdit ?? [])
    .map((row) => mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow))
    .filter((row): row is NonNullable<typeof row> => row != null);
  const editTimedPayments = (receiptRowsForEdit ?? [])
    .filter(
      (payment) =>
        (payment.payment_category as string | null) === "driver_charge" &&
        (payment.direction as string | null) === "received_from_driver",
    )
    .map((payment) => ({
      id: payment.id as string,
      amountGbp: Number(payment.amount_gbp ?? 0),
      paidAt: (payment.paid_at as string) ?? "",
    }))
    .filter((payment) => payment.id && payment.paidAt && payment.amountGbp > 0);
  const editTableRows = buildExtraChargePaymentTableRows({
    charges: editCharges,
    receipts: (receiptRowsForEdit ?? []).map((payment) => ({
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction: (payment.direction as string | null) ?? null,
      paymentCategory: (payment.payment_category as string | null) ?? "settlement",
    })),
    timedPayments: editTimedPayments,
    allocationEvents: (eventRowsForEdit ?? []).map((event) => ({
      eventType: String(event.event_type ?? ""),
      metadata: (event.metadata as Record<string, unknown> | null) ?? {},
    })),
    pendingAmountGbp: snapshot.pending?.amountGbp,
    allowMutate: true,
  });
  const editRow = editTableRows.find((row) => row.id === mapped.id);
  const editBlock = staffManualExtraChargeEditBlock({
    paidGbp: editRow?.paidGbp ?? 0,
    paymentPendingApproval: editRow?.status === "pending_approval",
  });
  if (editBlock) return { ok: false, error: editBlock };

  const deltaGbp = Math.round((parsed.data.amountGbp - mapped.amountGbp) * 100) / 100;
  const { error: updateError } = await supabase
    .from("vehicle_hire_driver_charge_line_items")
    .update({
      charge_type: parsed.data.chargeType,
      amount_gbp: parsed.data.amountGbp,
      description: parsed.data.description,
      charged_on: parsed.data.chargedOnYmd,
    })
    .eq("id", mapped.id)
    .eq("hire_group_id", hire.id)
    .eq("parent_company_id", hire.parentCompanyId);
  if (updateError) return { ok: false, error: updateError.message };

  const settled = await persistEndedSettlementDelta(hire, deltaGbp);
  if (!settled.ok) return settled;

  const admin = createSupabaseAdminClient();
  await logHireGroupEvent(admin, {
    hireGroupId: hire.id,
    eventType: "driver_charge_amended",
    summary: parsed.data.reason ?? "Extra charge amended.",
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      chargeLineItemId: mapped.id,
      previousAmountGbp: mapped.amountGbp,
      amountGbp: parsed.data.amountGbp,
      chargeType: parsed.data.chargeType,
      chargeTypeLabel: hireDriverChargeTypeLabel(parsed.data.chargeType),
      description: parsed.data.description,
      chargedOnYmd: parsed.data.chargedOnYmd,
      reason: parsed.data.reason,
    },
  });

  await revalidateHireCharges(hire.id);
  return { ok: true };
}

export async function voidHireDriverChargeAction(input: {
  hireGroupId: string;
  chargeLineItemId: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await loadAuthorizedHireForChargeWrite(input.hireGroupId);
  if (!authorized.ok) return authorized;
  const { hire } = authorized;
  const { user } = await requireRentalCompanyArea();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "Enter a reason for this change." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_driver_charge_line_items")
    .select(CHARGE_LINE_SELECT)
    .eq("id", input.chargeLineItemId.trim())
    .eq("hire_group_id", hire.id)
    .eq("parent_company_id", hire.parentCompanyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Charge not found." };

  const mapped = mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow);
  if (!mapped) return { ok: false, error: "Charge not found." };
  if (mapped.resolution === "voided") {
    return { ok: false, error: "This charge has already been voided." };
  }

  const mutationBlock = staffManualChargeMutationBlock({
    canWriteRentals: true,
    hireStatus: hire.status,
    settlementDirection: hire.settlementBalanceDirection,
    action: "void",
    sourceKind: mapped.sourceKind,
    balancePaymentId: mapped.balancePaymentId ?? null,
  });
  if (mutationBlock) return { ok: false, error: mutationBlock };

  const [{ data: allChargeRows }, { data: receiptRowsForVoid }, { data: eventRowsForVoid }] =
    await Promise.all([
      supabase
        .from("vehicle_hire_driver_charge_line_items")
        .select(CHARGE_LINE_SELECT)
        .eq("hire_group_id", hire.id)
        .eq("parent_company_id", hire.parentCompanyId),
      supabase
        .from("vehicle_hire_balance_payments")
        .select("id, amount_gbp, direction, payment_category, paid_at")
        .eq("hire_group_id", hire.id),
      supabase
        .from("vehicle_hire_group_events")
        .select("event_type, metadata")
        .eq("hire_group_id", hire.id)
        .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
        .order("created_at", { ascending: true }),
    ]);
  const voidSnapshot = await extraChargePaymentSnapshot(hire.id);
  const allMappedCharges = (allChargeRows ?? [])
    .map((chargeRow) => mapDriverChargeLineItemFromDb(chargeRow as DriverChargeLineItemDbRow))
    .filter((chargeRow): chargeRow is NonNullable<typeof chargeRow> => chargeRow != null);
  const voidRows = buildExtraChargePaymentTableRows({
    charges: allMappedCharges,
    receipts: (receiptRowsForVoid ?? []).map((payment) => ({
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction: (payment.direction as string | null) ?? null,
      paymentCategory: (payment.payment_category as string | null) ?? "settlement",
    })),
    timedPayments: mapDriverChargeTimedPayments(receiptRowsForVoid ?? []),
    allocationEvents: mapExtraChargeAllocationEvents(eventRowsForVoid ?? []),
    pendingAmountGbp: voidSnapshot.pending?.amountGbp,
  });
  const voidRow = voidRows.find((candidate) => candidate.id === mapped.id);
  const pendingCoversCharge =
    voidRow?.status === "pending_approval" ||
    Boolean(
      voidSnapshot.pending?.allocations?.some(
        (line) => line.chargeLineItemId === mapped.id,
      ),
    );
  const voidBlock = staffManualExtraChargeVoidBlock({
    paidGbp: voidRow?.paidGbp ?? 0,
    paymentPendingApproval: pendingCoversCharge,
  });
  if (voidBlock) return { ok: false, error: voidBlock };

  const { error: updateError } = await supabase
    .from("vehicle_hire_driver_charge_line_items")
    .update({ resolution: "voided" })
    .eq("id", mapped.id)
    .eq("hire_group_id", hire.id)
    .eq("parent_company_id", hire.parentCompanyId);
  if (updateError) return { ok: false, error: updateError.message };

  const settlementDelta =
    mapped.resolution === "add_to_balance" || mapped.resolution === "paid_now"
      ? -mapped.amountGbp
      : 0;
  const settled = await persistEndedSettlementDelta(hire, settlementDelta);
  if (!settled.ok) return settled;

  const admin = createSupabaseAdminClient();
  await logHireGroupEvent(admin, {
    hireGroupId: hire.id,
    eventType: "driver_charge_voided",
    summary: reason,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      chargeLineItemId: mapped.id,
      amountGbp: mapped.amountGbp,
      previousResolution: mapped.resolution,
      chargeType: mapped.chargeType,
      chargeTypeLabel: hireDriverChargeTypeLabel(mapped.chargeType),
      description: mapped.description ?? null,
      reason,
    },
  });

  await revalidateHireCharges(hire.id);
  return { ok: true };
}

export async function recordHireDriverChargePaymentAction(input: {
  hireGroupId: string;
  amountGbp: number;
  paymentMethod: string;
  paymentAccountId?: string | null;
  paidOnYmd: string;
  paymentReference?: string | null;
  notes?: string | null;
  /** Manual allocate: open charge line ids in pour order. Server recomputes amounts. */
  selectedExtraChargeLineItemIds?: string[] | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await loadAuthorizedHireForChargeWrite(input.hireGroupId);
  if (!authorized.ok) return authorized;
  const { hire } = authorized;
  if (!isHirePaymentsWorkspaceOpen(hire.status)) {
    return { ok: false, error: "Record extra-charge payments on an active hire from Payments." };
  }
  const snapshot = await extraChargePaymentSnapshot(hire.id);
  if (snapshot.pending) {
    return {
      ok: false,
      error: "A driver extra-charge payment is waiting for approval. Approve or reject it first.",
    };
  }

  const amount = Math.round(Number(input.amountGbp) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid amount." };
  const method = parsePaymentMethod(input.paymentMethod);
  if (!method) return { ok: false, error: "Select a payment method." };
  const paidOnYmd = parseStaffManualChargeDateYmd(input.paidOnYmd);
  if (!paidOnYmd) return { ok: false, error: "Enter a valid payment date." };
  const paidOn = calendarYmdToUtcNoonIso(paidOnYmd);

  const account = await resolvePaymentAccount({
    companyId: hire.parentCompanyId,
    method,
    paymentAccountId: input.paymentAccountId,
    defaultPaymentAccountId: hire.defaultPaymentAccountId,
  });
  if (!account.ok) return account;

  const supabase = await createClient();
  const [{ data: chargeRows }, { data: receipts }, { data: eventRows }] = await Promise.all([
    supabase
      .from("vehicle_hire_driver_charge_line_items")
      .select(CHARGE_LINE_SELECT)
      .eq("hire_group_id", hire.id)
      .eq("parent_company_id", hire.parentCompanyId),
    supabase
      .from("vehicle_hire_balance_payments")
      .select("id, amount_gbp, direction, payment_category, paid_at")
      .eq("hire_group_id", hire.id),
    supabase
      .from("vehicle_hire_group_events")
      .select("event_type, metadata")
      .eq("hire_group_id", hire.id)
      .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
      .order("created_at", { ascending: true }),
  ]);

  const { user } = await requireRentalCompanyArea();
  const mappedCharges = (chargeRows ?? [])
    .map((row) => mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow))
    .filter((row): row is NonNullable<typeof row> => row != null);
  const receiptRows = (receipts ?? []).map((payment) => ({
    amountGbp: Number(payment.amount_gbp ?? 0),
    direction: (payment.direction as string | null) ?? null,
    paymentCategory: (payment.payment_category as string | null) ?? "settlement",
  }));
  const outstanding = outstandingExtraChargesGbp(mappedCharges, receiptRows);
  if (amount - outstanding > 0.005) {
    return { ok: false, error: "Amount exceeds outstanding extra charges." };
  }

  const timedPayments = mapDriverChargeTimedPayments(receipts ?? []);
  const allocationEvents = mapExtraChargeAllocationEvents(eventRows ?? []);
  const tableRows = buildExtraChargePaymentTableRows({
    charges: mappedCharges,
    receipts: receiptRows,
    timedPayments,
    allocationEvents,
  });
  const orderedRowIds = normalizeSelectedExtraChargeLineItemIds(input.selectedExtraChargeLineItemIds);
  if (orderedRowIds) {
    if (!selectedExtraChargeRowIdsAreValid(orderedRowIds, tableRows)) {
      return { ok: false, error: "Select valid open extra charges to allocate this payment to." };
    }
  }
  const allocation = allocateExtraChargePaymentAcrossRows(
    amount,
    tableRows,
    orderedRowIds ? { orderedRowIds } : undefined,
  );
  if (!allocation.allocations.length) {
    return { ok: false, error: "No outstanding extra charges to allocate this payment to." };
  }
  if (amount - allocation.totalOutstandingGbp > 0.005) {
    return {
      ok: false,
      error: orderedRowIds
        ? "Amount exceeds the selected extra charges. Reduce the amount or select more charges."
        : "Amount exceeds outstanding extra charges.",
    };
  }

  const { data: insertedPayment, error } = await supabase
    .from("vehicle_hire_balance_payments")
    .insert({
      hire_group_id: hire.id,
      amount_gbp: amount,
      payment_method: method,
      payment_account_id: account.accountId,
      payment_reference: input.paymentReference?.trim() || null,
      direction: "received_from_driver",
      payment_category: "driver_charge",
      notes: input.notes?.trim() || null,
      paid_at: paidOn,
      recorded_by_user_id: user.id,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!insertedPayment?.id) return { ok: false, error: "Could not record the extra-charge payment." };

  const admin = createSupabaseAdminClient();
  await logHireGroupEvent(admin, {
    hireGroupId: hire.id,
    eventType: "driver_charge_payment_recorded",
    summary: `Recorded £${amount.toFixed(2)} against extra charges.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      balancePaymentId: insertedPayment.id,
      amountGbp: amount,
      paymentMethod: method,
      paymentAccountId: account.accountId,
      paymentAccountName: account.accountName,
      paymentReference: input.paymentReference?.trim() || null,
      paidOnYmd,
      notes: input.notes?.trim() || null,
      allocations: allocation.allocations.map((line) => ({
        chargeLineItemId: line.rowId,
        amountGbp: line.allocatedGbp,
        label: line.label,
      })),
    },
  });

  await revalidateHireCharges(hire.id);
  return { ok: true };
}

export async function loadHireDriverChargeHistoryAction(
  hireGroupId: string,
  chargeLineItemId: string,
): Promise<{ ok: true; events: HirePaymentRowEventDisplay[] } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const hireId = hireGroupId.trim();
  const lineId = chargeLineItemId.trim();
  if (!hireId || !lineId) return { ok: false, error: "Charge not found." };

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id")
    .eq("id", hireId)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (!group) return { ok: false, error: "Hire not found." };

  const { data: charge } = await supabase
    .from("vehicle_hire_driver_charge_line_items")
    .select("id")
    .eq("id", lineId)
    .eq("hire_group_id", hireId)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (!charge) return { ok: false, error: "Charge not found." };

  const admin = createSupabaseAdminClient();
  const [{ data: events, error: eventsError }, { data: chargeRows }, { data: paymentRows }] =
    await Promise.all([
      admin
        .from("vehicle_hire_group_events")
        .select("id, event_type, actor_user_id, actor_role, summary, metadata, created_at")
        .eq("hire_group_id", hireId)
        .in("event_type", [
          "driver_charge_added",
          "driver_charge_amended",
          "driver_charge_voided",
          "driver_charge_removed",
          ...EXTRA_CHARGE_PAYMENT_EVENT_TYPES,
        ])
        .order("created_at", { ascending: true }),
      admin
        .from("vehicle_hire_driver_charge_line_items")
        .select(CHARGE_LINE_SELECT)
        .eq("hire_group_id", hireId)
        .eq("parent_company_id", companyId),
      admin
        .from("vehicle_hire_balance_payments")
        .select(
          "id, amount_gbp, payment_method, payment_reference, payment_account_id, notes, paid_at, direction, payment_category, recorded_by_user_id",
        )
        .eq("hire_group_id", hireId)
        .eq("payment_category", "driver_charge")
        .eq("direction", "received_from_driver")
        .order("paid_at", { ascending: true }),
    ]);
  if (eventsError) return { ok: false, error: eventsError.message };

  const accountIds = [
    ...new Set(
      (paymentRows ?? [])
        .map((row) => (row.payment_account_id as string | null)?.trim() || "")
        .filter(Boolean),
    ),
  ];
  const accountNames = new Map<string, string>();
  if (accountIds.length) {
    const { data: accounts } = await admin
      .from("company_payment_accounts")
      .select("id, name")
      .eq("parent_company_id", companyId)
      .in("id", accountIds);
    for (const account of accounts ?? []) {
      accountNames.set(account.id as string, ((account.name as string | null)?.trim() || "Account") ?? "Account");
    }
  }

  const actorIds = [
    ...(events ?? []).map((event) => event.actor_user_id as string | null),
    ...(paymentRows ?? []).map((payment) => payment.recorded_by_user_id as string | null),
  ];
  const names = await loadHireAuditActorDisplayNames(admin, actorIds);

  const lifecycleEvents: HireDriverChargeHistoryEventInput[] = [];
  const paymentLifecycleEvents = [];
  for (const event of events ?? []) {
    const metadata = (event.metadata as Record<string, unknown> | null) ?? {};
    const eventType = String(event.event_type ?? "");
    const actorId = (event.actor_user_id as string | null) ?? null;
    if (
      eventType === "driver_charge_added" ||
      eventType === "driver_charge_amended" ||
      eventType === "driver_charge_voided" ||
      eventType === "driver_charge_removed"
    ) {
      if (String(metadata.chargeLineItemId ?? "") !== lineId) continue;
      lifecycleEvents.push({
        id: event.id as string,
        eventType,
        createdAt: event.created_at as string,
        metadata,
        summary: (event.summary as string | null) ?? null,
        actorDisplayName: actorId ? names[actorId] ?? null : null,
      });
      continue;
    }
    paymentLifecycleEvents.push({
      id: event.id as string,
      eventType,
      createdAt: event.created_at as string,
      metadata,
      summary: (event.summary as string | null) ?? null,
      actorDisplayName: actorId ? names[actorId] ?? null : null,
      actorRole: (event.actor_role as "company_staff" | "driver" | "system" | null) ?? null,
    });
  }

  const mappedCharges = (chargeRows ?? [])
    .map((row) => mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow))
    .filter((row): row is NonNullable<typeof row> => row != null);

  const payments = (paymentRows ?? []).map((payment) => {
    const recorderId = (payment.recorded_by_user_id as string | null) ?? null;
    const accountId = (payment.payment_account_id as string | null)?.trim() || null;
    return {
      id: payment.id as string,
      amountGbp: Number(payment.amount_gbp ?? 0),
      paidAt: (payment.paid_at as string) ?? "",
      paymentMethod: (payment.payment_method as string | null) ?? null,
      paymentReference: (payment.payment_reference as string | null) ?? null,
      paymentAccountName: accountId ? accountNames.get(accountId) ?? null : null,
      notes: (payment.notes as string | null) ?? null,
      actorDisplayName: recorderId ? names[recorderId] ?? null : null,
    };
  });

  return {
    ok: true,
    events: mergeHireDriverChargeHistory({
      chargeLineItemId: lineId,
      lifecycleEvents,
      charges: mappedCharges.map((row) => ({
        id: row.id,
        amountGbp: row.amountGbp,
        resolution: row.resolution,
        chargedOn: row.chargedOn ?? null,
        createdAt: row.createdAt ?? "",
        balancePaymentId: row.balancePaymentId ?? null,
      })),
      payments,
      paymentLifecycleEvents,
    }),
  };
}

export async function submitDriverExtraChargePaymentAction(input: {
  hireGroupId: string;
  amountGbp: number;
  paymentReference?: string | null;
  /** Manual allocate: open charge line ids in pour order. Server recomputes amounts. */
  selectedExtraChargeLineItemIds?: string[] | null;
}): Promise<{ ok: true; submissionId: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const hireGroupId = input.hireGroupId.trim();
  if (!hireGroupId) return { ok: false, error: "Hire not found." };

  const amount = Math.round(Number(input.amountGbp) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid payment amount." };
  }

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, status, parent_company_id, driver_user_id, driver_email, driver_licence_number, vehicles(vrm)")
    .eq("id", hireGroupId)
    .eq("driver_user_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group) return { ok: false, error: "Hire not found." };
  if (String(group.status ?? "") !== "active") {
    return { ok: false, error: "Extra-charge payments can only be submitted on an active hire." };
  }

  const snapshot = await extraChargePaymentSnapshot(hireGroupId);
  const blocked = extraChargeSubmitBlock({
    outstandingGbp: snapshot.outstandingGbp,
    pending: snapshot.pending,
    amountGbp: amount,
  });
  if (blocked) return { ok: false, error: blocked };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }

  const submissionId = randomUUID();
  const paymentReference = input.paymentReference?.trim() || null;
  const [{ data: submitChargeRows }, { data: submitReceiptRows }, { data: submitEventRows }] =
    await Promise.all([
      admin
        .from("vehicle_hire_driver_charge_line_items")
        .select(CHARGE_LINE_SELECT)
        .eq("hire_group_id", hireGroupId),
      admin
        .from("vehicle_hire_balance_payments")
        .select("id, amount_gbp, direction, payment_category, paid_at")
        .eq("hire_group_id", hireGroupId),
      admin
        .from("vehicle_hire_group_events")
        .select("event_type, metadata")
        .eq("hire_group_id", hireGroupId)
        .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
        .order("created_at", { ascending: true }),
    ]);
  const submitCharges = (submitChargeRows ?? [])
    .map((row) => mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow))
    .filter((row): row is NonNullable<typeof row> => row != null);
  const submitReceipts = (submitReceiptRows ?? []).map((payment) => ({
    amountGbp: Number(payment.amount_gbp ?? 0),
    direction: (payment.direction as string | null) ?? null,
    paymentCategory: (payment.payment_category as string | null) ?? "settlement",
  }));
  const submitTableRows = buildExtraChargePaymentTableRows({
    charges: submitCharges,
    receipts: submitReceipts,
    timedPayments: mapDriverChargeTimedPayments(submitReceiptRows ?? []),
    allocationEvents: mapExtraChargeAllocationEvents(submitEventRows ?? []),
  });
  const orderedRowIds = normalizeSelectedExtraChargeLineItemIds(input.selectedExtraChargeLineItemIds);
  if (orderedRowIds) {
    if (!selectedExtraChargeRowIdsAreValid(orderedRowIds, submitTableRows)) {
      return { ok: false, error: "Select valid open extra charges to allocate this payment to." };
    }
  }
  const submitAllocation = allocateExtraChargePaymentAcrossRows(
    amount,
    submitTableRows,
    orderedRowIds ? { orderedRowIds } : undefined,
  );
  if (!submitAllocation.allocations.length) {
    return { ok: false, error: "No outstanding extra charges to allocate this payment to." };
  }
  if (amount - submitAllocation.totalOutstandingGbp > 0.005) {
    return {
      ok: false,
      error: orderedRowIds
        ? "Amount exceeds the selected extra charges. Reduce the amount or select more charges."
        : "Amount exceeds outstanding extra charges.",
    };
  }
  const logged = await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: "driver_charge_payment_submitted",
    summary: `Driver submitted £${amount.toFixed(2)} against extra charges.`,
    actorRole: "driver",
    actorUserId: user.id,
    metadata: {
      submissionId,
      amountGbp: amount,
      paymentReference,
      allocations: submitAllocation.allocations.map((line) => ({
        chargeLineItemId: line.rowId,
        amountGbp: line.allocatedGbp,
        label: line.label,
      })),
    },
  });
  if (!logged.ok) return logged;

  const vehicle = group.vehicles as { vrm?: string } | null;
  const driverLabel =
    (group.driver_email as string | null)?.trim() ||
    (group.driver_licence_number as string | null)?.trim() ||
    "Driver";
  await notifyCompanyHirePaymentReviewers(
    admin,
    group.parent_company_id as string,
    "hire_payment_submitted",
    {
      hireGroupId,
      submissionId,
      vehicleVrm: vehicle?.vrm?.trim() || "Vehicle",
      driverLabel,
      amountGbp: amount,
      allocatedPeriods: [{ periodStart: "Extra charges", periodEnd: "Extra charges", amountGbp: amount }],
      href: `/rental/hires/${hireGroupId}/payments?submission=${submissionId}`,
    },
  );

  await revalidateHireCharges(hireGroupId);
  return { ok: true, submissionId };
}

async function loadAuthorizedHireForExtraChargeReview(
  hireGroupId: string,
): Promise<{ ok: true; hire: AuthorizedHire; reviewerUserId: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };
  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "billing.pay")) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, parent_company_id, subcompany_id, settlement_balance_gbp, settlement_balance_direction, default_payment_account_id",
    )
    .eq("id", id)
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: "Could not load hire." };
  if (!group) return { ok: false, error: "Hire not found." };
  const reviewScope = await assertStaffHireSubcompanyAccess(
    profile,
    (group.subcompany_id as string | null) ?? null,
  );
  if (!reviewScope.ok) return reviewScope;

  return {
    ok: true,
    reviewerUserId: user.id,
    hire: {
      id: group.id as string,
      status: String(group.status ?? ""),
      parentCompanyId: group.parent_company_id as string,
      settlementBalanceGbp: Number(group.settlement_balance_gbp ?? 0),
      settlementBalanceDirection: (group.settlement_balance_direction as
        | "driver_owes_company"
        | "company_owes_driver"
        | "settled"
        | null) ?? null,
      defaultPaymentAccountId: (group.default_payment_account_id as string | null) ?? null,
    },
  };
}

export async function approveDriverExtraChargePaymentAction(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await loadAuthorizedHireForExtraChargeReview(hireGroupId);
  if (!authorized.ok) return authorized;
  const { hire, reviewerUserId } = authorized;
  if (hire.status !== "active") {
    return { ok: false, error: "Extra-charge payments can only be approved on an active hire." };
  }

  const snapshot = await extraChargePaymentSnapshot(hire.id);
  if (!snapshot.pending) return { ok: false, error: "There is no extra-charge payment waiting for approval." };
  if (snapshot.pending.amountGbp - snapshot.outstandingGbp > 0.005) {
    return { ok: false, error: "The submitted amount is higher than the outstanding extra charges." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }

  const [{ data: chargeRows }, { data: receiptRows }, { data: eventRows }] = await Promise.all([
    admin
      .from("vehicle_hire_driver_charge_line_items")
      .select(CHARGE_LINE_SELECT)
      .eq("hire_group_id", hire.id),
    admin
      .from("vehicle_hire_balance_payments")
      .select("id, amount_gbp, direction, payment_category, paid_at")
      .eq("hire_group_id", hire.id),
    admin
      .from("vehicle_hire_group_events")
      .select("event_type, metadata")
      .eq("hire_group_id", hire.id)
      .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
      .order("created_at", { ascending: true }),
  ]);
  const mappedCharges = (chargeRows ?? [])
    .map((row) => mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow))
    .filter((row): row is NonNullable<typeof row> => row != null);
  const mappedReceipts = (receiptRows ?? []).map((payment) => ({
    amountGbp: Number(payment.amount_gbp ?? 0),
    direction: (payment.direction as string | null) ?? null,
    paymentCategory: (payment.payment_category as string | null) ?? "settlement",
  }));
  const tableRows = buildExtraChargePaymentTableRows({
    charges: mappedCharges,
    receipts: mappedReceipts,
    timedPayments: mapDriverChargeTimedPayments(receiptRows ?? []),
    allocationEvents: mapExtraChargeAllocationEvents(eventRows ?? []),
  });
  const submittedAllocations = snapshot.pending.allocations ?? [];
  const allocation = submittedExtraChargeAllocationsAreValid(
    submittedAllocations,
    tableRows,
    snapshot.pending.amountGbp,
  )
    ? {
        allocations: submittedAllocations.map((line) => {
          const row = tableRows.find((item) => item.id === line.chargeLineItemId);
          const balanceBefore = roundGbp(row?.balanceGbp ?? line.amountGbp);
          const balanceAfter = roundGbp(balanceBefore - line.amountGbp);
          return {
            rowId: line.chargeLineItemId,
            label: line.label ?? row?.chargeTypeLabel ?? "Extra charge",
            allocatedGbp: line.amountGbp,
            rowBalanceBeforeGbp: balanceBefore,
            rowBalanceAfterGbp: balanceAfter,
            fullyAllocated: balanceAfter <= 0.005,
          };
        }),
        unallocatedGbp: 0,
        totalOutstandingGbp: roundGbp(
          tableRows.reduce((sum, row) => sum + Math.max(0, row.balanceGbp), 0),
        ),
      }
    : allocateExtraChargePaymentAcrossRows(snapshot.pending.amountGbp, tableRows);

  const { data: insertedPayment, error: insertError } = await admin
    .from("vehicle_hire_balance_payments")
    .insert({
      hire_group_id: hire.id,
      amount_gbp: snapshot.pending.amountGbp,
      payment_method: "bank_transfer",
      payment_account_id: hire.defaultPaymentAccountId,
      payment_reference: snapshot.pending.paymentReference,
      direction: "received_from_driver",
      payment_category: "driver_charge",
      notes: "Driver extra-charge payment approved.",
      paid_at: new Date().toISOString(),
      recorded_by_user_id: reviewerUserId,
    })
    .select("id")
    .maybeSingle();
  if (insertError) return { ok: false, error: insertError.message };
  if (!insertedPayment?.id) return { ok: false, error: "Could not record the extra-charge payment." };

  const logged = await logHireGroupEvent(admin, {
    hireGroupId: hire.id,
    eventType: "driver_charge_payment_approved",
    summary: `Approved £${snapshot.pending.amountGbp.toFixed(2)} extra-charge payment.`,
    actorRole: "company_staff",
    actorUserId: reviewerUserId,
    metadata: {
      submissionId: snapshot.pending.submissionId,
      balancePaymentId: insertedPayment.id,
      amountGbp: snapshot.pending.amountGbp,
      paymentReference: snapshot.pending.paymentReference,
      allocations: allocation.allocations.map((line) => ({
        chargeLineItemId: line.rowId,
        amountGbp: line.allocatedGbp,
        label: line.label,
      })),
    },
  });
  if (!logged.ok) {
    await admin.from("vehicle_hire_balance_payments").delete().eq("id", insertedPayment.id);
    return logged;
  }

  const { data: notifyGroup } = await admin
    .from("vehicle_hire_groups")
    .select("driver_user_id, vehicles(vrm)")
    .eq("id", hire.id)
    .maybeSingle();
  const vehicle = notifyGroup?.vehicles as { vrm?: string } | null;
  await notifyHireDriver(admin, (notifyGroup?.driver_user_id as string | null) ?? null, "hire_payment_approved", {
    hireGroupId: hire.id,
    vehicleVrm: vehicle?.vrm?.trim() || "Vehicle",
    amountGbp: snapshot.pending.amountGbp,
    href: driverHirePaymentsHref(hire.id),
  });

  await revalidateHireCharges(hire.id);
  return { ok: true };
}

export async function rejectDriverExtraChargePaymentAction(input: {
  hireGroupId: string;
  comment: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await loadAuthorizedHireForExtraChargeReview(input.hireGroupId);
  if (!authorized.ok) return authorized;
  const { hire, reviewerUserId } = authorized;
  if (hire.status !== "active") {
    return { ok: false, error: "Extra-charge payments can only be rejected on an active hire." };
  }

  const comment = input.comment.trim();
  if (!comment) return { ok: false, error: "A reason is required when rejecting a payment." };

  const snapshot = await extraChargePaymentSnapshot(hire.id);
  if (!snapshot.pending) return { ok: false, error: "There is no extra-charge payment waiting for approval." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }

  const logged = await logHireGroupEvent(admin, {
    hireGroupId: hire.id,
    eventType: "driver_charge_payment_rejected",
    summary: `Rejected £${snapshot.pending.amountGbp.toFixed(2)} extra-charge payment.`,
    actorRole: "company_staff",
    actorUserId: reviewerUserId,
    metadata: {
      submissionId: snapshot.pending.submissionId,
      amountGbp: snapshot.pending.amountGbp,
      paymentReference: snapshot.pending.paymentReference,
      comment,
    },
  });
  if (!logged.ok) return logged;

  const { data: notifyGroup } = await admin
    .from("vehicle_hire_groups")
    .select("driver_user_id, vehicles(vrm)")
    .eq("id", hire.id)
    .maybeSingle();
  const vehicle = notifyGroup?.vehicles as { vrm?: string } | null;
  await notifyHireDriver(admin, (notifyGroup?.driver_user_id as string | null) ?? null, "hire_payment_rejected", {
    hireGroupId: hire.id,
    vehicleVrm: vehicle?.vrm?.trim() || "Vehicle",
    amountGbp: snapshot.pending.amountGbp,
    comment,
    href: driverHirePaymentsHref(hire.id),
  });

  await revalidateHireCharges(hire.id);
  return { ok: true };
}

export async function amendExtraChargePaidAmountAction(input: {
  hireGroupId: string;
  chargeLineItemId: string;
  paidGbp: number;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await loadAuthorizedHireForExtraChargeReview(input.hireGroupId);
  if (!authorized.ok) return authorized;
  const { hire, reviewerUserId } = authorized;

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required when amending a payment." };

  const newPaidGbp = Math.round(Number(input.paidGbp) * 100) / 100;
  if (!Number.isFinite(newPaidGbp) || newPaidGbp < 0) {
    return { ok: false, error: "Enter a valid paid amount." };
  }

  const chargeLineItemId = input.chargeLineItemId.trim();
  if (!chargeLineItemId) return { ok: false, error: "Charge not found." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }

  const [{ data: chargeRows }, { data: paymentRows }, { data: eventRows }] = await Promise.all([
    admin
      .from("vehicle_hire_driver_charge_line_items")
      .select(CHARGE_LINE_SELECT)
      .eq("hire_group_id", hire.id)
      .eq("parent_company_id", hire.parentCompanyId),
    admin
      .from("vehicle_hire_balance_payments")
      .select("id, amount_gbp, direction, payment_category, paid_at")
      .eq("hire_group_id", hire.id),
    admin
      .from("vehicle_hire_group_events")
      .select("event_type, created_at, metadata")
      .eq("hire_group_id", hire.id)
      .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
      .order("created_at", { ascending: true }),
  ]);

  const mappedCharges = (chargeRows ?? [])
    .map((row) => mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow))
    .filter((row): row is NonNullable<typeof row> => row != null);
  const charge = mappedCharges.find((row) => row.id === chargeLineItemId);
  if (!charge) return { ok: false, error: "Charge not found." };
  if (charge.resolution !== "add_to_balance" && charge.resolution !== "paid_now") {
    return { ok: false, error: "Only collected extra charges can have payments amended." };
  }

  const timedPayments = (paymentRows ?? [])
    .filter(
      (payment) =>
        (payment.payment_category as string | null) === "driver_charge" &&
        (payment.direction as string | null) === "received_from_driver",
    )
    .map((payment) => ({
      id: payment.id as string,
      amountGbp: Number(payment.amount_gbp ?? 0),
      paidAt: (payment.paid_at as string) ?? "",
    }))
    .filter((payment) => payment.id && payment.paidAt && payment.amountGbp > 0);

  const allocationEvents = (eventRows ?? []).map((event) => ({
    eventType: String(event.event_type ?? ""),
    metadata: (event.metadata as Record<string, unknown> | null) ?? {},
  }));

  const plan = planExtraChargePaidAmendment({
    chargeLineItemId,
    newPaidGbp,
    charges: mappedCharges,
    payments: timedPayments,
    allocationEvents,
  });
  if (!plan.ok) return plan;

  for (const update of plan.paymentUpdates) {
    if (update.newAmountGbp <= 0.005) {
      const { error } = await admin
        .from("vehicle_hire_balance_payments")
        .delete()
        .eq("id", update.paymentId)
        .eq("hire_group_id", hire.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await admin
        .from("vehicle_hire_balance_payments")
        .update({ amount_gbp: update.newAmountGbp })
        .eq("id", update.paymentId)
        .eq("hire_group_id", hire.id);
      if (error) return { ok: false, error: error.message };
    }

    const logged = await logHireGroupEvent(admin, {
      hireGroupId: hire.id,
      eventType: "driver_charge_payment_amended",
      summary: `Amended extra-charge payment on ${hireDriverChargeTypeLabel(charge.chargeType)} from £${plan.previousPaidGbp.toFixed(2)} to £${plan.newPaidGbp.toFixed(2)}.`,
      actorRole: "company_staff",
      actorUserId: reviewerUserId,
      metadata: {
        chargeLineItemId,
        balancePaymentId: update.paymentId,
        previousAmountGbp: update.previousAmountGbp,
        amountGbp: update.newAmountGbp,
        previousPaidGbp: plan.previousPaidGbp,
        newPaidGbp: plan.newPaidGbp,
        reason,
        allocations: update.allocations.map((line) => ({
          chargeLineItemId: line.chargeLineItemId,
          amountGbp: line.amountGbp,
          ...(line.label ? { label: line.label } : {}),
        })),
      },
    });
    if (!logged.ok) return logged;
  }

  if (plan.convertToAddToBalance) {
    const { error: chargeError } = await admin
      .from("vehicle_hire_driver_charge_line_items")
      .update({
        resolution: "add_to_balance",
        balance_payment_id: null,
      })
      .eq("id", chargeLineItemId)
      .eq("hire_group_id", hire.id)
      .eq("parent_company_id", hire.parentCompanyId);
    if (chargeError) return { ok: false, error: chargeError.message };

    const remainderGbp = Math.round((plan.previousPaidGbp - plan.newPaidGbp) * 100) / 100;
    const settled = await persistEndedSettlementDelta(hire, remainderGbp);
    if (!settled.ok) return settled;
  }

  const { data: notifyGroup } = await admin
    .from("vehicle_hire_groups")
    .select("driver_user_id, vehicles(vrm)")
    .eq("id", hire.id)
    .maybeSingle();
  const vehicle = notifyGroup?.vehicles as { vrm?: string } | null;
  await notifyHireDriver(admin, (notifyGroup?.driver_user_id as string | null) ?? null, "hire_payment_amended", {
    hireGroupId: hire.id,
    vehicleVrm: vehicle?.vrm?.trim() || "Vehicle",
    amountGbp: plan.newPaidGbp,
    previousAmountGbp: plan.previousPaidGbp,
    comment: reason,
    href: driverHirePaymentsHref(hire.id),
  });

  await revalidateHireCharges(hire.id);
  return { ok: true };
}
