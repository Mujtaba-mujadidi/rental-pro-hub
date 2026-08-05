"use server";

/**
 * Hire termination, settlement ledger, and deposit resolution.
 * Transaction side effects: see @/lib/fleet/hire-payment-transactions.ts
 */

import { loadHirePaymentsPageAction, type HirePaymentPageRow } from "@/app/actions/hire-payments";
import { revalidatePath } from "next/cache";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canReadRentals, canWriteRentals } from "@/lib/auth/rental-permissions";
import { formatUkDate, ukTodayYmd } from "@/lib/datetime/uk";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import { driverDocumentsRetainUntilYmd } from "@/lib/fleet/hire-document-retention";
import { canTerminateHire } from "@/lib/fleet/hire-lifecycle-attention";
import {
  openBalanceDirection,
  remainingOpenBalanceGbp,
  signedSettlementBalanceGbp,
} from "@/lib/fleet/hire-open-balance";
import { depositRentScheduleCreditGbp } from "@/lib/fleet/hire-deposit-schedule-allocation";
import {
  hirePaymentRowPaidGbp,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import { persistDepositCreditToRentSchedule } from "@/lib/fleet/persist-hire-deposit-schedule-credit";
import {
  requiresDepositDispositionReason,
  summarizeHireRentSettlement,
} from "@/lib/fleet/hire-rent-settlement";
import {
  availableSettlementResolutions,
  HIRE_SETTLEMENT_RESOLUTIONS,
  isDepositDispositionAllowed,
  resolveTerminationBalanceState,
  settlementStepRequired,
  type HireSettlementResolution,
} from "@/lib/fleet/hire-settlement-resolution";
import {
  hireDriverChargeResolutionLabel,
  hireDriverChargeTypeLabel,
  mapDriverChargeLineItemsFromDb,
  type DriverChargeLineItemDbRow,
} from "@/lib/fleet/hire-driver-charges";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import { HIRE_TERMINATION_RENT_BILLING_MODES } from "@/lib/fleet/hire-termination-billing";
import { syncVehicleStatusForHireGroup } from "@/lib/fleet/sync-vehicle-hire-status";
import { revalidateVehicleFinancialsForHireGroup } from "@/app/actions/rental-vehicle-financials";
import {
  computeDepositResolutionSettlement,
  isDepositDispositionPending,
  parseTerminationAccountsSummary,
} from "@/lib/fleet/hire-deposit-resolution";
import {
  buildHireTerminationAccountsSummary,
  HIRE_DEPOSIT_DISPOSITIONS,
  HIRE_DEPOSIT_REFUND_METHODS,
  hireDepositDispositionLabel,
  resolveSettlementBalanceDirection,
  settlementBalanceLabel,
  type HireDepositDisposition,
  type HireDepositRefundMethod,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import { loadDriverLabelsMap } from "@/lib/fleet/driver-labels";
import type { RentCadence } from "@/lib/fleet/hire-types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HireTerminationPreview = {
  hireGroupId: string;
  vehicleVrm: string | null;
  vehicleLabel: string | null;
  /** Display name when known; otherwise null. */
  driverName: string | null;
  driverEmail: string | null;
  hireStartDateLabel: string;
  /** Compact label for confirm copy (name, else email). */
  driverLabel: string | null;
  includeDeposit: boolean;
  depositPaidGbp: number;
  rentCadence: RentCadence;
  accounts: HireTerminationAccountsSummary;
};

export type HireOpenBalanceRow = {
  hireGroupId: string;
  vehicleVrm: string | null;
  driverLabel: string | null;
  terminatedAt: string | null;
  settlementDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  openBalanceGbp: number;
  driverDocumentsRetainUntil: string | null;
};

export type HireBalanceNoteRow = {
  id: string;
  body: string;
  followUpAt: string | null;
  createdAt: string;
};

export type HireBalancePaymentRow = {
  id: string;
  amountGbp: number;
  paymentMethod: string;
  paymentReference: string | null;
  paymentAccountId: string | null;
  paymentAccountName: string | null;
  notes: string | null;
  paidAt: string;
  direction?: "received_from_driver" | "paid_to_driver";
  paymentCategory?: "settlement" | "driver_charge" | string;
};

export type HireDriverChargeWorkspaceRow = {
  id: string;
  chargeType: string;
  chargeTypeLabel: string;
  amountGbp: number;
  resolution: string;
  resolutionLabel: string;
  description: string | null;
  createdAt: string;
};

export type HireBalancePaymentAccountOption = {
  id: string;
  name: string;
  isDefault: boolean;
};

async function revalidateHireTermination(hireGroupId: string) {
  const id = hireGroupId.trim();
  revalidatePath("/rental/hires");
  revalidatePath("/rental/balances");
  revalidatePath(`/rental/balances/${id}`);
  revalidatePath(`/rental/hires/${id}`);
  revalidatePath(`/rental/hires/${id}/details`);
  revalidatePath(`/rental/hires/${id}/payments`);
  revalidatePath(`/rental/hires/${id}/settlement`);
  revalidatePath(`/driver/hires/${id}`);
  revalidatePath(`/driver/hires/${id}/settlement`);
  await revalidateVehicleFinancialsForHireGroup(id);
}

function mapPaymentRows(rows: HirePaymentPageRow[]): HirePaymentScheduleRowInput[] {
  return rows.map((row) => ({
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind,
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: row.pendingSubmittedGbp,
    sortOrder: row.sortOrder,
  }));
}

function parseDepositDisposition(value: string): HireDepositDisposition | null {
  return (HIRE_DEPOSIT_DISPOSITIONS as readonly string[]).includes(value)
    ? (value as HireDepositDisposition)
    : null;
}

function parseRefundMethod(value: string): HireDepositRefundMethod | null {
  return (HIRE_DEPOSIT_REFUND_METHODS as readonly string[]).includes(value)
    ? (value as HireDepositRefundMethod)
    : null;
}

function formatVehicleLabel(vehicle: { make?: string | null; model?: string | null } | null): string | null {
  if (!vehicle) return null;
  const label = [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
  return label || null;
}

function parseSettlementResolution(value: string): HireSettlementResolution | null {
  return (HIRE_SETTLEMENT_RESOLUTIONS as readonly string[]).includes(value)
    ? (value as HireSettlementResolution)
    : null;
}

function parseRentBillingMode(value: string): HireTerminationRentBillingMode | null {
  return (HIRE_TERMINATION_RENT_BILLING_MODES as readonly string[]).includes(value)
    ? (value as HireTerminationRentBillingMode)
    : null;
}

export async function loadHireTerminationPreviewAction(
  hireGroupId: string,
  depositDisposition: HireDepositDisposition = "hold_pending",
  depositRefundAmountGbp?: number | null,
  rentBillingMode: HireTerminationRentBillingMode = "end_of_period",
): Promise<{ ok: true; data: HireTerminationPreview } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, activated_at, start_date, rent_cadence, rent_amount_gbp, include_deposit, deposit_gbp, driver_email, driver_user_id, vehicles(vrm, make, model)",
    )
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group?.id) return { ok: false, error: "Hire not found." };
  if (!canTerminateHire(group.status as string)) {
    return { ok: false, error: "Only active hires can be ended." };
  }

  const payments = await loadHirePaymentsPageAction(hireGroupId);
  if (!payments.ok) return payments;

  const nowIso = new Date().toISOString();
  const terminatedYmd = nowIso.slice(0, 10);
  const rentCadence = group.rent_cadence as RentCadence;
  const depositGbp = group.include_deposit ? Number(group.deposit_gbp ?? 0) : 0;
  const rentSettlement = summarizeHireRentSettlement(mapPaymentRows(payments.data.rows), terminatedYmd, {
    billingMode: rentBillingMode,
    rentCadence,
  });
  const accounts = buildHireTerminationAccountsSummary({
    activatedAt: (group.activated_at as string | null) ?? null,
    terminatedAtIso: nowIso,
    startDateYmd: group.start_date as string,
    rentCadence,
    rentAmountGbp: Number(group.rent_amount_gbp ?? 0),
    paymentSummary: payments.data.summary,
    rentSettlement,
    depositGbp,
    depositDisposition,
    depositRefundAmountGbp,
  });

  const vehicle = group.vehicles as { vrm?: string; make?: string; model?: string } | null;
  const driverEmail = (group.driver_email as string | null)?.trim() || null;
  const driverUserId = (group.driver_user_id as string | null)?.trim() || null;
  let driverName: string | null = null;
  if (driverUserId) {
    try {
      const labels = await loadDriverLabelsMap(createSupabaseAdminClient(), [driverUserId]);
      const label = labels.get(driverUserId)?.trim() || "";
      if (label && label !== "Driver") {
        const looksLikeEmail = label.includes("@");
        if (!looksLikeEmail) driverName = label;
      }
    } catch {
      driverName = null;
    }
  }
  const driverLabel = driverName || driverEmail || null;
  const startDateRaw = (group.start_date as string | null)?.trim() || "";
  const hireStartDateLabel = startDateRaw ? formatUkDate(startDateRaw) : "—";

  const depositRows = mapPaymentRows(payments.data.rows).filter((row) => row.rowKind === "deposit");
  const depositPaidGbp = depositRows.reduce((sum, row) => sum + hirePaymentRowPaidGbp(row), 0);

  return {
    ok: true,
    data: {
      hireGroupId: group.id as string,
      vehicleVrm: vehicle?.vrm?.trim() ?? null,
      vehicleLabel: formatVehicleLabel(vehicle),
      driverName,
      driverEmail,
      hireStartDateLabel,
      driverLabel,
      includeDeposit: Boolean(group.include_deposit),
      depositPaidGbp: Math.round(depositPaidGbp * 100) / 100,
      rentCadence,
      accounts,
    },
  };
}

export async function terminateHireGroupAction(input: {
  hireGroupId: string;
  confirmedIdentity: boolean;
  finalConfirmed: boolean;
  rentBillingMode?: string;
  terminationNotes?: string;
  depositDisposition: string;
  depositDispositionReason?: string;
  depositRefundAmountGbp?: number | null;
  settlementResolution?: string;
  settlementPaymentMethod?: string;
  settlementPaymentReference?: string;
}): Promise<{ ok: true; checkInHref: string } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };
  if (!input.confirmedIdentity) {
    return {
      ok: false,
      error: "Confirm the vehicle and driver details before ending this contract.",
    };
  }
  if (!input.finalConfirmed) {
    return { ok: false, error: "Confirm you want to end this contract before continuing." };
  }

  const disposition = parseDepositDisposition(input.depositDisposition.trim());
  if (!disposition) return { ok: false, error: "Choose what to do with the deposit." };

  const rentBillingMode = parseRentBillingMode((input.rentBillingMode ?? "end_of_period").trim());
  if (!rentBillingMode) return { ok: false, error: "Choose how rent should be billed." };

  const preview = await loadHireTerminationPreviewAction(
    input.hireGroupId,
    disposition,
    input.depositRefundAmountGbp,
    rentBillingMode,
  );
  if (!preview.ok) return preview;

  if (
    preview.data.includeDeposit &&
    !isDepositDispositionAllowed(disposition, preview.data.accounts.signedRentBalanceGbp)
  ) {
    return { ok: false, error: "The selected deposit option is not valid for this rent balance." };
  }

  if (preview.data.includeDeposit && requiresDepositDispositionReason(disposition)) {
    const reason = input.depositDispositionReason?.trim() ?? "";
    if (!reason) {
      return {
        ok: false,
        error:
          disposition === "refund_partial"
            ? "Record the reason for the partial deposit refund."
            : "Record why the deposit is not being refunded in full.",
      };
    }
  }

  const accounts = preview.data.accounts;
  const netSettlement = accounts.netSettlementGbp;
  const needsSettlementStep = settlementStepRequired(netSettlement);
  const resolution = needsSettlementStep
    ? parseSettlementResolution((input.settlementResolution ?? "").trim())
    : null;

  if (needsSettlementStep) {
    if (!resolution) return { ok: false, error: "Choose how to settle the outstanding balance." };
    if (!availableSettlementResolutions(netSettlement).includes(resolution)) {
      return { ok: false, error: "The selected settlement option is not valid." };
    }
  }

  let balanceState;
  try {
    balanceState = resolveTerminationBalanceState({
      netSettlementGbp: netSettlement,
      resolution: resolution ?? "paid_now",
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid settlement." };
  }

  const settlementPaymentMethod =
    balanceState.recordPayment != null
      ? parseRefundMethod((input.settlementPaymentMethod ?? "").trim())
      : null;
  if (balanceState.recordPayment != null && !settlementPaymentMethod) {
    return { ok: false, error: "Select how the settlement payment was made." };
  }

  const paymentsPage = await loadHirePaymentsPageAction(input.hireGroupId);
  if (!paymentsPage.ok) return paymentsPage;

  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const terminatedYmd = now.slice(0, 10);
  const settlementDirection = resolveSettlementBalanceDirection(netSettlement);
  const retainUntil = driverDocumentsRetainUntilYmd(terminatedYmd);
  const depositReason =
    preview.data.includeDeposit && requiresDepositDispositionReason(disposition)
      ? input.depositDispositionReason?.trim() || null
      : null;

  const { error: updateError } = await admin
    .from("vehicle_hire_groups")
    .update({
      status: "terminated",
      terminated_at: now,
      termination_reason: input.terminationNotes?.trim() || "Contract ended by rental company",
      deposit_disposition: disposition,
      deposit_disposition_reason: depositReason,
      deposit_refund_amount_gbp:
        disposition === "refund_partial" ? Number(input.depositRefundAmountGbp ?? 0) : null,
      termination_settlement: accounts,
      settlement_resolution: resolution,
      settlement_discount_gbp: balanceState.settlementDiscountGbp,
      settlement_balance_gbp: balanceState.settlementBalanceGbp,
      settlement_balance_direction: balanceState.settlementBalanceDirection,
      driver_documents_retain_until: retainUntil,
    })
    .eq("id", input.hireGroupId.trim())
    .eq("status", "active");

  if (updateError) return { ok: false, error: updateError.message };

  if (balanceState.recordPayment && settlementPaymentMethod) {
    const { error: paymentError } = await admin.from("vehicle_hire_balance_payments").insert({
      hire_group_id: input.hireGroupId.trim(),
      amount_gbp: balanceState.recordPayment.amountGbp,
      payment_method: settlementPaymentMethod,
      payment_reference: input.settlementPaymentReference?.trim() || null,
      direction: balanceState.recordPayment.direction,
      notes: "Settlement recorded at contract termination",
      recorded_by_user_id: user.id,
    });
    if (paymentError) return { ok: false, error: paymentError.message };
  }

  const depositScheduleCredit = depositRentScheduleCreditGbp({
    disposition,
    depositGbp: accounts.depositGbp,
    signedRentBalanceGbp: accounts.signedRentBalanceGbp,
    depositRefundAmountGbp: input.depositRefundAmountGbp,
  });
  if (depositScheduleCredit > 0.005 && preview.data.includeDeposit) {
    const applied = await persistDepositCreditToRentSchedule({
      admin,
      hireGroupId: input.hireGroupId.trim(),
      userId: user.id,
      disposition,
      depositGbp: accounts.depositGbp,
      signedRentBalanceGbp: accounts.signedRentBalanceGbp,
      depositRefundAmountGbp: input.depositRefundAmountGbp,
      accrualYmd: terminatedYmd,
      scheduleRows: mapPaymentRows(paymentsPage.data.rows),
    });
    if (!applied.ok) return applied;
  }

  await admin
    .from("vehicle_hire_agreements")
    .update({ status: "terminated" })
    .eq("hire_group_id", input.hireGroupId.trim())
    .in("status", ["reserved", "active"]);

  await syncVehicleStatusForHireGroup(admin, input.hireGroupId.trim());

  await logHireGroupEvent(admin, {
    hireGroupId: input.hireGroupId.trim(),
    eventType: "hire_terminated",
    summary: `Contract ended. ${settlementBalanceLabel(settlementDirection, netSettlement)} · Deposit: ${hireDepositDispositionLabel(disposition)}.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      accounts,
      depositDisposition: disposition,
      depositDispositionReason: depositReason,
      rentBillingMode: preview.data.accounts.rentBillingMode,
      settlementResolution: resolution,
      settlementDiscountGbp: balanceState.settlementDiscountGbp,
      driverDocumentsRetainUntil: retainUntil,
    },
  });

  if (balanceState.recordPayment && settlementPaymentMethod) {
    const paidToDriver = balanceState.recordPayment.direction === "paid_to_driver";
    await logHireGroupEvent(admin, {
      hireGroupId: input.hireGroupId.trim(),
      eventType: "settlement_refund_recorded",
      summary: `Settlement ${paidToDriver ? "payment to" : "received from"} driver £${balanceState.recordPayment.amountGbp.toFixed(2)} via ${settlementPaymentMethod.replace(/_/g, " ")}.`,
      actorRole: "company_staff",
      actorUserId: user.id,
      metadata: {
        method: settlementPaymentMethod,
        amountGbp: balanceState.recordPayment.amountGbp,
        direction: balanceState.recordPayment.direction,
        reference: input.settlementPaymentReference?.trim() || null,
      },
    });
  }

  if (balanceState.settlementDiscountGbp != null && balanceState.settlementDiscountGbp > 0) {
    await logHireGroupEvent(admin, {
      hireGroupId: input.hireGroupId.trim(),
      eventType: "settlement_discount_recorded",
      summary: `Outstanding balance of £${balanceState.settlementDiscountGbp.toFixed(2)} written off as discount.`,
      actorRole: "company_staff",
      actorUserId: user.id,
      metadata: { amountGbp: balanceState.settlementDiscountGbp },
    });
  }

  await revalidateHireTermination(input.hireGroupId.trim());
  return { ok: true, checkInHref: `/rental/hires/${input.hireGroupId.trim()}/checkin` };
}

export async function listHireOpenBalancesAction(): Promise<
  { ok: true; rows: HireOpenBalanceRow[] } | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data: groups, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, terminated_at, settlement_balance_gbp, settlement_balance_direction, driver_documents_retain_until, driver_email, driver_licence_number, vehicles(vrm)",
    )
    .eq("parent_company_id", companyId)
    .in("status", ["terminated", "completed"])
    .not("settlement_balance_direction", "is", null)
    .neq("settlement_balance_direction", "settled")
    .order("terminated_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };

  const groupIds = (groups ?? []).map((group) => group.id as string);
  const paymentsByGroup = new Map<
    string,
    { amount_gbp: number; direction: "received_from_driver" | "paid_to_driver" }[]
  >();
  if (groupIds.length) {
    const { data: payments } = await supabase
      .from("vehicle_hire_balance_payments")
      .select("hire_group_id, amount_gbp, direction")
      .in("hire_group_id", groupIds);
    for (const payment of payments ?? []) {
      const groupDirection = (groups ?? []).find((group) => group.id === payment.hire_group_id)
        ?.settlement_balance_direction as
        | "driver_owes_company"
        | "company_owes_driver"
        | "settled"
        | undefined;
      const direction =
        (payment.direction as "received_from_driver" | "paid_to_driver" | null) ??
        (groupDirection === "driver_owes_company"
          ? "received_from_driver"
          : "paid_to_driver");
      const list = paymentsByGroup.get(payment.hire_group_id as string) ?? [];
      list.push({
        amount_gbp: Number(payment.amount_gbp ?? 0),
        direction,
      });
      paymentsByGroup.set(payment.hire_group_id as string, list);
    }
  }

  const rows: HireOpenBalanceRow[] = [];
  for (const group of groups ?? []) {
    const direction = group.settlement_balance_direction as
      | "driver_owes_company"
      | "company_owes_driver"
      | "settled";
    if (direction === "settled") continue;

    const signed = signedSettlementBalanceGbp(direction, Number(group.settlement_balance_gbp ?? 0));
    const paymentInputs = (paymentsByGroup.get(group.id as string) ?? []).map((payment) => ({
      amountGbp: payment.amount_gbp,
      direction: payment.direction,
    }));
    const openBalanceGbp = remainingOpenBalanceGbp(signed, paymentInputs);
    if (openBalanceDirection(openBalanceGbp) === "settled") continue;

    const vehicle = group.vehicles as { vrm?: string } | null;
    rows.push({
      hireGroupId: group.id as string,
      vehicleVrm: vehicle?.vrm?.trim() ?? null,
      driverLabel:
        (group.driver_email as string | null)?.trim() ||
        (group.driver_licence_number as string | null)?.trim() ||
        null,
      terminatedAt: (group.terminated_at as string | null) ?? null,
      settlementDirection: openBalanceDirection(openBalanceGbp),
      openBalanceGbp: Math.abs(openBalanceGbp),
      driverDocumentsRetainUntil: (group.driver_documents_retain_until as string | null) ?? null,
    });
  }

  return { ok: true, rows };
}

export async function loadHireBalanceTrackerAction(hireGroupId: string): Promise<
  | {
      ok: true;
      data: {
        row: HireOpenBalanceRow;
        notes: HireBalanceNoteRow[];
        payments: HireBalancePaymentRow[];
        paymentAccounts: HireBalancePaymentAccountOption[];
        defaultPaymentAccountId: string | null;
        canWrite: boolean;
      };
    }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const list = await listHireOpenBalancesAction();
  if (!list.ok) return list;
  const row = list.rows.find((item) => item.hireGroupId === hireGroupId.trim());
  if (!row) return { ok: false, error: "No open balance for this hire." };

  const supabase = await createClient();
  const [{ data: notes }, { data: payments }, { data: group }] = await Promise.all([
    supabase
      .from("vehicle_hire_balance_notes")
      .select("id, body, follow_up_at, created_at")
      .eq("hire_group_id", hireGroupId.trim())
      .order("created_at", { ascending: false }),
    supabase
      .from("vehicle_hire_balance_payments")
      .select("id, amount_gbp, payment_method, payment_reference, payment_account_id, notes, paid_at")
      .eq("hire_group_id", hireGroupId.trim())
      .order("paid_at", { ascending: false }),
    supabase
      .from("vehicle_hire_groups")
      .select("parent_company_id, default_payment_account_id")
      .eq("id", hireGroupId.trim())
      .maybeSingle(),
  ]);

  const companyId = (group?.parent_company_id as string | null) ?? null;
  const defaultPaymentAccountId = (group?.default_payment_account_id as string | null) ?? null;
  const accountIds = new Set<string>();
  for (const payment of payments ?? []) {
    const accountId = payment.payment_account_id as string | null;
    if (accountId) accountIds.add(accountId);
  }
  if (defaultPaymentAccountId) accountIds.add(defaultPaymentAccountId);

  const accountNameById = new Map<string, string>();
  if (companyId) {
    const { data: accounts } = await supabase
      .from("company_payment_accounts")
      .select("id, name")
      .eq("parent_company_id", companyId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    for (const account of accounts ?? []) {
      accountNameById.set(account.id as string, (account.name as string)?.trim() || "Account");
    }
  }

  const paymentAccounts: HireBalancePaymentAccountOption[] = [...accountNameById.entries()].map(
    ([id, name]) => ({
      id,
      name,
      isDefault: id === defaultPaymentAccountId,
    }),
  );

  return {
    ok: true,
    data: {
      row,
      notes: (notes ?? []).map((note) => ({
        id: note.id as string,
        body: note.body as string,
        followUpAt: (note.follow_up_at as string | null) ?? null,
        createdAt: note.created_at as string,
      })),
      payments: (payments ?? []).map((payment) => ({
        id: payment.id as string,
        amountGbp: Number(payment.amount_gbp ?? 0),
        paymentMethod: payment.payment_method as string,
        paymentReference: (payment.payment_reference as string | null) ?? null,
        paymentAccountId: (payment.payment_account_id as string | null) ?? null,
        paymentAccountName: payment.payment_account_id
          ? accountNameById.get(payment.payment_account_id as string) ?? null
          : null,
        notes: (payment.notes as string | null) ?? null,
        paidAt: payment.paid_at as string,
      })),
      paymentAccounts,
      defaultPaymentAccountId,
      canWrite: canWriteRentals(profile),
    },
  };
}

export async function addHireBalanceNoteAction(input: {
  hireGroupId: string;
  body: string;
  followUpAt?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Enter a note." };

  const supabase = await createClient();
  const { error } = await supabase.from("vehicle_hire_balance_notes").insert({
    hire_group_id: input.hireGroupId.trim(),
    body,
    follow_up_at: input.followUpAt?.trim() || null,
    created_by_user_id: user.id,
  });
  if (error) return { ok: false, error: error.message };

  await revalidateHireTermination(input.hireGroupId.trim());
  return { ok: true };
}

export async function recordHireBalancePaymentAction(input: {
  hireGroupId: string;
  amountGbp: number;
  paymentMethod: string;
  paymentAccountId?: string | null;
  paymentReference?: string;
  notes?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const method = parseRefundMethod(input.paymentMethod.trim());
  if (!method) return { ok: false, error: "Select a payment method." };
  const amount = Number(input.amountGbp);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid amount." };

  const supabase = await createClient();
  const { data: group, error: groupError } = await supabase
    .from("vehicle_hire_groups")
    .select("parent_company_id, default_payment_account_id, settlement_balance_gbp, settlement_balance_direction")
    .eq("id", input.hireGroupId.trim())
    .maybeSingle();
  if (groupError) return { ok: false, error: groupError.message };
  if (!group) return { ok: false, error: "Hire not found." };

  const paymentAccountId =
    input.paymentAccountId?.trim() ||
    ((group.default_payment_account_id as string | null) ?? null);
  if (!paymentAccountId) {
    return { ok: false, error: "Select the payment account used for this settlement." };
  }

  const { data: account } = await supabase
    .from("company_payment_accounts")
    .select("id")
    .eq("id", paymentAccountId)
    .eq("parent_company_id", group.parent_company_id as string)
    .eq("is_active", true)
    .maybeSingle();
  if (!account?.id) return { ok: false, error: "Payment account not found." };

  const direction = group.settlement_balance_direction as
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null;
  if (!direction || direction === "settled") {
    return { ok: false, error: "This hire has no open settlement balance." };
  }

  const paymentDirection =
    direction === "driver_owes_company" ? "received_from_driver" : "paid_to_driver";

  const { error } = await supabase.from("vehicle_hire_balance_payments").insert({
    hire_group_id: input.hireGroupId.trim(),
    amount_gbp: Math.round(amount * 100) / 100,
    payment_method: method,
    payment_account_id: paymentAccountId,
    payment_reference: input.paymentReference?.trim() || null,
    direction: paymentDirection,
    payment_category: "settlement",
    notes: input.notes?.trim() || null,
    recorded_by_user_id: user.id,
  });
  if (error) return { ok: false, error: error.message };

  const signed = signedSettlementBalanceGbp(direction, Number(group.settlement_balance_gbp ?? 0));
  const { data: payments } = await supabase
    .from("vehicle_hire_balance_payments")
    .select("amount_gbp, direction")
    .eq("hire_group_id", input.hireGroupId.trim());
  const remaining = remainingOpenBalanceGbp(
    signed,
    (payments ?? []).map((payment) => ({
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction:
        (payment.direction as "received_from_driver" | "paid_to_driver" | null) ?? paymentDirection,
    })),
  );
  const openDirection = openBalanceDirection(remaining);
  await supabase
    .from("vehicle_hire_groups")
    .update({
      settlement_balance_direction: openDirection,
      settlement_balance_gbp: openDirection === "settled" ? 0 : Math.abs(remaining),
    })
    .eq("id", input.hireGroupId.trim());

  await revalidateHireTermination(input.hireGroupId.trim());
  return { ok: true };
}

export async function loadHireDriverDocumentRetentionAction(hireGroupId: string): Promise<
  | {
      ok: true;
      retainUntil: string | null;
      canAccess: boolean;
      warning: { level: "warning" | "expired"; message: string } | null;
    }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_hire_groups")
    .select("driver_documents_retain_until")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Hire not found." };

  const retainUntil = (data.driver_documents_retain_until as string | null) ?? null;
  const today = ukTodayYmd();
  const { canCompanyAccessHireDriverDocuments, driverDocumentsRetentionWarning } = await import(
    "@/lib/fleet/hire-document-retention"
  );

  return {
    ok: true,
    retainUntil,
    canAccess: canCompanyAccessHireDriverDocuments(retainUntil, today),
    warning: retainUntil ? driverDocumentsRetentionWarning(retainUntil, today) : null,
  };
}

export type DriverHireSettlementView = {
  settled: boolean;
  settlementDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  openBalanceGbp: number;
  payments: HireBalancePaymentRow[];
};

/** Driver read-only settlement summary for ended hires. */
export async function loadDriverHireSettlementAction(
  hireGroupId: string,
): Promise<{ ok: true; data: DriverHireSettlementView } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, settlement_balance_gbp, settlement_balance_direction")
    .eq("id", hireGroupId.trim())
    .eq("driver_user_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group?.id) return { ok: false, error: "Hire not found." };

  const direction = (group.settlement_balance_direction as
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null) ?? "settled";

  const { data: payments } = await supabase
    .from("vehicle_hire_balance_payments")
    .select("id, amount_gbp, payment_method, payment_reference, payment_account_id, direction, notes, paid_at")
    .eq("hire_group_id", hireGroupId.trim())
    .order("paid_at", { ascending: false });

  if (direction === "settled") {
    return {
      ok: true,
      data: {
        settled: true,
        settlementDirection: "settled",
        openBalanceGbp: 0,
        payments: (payments ?? []).map((payment) => ({
          id: payment.id as string,
          amountGbp: Number(payment.amount_gbp ?? 0),
          paymentMethod: payment.payment_method as string,
          paymentReference: (payment.payment_reference as string | null) ?? null,
          paymentAccountId: (payment.payment_account_id as string | null) ?? null,
          paymentAccountName: null,
          notes: (payment.notes as string | null) ?? null,
          paidAt: payment.paid_at as string,
        })),
      },
    };
  }

  const signed = signedSettlementBalanceGbp(direction, Number(group.settlement_balance_gbp ?? 0));
  const paymentDirection =
    direction === "driver_owes_company" ? "received_from_driver" : "paid_to_driver";
  const remaining = remainingOpenBalanceGbp(
    signed,
    (payments ?? []).map((payment) => ({
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction:
        (payment.direction as "received_from_driver" | "paid_to_driver" | null) ?? paymentDirection,
    })),
  );
  const openDirection = openBalanceDirection(remaining);

  return {
    ok: true,
    data: {
      settled: openDirection === "settled",
      settlementDirection: openDirection,
      openBalanceGbp: Math.abs(remaining),
      payments: (payments ?? []).map((payment) => ({
        id: payment.id as string,
        amountGbp: Number(payment.amount_gbp ?? 0),
        paymentMethod: payment.payment_method as string,
        paymentReference: (payment.payment_reference as string | null) ?? null,
        paymentAccountId: (payment.payment_account_id as string | null) ?? null,
        paymentAccountName: null,
        notes: (payment.notes as string | null) ?? null,
        paidAt: payment.paid_at as string,
      })),
    },
  };
}

export type HireSettlementWorkspaceData = {
  hireGroupId: string;
  vehicleVrm: string | null;
  driverLabel: string | null;
  terminatedAt: string | null;
  settlementDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  openBalanceGbp: number;
  payments: HireBalancePaymentRow[];
  driverChargeLineItems: HireDriverChargeWorkspaceRow[];
  notes: HireBalanceNoteRow[];
  paymentAccounts: HireBalancePaymentAccountOption[];
  defaultPaymentAccountId: string | null;
  canWrite: boolean;
};

/** Staff settlement workspace for ended hires (open or settled). */
export async function loadHireSettlementWorkspaceAction(hireGroupId: string): Promise<
  { ok: true; data: HireSettlementWorkspaceData } | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, terminated_at, settlement_balance_gbp, settlement_balance_direction, parent_company_id, default_payment_account_id, driver_email, driver_licence_number, vehicles(vrm)",
    )
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group) return { ok: false, error: "Hire not found." };

  const status = String(group.status ?? "");
  if (status !== "terminated" && status !== "completed") {
    return { ok: false, error: "Settlement is only available after the contract ends." };
  }

  const direction = (group.settlement_balance_direction as
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null) ?? "settled";

  const [{ data: notes }, { data: payments }, { data: chargeRows }] = await Promise.all([
    supabase
      .from("vehicle_hire_balance_notes")
      .select("id, body, follow_up_at, created_at")
      .eq("hire_group_id", hireGroupId.trim())
      .order("created_at", { ascending: false }),
    supabase
      .from("vehicle_hire_balance_payments")
      .select(
        "id, amount_gbp, payment_method, payment_reference, payment_account_id, notes, paid_at, direction, payment_category",
      )
      .eq("hire_group_id", hireGroupId.trim())
      .order("paid_at", { ascending: false }),
    supabase
      .from("vehicle_hire_driver_charge_line_items")
      .select(
        "id, hire_group_id, charge_type, amount_gbp, resolution, source_kind, source_id, description, created_at",
      )
      .eq("hire_group_id", hireGroupId.trim())
      .order("created_at", { ascending: false }),
  ]);

  const companyId = (group.parent_company_id as string | null) ?? null;
  const defaultPaymentAccountId = (group.default_payment_account_id as string | null) ?? null;
  const accountIds = new Set<string>();
  for (const payment of payments ?? []) {
    const accountId = payment.payment_account_id as string | null;
    if (accountId) accountIds.add(accountId);
  }
  if (defaultPaymentAccountId) accountIds.add(defaultPaymentAccountId);

  const accountNameById = new Map<string, string>();
  if (companyId) {
    const { data: accounts } = await supabase
      .from("company_payment_accounts")
      .select("id, name")
      .eq("parent_company_id", companyId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    for (const account of accounts ?? []) {
      accountNameById.set(account.id as string, (account.name as string)?.trim() || "Account");
    }
  }

  const paymentAccounts: HireBalancePaymentAccountOption[] = [...accountNameById.entries()].map(
    ([id, name]) => ({
      id,
      name,
      isDefault: id === defaultPaymentAccountId,
    }),
  );

  const mappedPayments: HireBalancePaymentRow[] = (payments ?? []).map((payment) => ({
    id: payment.id as string,
    amountGbp: Number(payment.amount_gbp ?? 0),
    paymentMethod: payment.payment_method as string,
    paymentReference: (payment.payment_reference as string | null) ?? null,
    paymentAccountId: (payment.payment_account_id as string | null) ?? null,
    paymentAccountName: payment.payment_account_id
      ? accountNameById.get(payment.payment_account_id as string) ?? null
      : null,
    notes: (payment.notes as string | null) ?? null,
    paidAt: payment.paid_at as string,
    direction:
      (payment.direction as "received_from_driver" | "paid_to_driver" | null) ?? undefined,
    paymentCategory: (payment.payment_category as string | null) ?? "settlement",
  }));

  const driverChargeLineItems: HireDriverChargeWorkspaceRow[] = mapDriverChargeLineItemsFromDb(
    (chargeRows ?? []) as DriverChargeLineItemDbRow[],
  ).map((item) => ({
    id: item.id,
    chargeType: item.chargeType,
    chargeTypeLabel: hireDriverChargeTypeLabel(item.chargeType),
    amountGbp: item.amountGbp,
    resolution: item.resolution,
    resolutionLabel: hireDriverChargeResolutionLabel(item.resolution),
    description: item.description ?? null,
    createdAt: item.createdAt ?? "",
  }));

  let openDirection = direction;
  let openBalanceGbp = Number(group.settlement_balance_gbp ?? 0);

  if (direction !== "settled") {
    const signed = signedSettlementBalanceGbp(direction, openBalanceGbp);
    const paymentDirection =
      direction === "driver_owes_company" ? "received_from_driver" : "paid_to_driver";
    const remaining = remainingOpenBalanceGbp(
      signed,
      (payments ?? []).map((payment) => ({
        amountGbp: Number(payment.amount_gbp ?? 0),
        direction:
          (payment.direction as "received_from_driver" | "paid_to_driver" | null) ?? paymentDirection,
      })),
    );
    openDirection = openBalanceDirection(remaining);
    openBalanceGbp = Math.abs(remaining);
  } else {
    openDirection = "settled";
    openBalanceGbp = 0;
  }

  const vehicle = group.vehicles as { vrm?: string } | null;

  return {
    ok: true,
    data: {
      hireGroupId: hireGroupId.trim(),
      vehicleVrm: vehicle?.vrm?.trim() || null,
      driverLabel:
        (group.driver_email as string | null)?.trim() ||
        (group.driver_licence_number as string | null)?.trim() ||
        null,
      terminatedAt: (group.terminated_at as string | null) ?? null,
      settlementDirection: openDirection,
      openBalanceGbp,
      payments: mappedPayments,
      driverChargeLineItems,
      notes: (notes ?? []).map((note) => ({
        id: note.id as string,
        body: note.body as string,
        followUpAt: (note.follow_up_at as string | null) ?? null,
        createdAt: note.created_at as string,
      })),
      paymentAccounts,
      defaultPaymentAccountId,
      canWrite: canWriteRentals(profile),
    },
  };
}

export async function resolveHireDepositDispositionAction(input: {
  hireGroupId: string;
  depositDisposition: string;
  depositDispositionReason?: string;
  depositRefundAmountGbp?: number;
  settlementResolution?: string;
  settlementPaymentMethod?: string;
  settlementPaymentReference?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  if (!canWriteRentals(profile)) return { ok: false, error: "You do not have permission." };

  const disposition = parseDepositDisposition(input.depositDisposition.trim());
  if (!disposition) return { ok: false, error: "Choose what to do with the deposit." };
  if (disposition === "hold_pending") {
    return { ok: false, error: "Choose how to resolve the held deposit." };
  }

  const supabase = await createClient();
  const { data: group, error: groupError } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, terminated_at, ended_at, deposit_disposition, settlement_balance_gbp, settlement_balance_direction, termination_settlement",
    )
    .eq("id", input.hireGroupId.trim())
    .maybeSingle();
  if (groupError) return { ok: false, error: groupError.message };
  if (!group) return { ok: false, error: "Hire not found." };

  const status = String(group.status ?? "");
  if (status !== "terminated" && status !== "completed") {
    return { ok: false, error: "Deposit can only be resolved after the contract ends." };
  }
  if (!isDepositDispositionPending(group.deposit_disposition as string | null)) {
    return { ok: false, error: "The deposit has already been resolved." };
  }

  const terminationSummary = parseTerminationAccountsSummary(group.termination_settlement);
  if (!terminationSummary) {
    return { ok: false, error: "Termination settlement details are missing." };
  }
  if (terminationSummary.depositGbp <= 0) {
    return { ok: false, error: "No deposit to resolve." };
  }

  if (!isDepositDispositionAllowed(disposition, terminationSummary.signedRentBalanceGbp)) {
    return { ok: false, error: "The selected deposit option is not valid for this hire." };
  }

  if (requiresDepositDispositionReason(disposition)) {
    const reason = input.depositDispositionReason?.trim() ?? "";
    if (!reason) {
      return {
        ok: false,
        error:
          disposition === "refund_partial"
            ? "Record the reason for the partial deposit refund."
            : "Record why the deposit is not being refunded in full.",
      };
    }
  }

  const direction = (group.settlement_balance_direction as
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null) ?? "settled";
  // Use the gross settlement snapshot stored on the hire row; ledger payments are replayed in the UI.
  const signedGross =
    direction === "settled"
      ? 0
      : signedSettlementBalanceGbp(direction, Number(group.settlement_balance_gbp ?? 0));

  const netSettlementGbp = computeDepositResolutionSettlement({
    currentSignedSettlementGbp: signedGross,
    depositGbp: terminationSummary.depositGbp,
    disposition,
    refundAmountGbp: input.depositRefundAmountGbp,
  });

  const needsSettlementStep = settlementStepRequired(netSettlementGbp);
  const resolution = needsSettlementStep
    ? parseSettlementResolution((input.settlementResolution ?? "").trim())
    : null;

  if (needsSettlementStep) {
    if (!resolution) return { ok: false, error: "Choose how to settle the balance after applying the deposit." };
    if (!availableSettlementResolutions(netSettlementGbp).includes(resolution)) {
      return { ok: false, error: "The selected settlement option is not valid." };
    }
  }

  let balanceState;
  try {
    balanceState = resolveTerminationBalanceState({
      netSettlementGbp,
      resolution: resolution ?? "paid_now",
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid settlement." };
  }

  const settlementPaymentMethod =
    balanceState.recordPayment != null
      ? parseRefundMethod((input.settlementPaymentMethod ?? "").trim())
      : null;
  if (balanceState.recordPayment != null && !settlementPaymentMethod) {
    return { ok: false, error: "Select how the settlement payment was made." };
  }

  const depositReason = requiresDepositDispositionReason(disposition)
    ? input.depositDispositionReason?.trim() || null
    : null;

  const admin = createSupabaseAdminClient();
  const updatedSummary: HireTerminationAccountsSummary = {
    ...terminationSummary,
    netSettlementGbp,
    balanceDirection: balanceState.settlementBalanceDirection,
  };

  const { error: updateError } = await admin
    .from("vehicle_hire_groups")
    .update({
      deposit_disposition: disposition,
      deposit_disposition_reason: depositReason,
      deposit_refund_amount_gbp:
        disposition === "refund_partial" ? Number(input.depositRefundAmountGbp ?? 0) : null,
      termination_settlement: updatedSummary,
      settlement_resolution: resolution,
      settlement_discount_gbp: balanceState.settlementDiscountGbp,
      settlement_balance_gbp: balanceState.settlementBalanceGbp,
      settlement_balance_direction: balanceState.settlementBalanceDirection,
    })
    .eq("id", input.hireGroupId.trim());

  if (updateError) return { ok: false, error: updateError.message };

  if (balanceState.recordPayment && settlementPaymentMethod) {
    const { error: paymentError } = await admin.from("vehicle_hire_balance_payments").insert({
      hire_group_id: input.hireGroupId.trim(),
      amount_gbp: balanceState.recordPayment.amountGbp,
      payment_method: settlementPaymentMethod,
      payment_reference: input.settlementPaymentReference?.trim() || null,
      direction: balanceState.recordPayment.direction,
      notes: "Deposit resolution settlement",
      recorded_by_user_id: user.id,
    });
    if (paymentError) return { ok: false, error: paymentError.message };
  }

  const accrualYmd =
    (group.terminated_at as string | null)?.slice(0, 10) ??
    (group.ended_at as string | null)?.slice(0, 10) ??
    ukTodayYmd();
  const depositCredit = await persistDepositCreditToRentSchedule({
    admin,
    hireGroupId: input.hireGroupId.trim(),
    userId: user.id,
    disposition,
    depositGbp: terminationSummary.depositGbp,
    signedRentBalanceGbp: terminationSummary.signedRentBalanceGbp,
    depositRefundAmountGbp: input.depositRefundAmountGbp,
    accrualYmd,
  });
  if (!depositCredit.ok) return depositCredit;

  await logHireGroupEvent(admin, {
    hireGroupId: input.hireGroupId.trim(),
    eventType: "deposit_disposition_resolved",
    summary: `Deposit resolved: ${hireDepositDispositionLabel(disposition)}. ${settlementBalanceLabel(balanceState.settlementBalanceDirection, balanceState.settlementBalanceGbp)}.`,
    actorRole: "company_staff",
    actorUserId: user.id,
    metadata: {
      disposition,
      depositDispositionReason: depositReason,
      netSettlementGbp,
      settlementResolution: resolution,
    },
  });

  await revalidateHireTermination(input.hireGroupId.trim());
  return { ok: true };
}
