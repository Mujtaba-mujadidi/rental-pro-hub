"use server";

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
  staffManualChargeMutationBlock,
} from "@/lib/fleet/hire-driver-charge-mutation";
import {
  formatHireDriverChargeHistoryEvents,
  type HireDriverChargeHistoryEventInput,
} from "@/lib/fleet/hire-driver-charge-history";
import {
  hireDriverChargeTypeLabel,
  mapDriverChargeLineItemFromDb,
  outstandingExtraChargesGbp,
  type DriverChargeLineItemDbRow,
} from "@/lib/fleet/hire-driver-charges";
import {
  EXTRA_CHARGE_PAYMENT_EVENT_TYPES,
  extraChargeSubmitBlock,
  resolveOpenExtraChargePayment,
  type OpenExtraChargePayment,
} from "@/lib/fleet/hire-driver-charge-payment";
import { applySignedChargeDeltaToSettlementBalance } from "@/lib/fleet/hire-inspection-damage-charges";
import { loadHireAuditActorDisplayNames, logHireGroupEvent } from "@/lib/fleet/hire-audit";
import type { HirePaymentRowEventDisplay } from "@/lib/fleet/hire-payment-row-history";
import { notifyCompanyHirePaymentReviewers, notifyHireDriver } from "@/lib/platform-notifications";
import { settlementPaymentMethodRequiresAccount } from "@/lib/fleet/hire-settlement-payment-method";
import { HIRE_DEPOSIT_REFUND_METHODS } from "@/lib/fleet/hire-termination-summary";
import { revalidateVehicleFinancialsForHireGroup } from "@/app/actions/rental-vehicle-financials";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const CHARGE_LINE_SELECT =
  "id, hire_group_id, charge_type, amount_gbp, resolution, source_kind, source_id, description, balance_payment_id, charged_on, created_at";

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
}): Promise<{ ok: true; accountId: string | null; accountName: string | null } | { ok: false; error: string }> {
  const accountRequired = settlementPaymentMethodRequiresAccount(input.method);
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

export async function addHireDriverChargeAction(input: {
  hireGroupId: string;
  amountGbp: number;
  chargeType: string;
  chargedOnYmd: string;
  description: string;
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

  const { user } = await requireRentalCompanyArea();
  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("vehicle_hire_driver_charge_line_items")
    .insert({
      hire_group_id: hire.id,
      parent_company_id: hire.parentCompanyId,
      charge_type: parsed.data.chargeType,
      amount_gbp: parsed.data.amountGbp,
      resolution: "add_to_balance",
      source_kind: "staff_manual",
      description: parsed.data.description,
      charged_on: parsed.data.chargedOnYmd,
      created_by_user_id: user.id,
    })
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!inserted?.id) return { ok: false, error: "Could not add this charge." };

  const settled = await persistEndedSettlementDelta(hire, parsed.data.amountGbp);
  if (!settled.ok) return settled;

  const admin = createSupabaseAdminClient();
  await logHireGroupEvent(admin, {
    hireGroupId: hire.id,
    eventType: "driver_charge_added",
    summary: `${hireDriverChargeTypeLabel(parsed.data.chargeType)} charge of £${parsed.data.amountGbp.toFixed(2)} added.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      chargeLineItemId: inserted.id,
      amountGbp: parsed.data.amountGbp,
      chargeType: parsed.data.chargeType,
      chargeTypeLabel: hireDriverChargeTypeLabel(parsed.data.chargeType),
      description: parsed.data.description,
      chargedOnYmd: parsed.data.chargedOnYmd,
    },
  });

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
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const authorized = await loadAuthorizedHireForChargeWrite(input.hireGroupId);
  if (!authorized.ok) return authorized;
  const { hire } = authorized;
  if (hire.status !== "active") {
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
  const [{ data: chargeRows }, { data: receipts }] = await Promise.all([
    supabase
      .from("vehicle_hire_driver_charge_line_items")
      .select(CHARGE_LINE_SELECT)
      .eq("hire_group_id", hire.id)
      .eq("parent_company_id", hire.parentCompanyId),
    supabase
      .from("vehicle_hire_balance_payments")
      .select("amount_gbp, direction, payment_category")
      .eq("hire_group_id", hire.id),
  ]);
  const outstanding = outstandingExtraChargesGbp(
    (chargeRows ?? []).map((row) => mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow)).filter(
      (row): row is NonNullable<typeof row> => row != null,
    ),
    (receipts ?? []).map((payment) => ({
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction: (payment.direction as string | null) ?? null,
      paymentCategory: (payment.payment_category as string | null) ?? "settlement",
    })),
  );
  if (amount - outstanding > 0.005) {
    return { ok: false, error: "Amount exceeds outstanding extra charges." };
  }

  const { user } = await requireRentalCompanyArea();
  const { error } = await supabase.from("vehicle_hire_balance_payments").insert({
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
  });
  if (error) return { ok: false, error: error.message };

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
  const { data: events, error } = await admin
    .from("vehicle_hire_group_events")
    .select("id, event_type, actor_user_id, summary, metadata, created_at")
    .eq("hire_group_id", hireId)
    .in("event_type", [
      "driver_charge_added",
      "driver_charge_amended",
      "driver_charge_voided",
      "driver_charge_removed",
    ])
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };

  const matching: HireDriverChargeHistoryEventInput[] = [];
  for (const event of events ?? []) {
    const metadata = (event.metadata as Record<string, unknown> | null) ?? {};
    if (String(metadata.chargeLineItemId ?? "") !== lineId) continue;
    const eventType = event.event_type as HireDriverChargeHistoryEventInput["eventType"];
    matching.push({
      id: event.id as string,
      eventType,
      createdAt: event.created_at as string,
      metadata,
      summary: (event.summary as string | null) ?? null,
    });
  }

  const names = await loadHireAuditActorDisplayNames(
    admin,
    (events ?? []).map((event) => event.actor_user_id as string | null),
  );
  const named = matching.map((event) => {
    const raw = (events ?? []).find((row) => row.id === event.id);
    const actorId = (raw?.actor_user_id as string | null) ?? null;
    return {
      ...event,
      actorDisplayName: actorId ? names[actorId] ?? null : null,
    };
  });

  return { ok: true, events: formatHireDriverChargeHistoryEvents(named) };
}

export async function submitDriverExtraChargePaymentAction(input: {
  hireGroupId: string;
  amountGbp: number;
  paymentReference?: string | null;
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
      amountGbp: snapshot.pending.amountGbp,
      paymentReference: snapshot.pending.paymentReference,
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
