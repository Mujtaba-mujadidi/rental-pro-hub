"use server";

import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { can, canReadRentals } from "@/lib/auth/rental-permissions";
import { ukTodayYmd } from "@/lib/datetime/uk";
import { allocatePaymentAcrossRows } from "@/lib/fleet/hire-payment-allocation";
import {
  canTransitionPaymentStatus,
  resolveHirePaymentWorkflowStatus,
} from "@/lib/fleet/hire-payment-workflow";
import {
  enrichHirePaymentRows,
  summarizeHirePayments,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import type { HirePaymentStatus } from "@/lib/fleet/hire-types";
import {
  formatHirePaymentRowEvents,
  type HirePaymentRowEventDisplay,
} from "@/lib/fleet/hire-payment-row-history";
import { notifyCompanyHirePaymentReviewers, notifyHireDriver } from "@/lib/platform-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "crypto";

export type HirePaymentAccountDisplay = {
  name: string;
  payeeName: string | null;
  sortCode: string | null;
  accountNumberMasked: string | null;
};

export type HirePaymentRowDiscount = {
  id: string;
  amountGbp: number;
  reason: string;
};

export type HirePaymentPageRow = HirePaymentScheduleRowInput & {
  periodLabel: string;
  netDueGbp: number;
  paidGbp: number;
  balanceGbp: number;
  accrued: boolean;
  discounts: HirePaymentRowDiscount[];
};

export type HirePaymentsPageData = {
  hireGroupId: string;
  vehicleVrm: string;
  driverLabel: string | null;
  summary: ReturnType<typeof summarizeHirePayments>;
  rows: HirePaymentPageRow[];
  paymentAccount: HirePaymentAccountDisplay | null;
  canSubmitPayment: boolean;
  canApprovePayments: boolean;
  canApplyDiscount: boolean;
};

type DbScheduleRow = {
  id: string;
  period_start: string;
  period_end: string;
  row_kind: string;
  base_amount_gbp: number;
  payment_status: string;
  approved_amount_gbp: number | null;
  sort_order: number;
  expected_payment_account_id: string | null;
  vehicle_hire_schedule_discounts?: { id: string; amount_gbp: number; reason: string }[];
};

function maskAccountNumber(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `···${digits.slice(-4)}`;
}

function mapDbRow(
  row: DbScheduleRow,
  eventStateByRow: Map<string, PaymentRowEventState>,
): HirePaymentScheduleRowInput {
  const discounts = row.vehicle_hire_schedule_discounts ?? [];
  const discountTotalGbp = discounts.reduce((sum, d) => sum + Number(d.amount_gbp), 0);
  const storedStatus = row.payment_status as HirePaymentStatus;
  const eventState = eventStateByRow.get(row.id);
  const workflowStatus = resolveHirePaymentWorkflowStatus(
    storedStatus,
    eventState?.latestToStatus ?? null,
  );
  const pendingSubmittedGbp =
    workflowStatus === "pending_approval" ? (eventState?.pendingSubmittedGbp ?? null) : null;
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    rowKind: row.row_kind === "deposit" ? "deposit" : "rent",
    baseAmountGbp: Number(row.base_amount_gbp),
    discountTotalGbp,
    paymentStatus: workflowStatus,
    approvedAmountGbp: row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
    pendingSubmittedGbp,
    sortOrder: row.sort_order,
  };
}

type PaymentRowEventState = {
  latestToStatus: string | null;
  pendingSubmittedGbp: number | null;
};

/** Latest status-change event per row, plus submitted amount when awaiting approval. */
async function loadPaymentRowEventState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rowIds: string[],
): Promise<Map<string, PaymentRowEventState>> {
  const map = new Map<string, PaymentRowEventState>();
  if (!rowIds.length) return map;

  const { data, error } = await supabase
    .from("vehicle_hire_payment_status_events")
    .select("schedule_row_id, to_status, amendment_payload, created_at")
    .in("schedule_row_id", rowIds)
    .eq("event_kind", "status_change")
    .order("created_at", { ascending: false });
  if (error) return map;

  const seen = new Set<string>();
  for (const event of data ?? []) {
    const rowId = event.schedule_row_id as string;
    if (seen.has(rowId)) continue;
    seen.add(rowId);
    const toStatus = (event.to_status as string | null) ?? null;
    let pendingSubmittedGbp: number | null = null;
    if (toStatus === "pending_approval") {
      const payload = (event.amendment_payload ?? {}) as { submittedAmountGbp?: number };
      const amount = Number(payload.submittedAmountGbp);
      if (Number.isFinite(amount) && amount > 0) pendingSubmittedGbp = amount;
    }
    map.set(rowId, { latestToStatus: toStatus, pendingSubmittedGbp });
  }
  return map;
}

async function loadPaymentAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string | null,
): Promise<HirePaymentAccountDisplay | null> {
  if (!accountId) return null;
  const { data } = await supabase
    .from("company_payment_accounts")
    .select("name, payee_name, sort_code, account_number")
    .eq("id", accountId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: (data.name as string)?.trim() || "Bank account",
    payeeName: (data.payee_name as string | null)?.trim() || null,
    sortCode: (data.sort_code as string | null)?.trim() || null,
    accountNumberMasked: maskAccountNumber(data.account_number as string | null),
  };
}

function driverHirePaymentsHref(hireGroupId: string): string {
  return `/driver/my-hire?tab=payments&hire=${hireGroupId}`;
}

async function loadHireDriverNotificationContext(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  hireGroupId: string,
): Promise<{ driverUserId: string | null; vehicleVrm: string } | null> {
  const { data: group, error } = await admin
    .from("vehicle_hire_groups")
    .select("driver_user_id, vehicle_id, vehicles(vrm)")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (error || !group) return null;

  let vehicleVrm = (group.vehicles as { vrm?: string } | null)?.vrm?.trim() || "";
  if (!vehicleVrm && group.vehicle_id) {
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("vrm")
      .eq("id", group.vehicle_id as string)
      .maybeSingle();
    vehicleVrm = (vehicle?.vrm as string | undefined)?.trim() || "";
  }

  return {
    driverUserId: (group.driver_user_id as string | null) ?? null,
    vehicleVrm: vehicleVrm || "Vehicle",
  };
}

async function notifyDriverHirePaymentOutcome(
  hireGroupId: string,
  type: "hire_payment_approved" | "hire_payment_rejected" | "hire_payment_amended",
  payload: { amountGbp?: number; comment?: string; previousAmountGbp?: number },
): Promise<void> {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    console.error("notifyDriverHirePaymentOutcome", e);
    return;
  }

  const context = await loadHireDriverNotificationContext(admin, hireGroupId);
  if (!context) return;

  await notifyHireDriver(admin, context.driverUserId, type, {
    hireGroupId,
    vehicleVrm: context.vehicleVrm,
    amountGbp: payload.amountGbp,
    comment: payload.comment,
    previousAmountGbp: payload.previousAmountGbp,
    href: driverHirePaymentsHref(hireGroupId),
  });
}

async function buildPaymentsPageData(
  hireGroupId: string,
  options: { driverUserId?: string },
): Promise<{ ok: true; data: HirePaymentsPageData } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: group, error: groupErr } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, parent_company_id, driver_user_id, driver_email, driver_licence_number, default_payment_account_id, vehicles(vrm)",
    )
    .eq("id", hireGroupId)
    .maybeSingle();
  if (groupErr) return { ok: false, error: groupErr.message };
  if (!group) return { ok: false, error: "Hire not found." };

  if (options.driverUserId && group.driver_user_id !== options.driverUserId) {
    return { ok: false, error: "You are not authorised to view this hire." };
  }

  const { data: schedule, error: schedErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, period_start, period_end, row_kind, base_amount_gbp, payment_status, approved_amount_gbp, sort_order, expected_payment_account_id, vehicle_hire_schedule_discounts(id, amount_gbp, reason)",
    )
    .eq("hire_group_id", hireGroupId)
    .order("sort_order", { ascending: true });
  if (schedErr) return { ok: false, error: schedErr.message };

  const dbRows = (schedule ?? []) as DbScheduleRow[];
  const eventStateByRow = await loadPaymentRowEventState(
    supabase,
    dbRows.map((row) => row.id),
  );

  const inputs = dbRows.map((row) => mapDbRow(row, eventStateByRow));
  const today = ukTodayYmd();
  const summary = summarizeHirePayments(inputs, today);
  const enriched = enrichHirePaymentRows(inputs, today);

  const accountId =
    dbRows.find((r) => r.expected_payment_account_id)?.expected_payment_account_id ??
    (group.default_payment_account_id as string | null);
  const paymentAccount = await loadPaymentAccount(supabase, accountId);

  const vehicle = group.vehicles as { vrm?: string } | null;
  const driverLabel =
    (group.driver_email as string | null)?.trim() ||
    (group.driver_licence_number as string | null)?.trim() ||
    null;

  let canApprovePayments = false;
  let canSubmitPayment = Boolean(options.driverUserId);
  let canApplyDiscount = false;
  if (!options.driverUserId) {
    const { profile } = await requireRentalCompanyArea();
    canApprovePayments = can(profile, "billing.pay");
    canSubmitPayment = can(profile, "rentals.write");
    canApplyDiscount = can(profile, "rentals.write");
  }

  const rows: HirePaymentPageRow[] = enriched.map((row) => {
    const dbRow = dbRows.find((r) => r.id === row.id);
    const discountRows = (dbRow?.vehicle_hire_schedule_discounts ?? []) as {
      id: string;
      amount_gbp: number;
      reason: string;
    }[];
    return {
      ...row,
      periodLabel:
        row.rowKind === "deposit"
          ? "Deposit"
          : row.periodStart === row.periodEnd
            ? row.periodStart
            : `${row.periodStart} – ${row.periodEnd}`,
      discounts: discountRows.map((d) => ({
        id: d.id,
        amountGbp: Number(d.amount_gbp),
        reason: d.reason,
      })),
    };
  });

  return {
    ok: true,
    data: {
      hireGroupId,
      vehicleVrm: vehicle?.vrm?.trim() || "—",
      driverLabel,
      summary,
      rows,
      paymentAccount,
      canSubmitPayment,
      canApprovePayments,
      canApplyDiscount,
    },
  };
}

export async function loadHirePaymentsPageAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HirePaymentsPageData } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  return buildPaymentsPageData(hireGroupId.trim(), {});
}

export async function loadDriverHirePaymentsPageAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HirePaymentsPageData } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };
  return buildPaymentsPageData(hireGroupId.trim(), { driverUserId: user.id });
}

type SubmitPaymentInput = {
  hireGroupId: string;
  amountGbp: number;
  paymentReference?: string | null;
  actor: "driver" | "company_staff";
  userId: string;
};

async function submitHirePaymentAllocation(input: SubmitPaymentInput): Promise<
  { ok: true; submissionId: string } | { ok: false; error: string }
> {
  const hireGroupId = input.hireGroupId.trim();
  if (!hireGroupId) return { ok: false, error: "Hire not found." };

  const amount = Math.round(input.amountGbp * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid payment amount." };

  const page = await buildPaymentsPageData(
    hireGroupId,
    input.actor === "driver" ? { driverUserId: input.userId } : {},
  );
  if (!page.ok) return page;

  if (input.actor === "company_staff") {
    const { profile } = await requireRentalCompanyArea();
    if (!can(profile, "rentals.write")) return { ok: false, error: "You do not have permission." };
  }

  const inputs: HirePaymentScheduleRowInput[] = page.data.rows.map((row) => ({
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

  const allocation = allocatePaymentAcrossRows(amount, inputs, ukTodayYmd());
  if (!allocation.allocations.length) {
    return { ok: false, error: "No outstanding balance on the payment schedule to allocate this payment to." };
  }

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, driver_user_id, driver_email, driver_licence_number, vehicles(vrm)")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (!group) return { ok: false, error: "Hire not found." };

  const submissionId = randomUUID();
  const actorRole = input.actor === "driver" ? "driver" : "company_staff";

  let scheduleWriter = supabase;
  if (input.actor === "driver") {
    try {
      scheduleWriter = createSupabaseAdminClient();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server error." };
    }
  }

  const allocationRowIds = allocation.allocations.map((line) => line.rowId);
  const statusReader = input.actor === "driver" ? scheduleWriter : supabase;
  const submitEventState = await loadPaymentRowEventState(statusReader, allocationRowIds);
  const { data: storedRows, error: storedRowsErr } = await statusReader
    .from("vehicle_hire_payment_schedule")
    .select("id, payment_status")
    .in("id", allocationRowIds);
  if (storedRowsErr) return { ok: false, error: storedRowsErr.message };

  for (const line of allocation.allocations) {
    const row = page.data.rows.find((r) => r.id === line.rowId);
    if (!row) continue;

    const storedStatus = (storedRows?.find((r) => r.id === line.rowId)?.payment_status ??
      row.paymentStatus) as HirePaymentStatus;
    const workflowFromStatus = resolveHirePaymentWorkflowStatus(
      storedStatus,
      submitEventState.get(line.rowId)?.latestToStatus ?? null,
    );
    const toStatus: HirePaymentStatus =
      input.actor === "company_staff" ? "approved" : "pending_approval";

    if (input.actor === "driver") {
      if (workflowFromStatus === "pending_approval") {
        return { ok: false, error: "A payment is already pending approval for one or more periods." };
      }
      if (
        !canTransitionPaymentStatus({
          from: workflowFromStatus,
          to: "pending_approval",
          actor: "driver",
        })
      ) {
        return { ok: false, error: `Cannot apply payment to row ${row.periodLabel}.` };
      }
    } else if (workflowFromStatus !== "not_received" && workflowFromStatus !== "rejected") {
      return { ok: false, error: `Cannot record payment on row ${row.periodLabel}.` };
    }

    const { error: eventErr } = await supabase.from("vehicle_hire_payment_status_events").insert({
      schedule_row_id: line.rowId,
      event_kind: "status_change",
      from_status: workflowFromStatus,
      to_status: toStatus,
      comment: input.paymentReference?.trim() || null,
      amendment_payload: {
        submissionId,
        submittedAmountGbp: line.allocatedGbp,
        paymentReference: input.paymentReference?.trim() || null,
      },
      actor_user_id: input.userId,
      actor_role: actorRole,
    });
    if (eventErr) return { ok: false, error: eventErr.message };

    const updatePayload: Record<string, unknown> = {
      payment_status: toStatus,
    };
    if (toStatus === "approved") {
      const priorPaid = row.paidGbp;
      updatePayload.approved_amount_gbp = Math.round((priorPaid + line.allocatedGbp) * 100) / 100;
    }

    const { data: updatedRow, error: updErr } = await scheduleWriter
      .from("vehicle_hire_payment_schedule")
      .update(updatePayload)
      .eq("id", line.rowId)
      .select("id")
      .maybeSingle();
    if (updErr) return { ok: false, error: updErr.message };
    if (!updatedRow) {
      return { ok: false, error: "Could not update the payment schedule. Please try again." };
    }
  }

  // Staff recording payment skips inbox; drivers notify finance.
  if (input.actor === "driver") {
    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server error." };
    }

    const vehicle = group.vehicles as { vrm?: string } | null;
    const driverLabel =
      (group.driver_email as string | null)?.trim() ||
      (group.driver_licence_number as string | null)?.trim() ||
      "Driver";

    await notifyCompanyHirePaymentReviewers(admin, group.parent_company_id as string, "hire_payment_submitted", {
      hireGroupId,
      submissionId,
      vehicleVrm: vehicle?.vrm?.trim() || "Vehicle",
      driverLabel,
      amountGbp: amount,
      allocatedPeriods: allocation.allocations.map((a) => ({
        periodStart: a.periodStart,
        periodEnd: a.periodEnd,
        amountGbp: a.allocatedGbp,
      })),
      href: `/rental/hires/${hireGroupId}/payments?submission=${submissionId}`,
    });
  }

  return { ok: true, submissionId };
}

export async function submitDriverHirePaymentAction(input: {
  hireGroupId: string;
  amountGbp: number;
  paymentReference?: string | null;
}): Promise<{ ok: true; submissionId: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };
  return submitHirePaymentAllocation({
    hireGroupId: input.hireGroupId,
    amountGbp: input.amountGbp,
    paymentReference: input.paymentReference,
    actor: "driver",
    userId: user.id,
  });
}

export async function submitStaffHirePaymentAction(input: {
  hireGroupId: string;
  amountGbp: number;
  paymentReference?: string | null;
}): Promise<{ ok: true; submissionId: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };
  return submitHirePaymentAllocation({
    hireGroupId: input.hireGroupId,
    amountGbp: input.amountGbp,
    paymentReference: input.paymentReference,
    actor: "company_staff",
    userId: user.id,
  });
}

/** Mark a single schedule row as paid (staff only, immediate approval). */
export async function recordStaffHirePaymentRowAction(
  scheduleRowId: string,
  paymentReference?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "rentals.write")) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: scheduleRow, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, hire_group_id, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
    )
    .eq("id", scheduleRowId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!scheduleRow) return { ok: false, error: "Payment row not found." };

  const page = await buildPaymentsPageData(scheduleRow.hire_group_id as string, {});
  if (!page.ok) return page;

  const row = page.data.rows.find((r) => r.id === scheduleRowId);
  if (!row) return { ok: false, error: "Payment row not found." };
  if (row.balanceGbp <= 0) return { ok: false, error: "This row has no outstanding balance." };
  if (row.paymentStatus === "pending_approval") {
    return { ok: false, error: "A payment is already pending approval for this row." };
  }
  if (row.paymentStatus !== "not_received" && row.paymentStatus !== "rejected") {
    return { ok: false, error: "This row cannot be marked paid directly." };
  }

  const fromStatus = row.paymentStatus;
  const approvedAmount = Math.round((row.paidGbp + row.balanceGbp) * 100) / 100;

  const { error: eventErr } = await supabase.from("vehicle_hire_payment_status_events").insert({
    schedule_row_id: scheduleRowId,
    event_kind: "status_change",
    from_status: fromStatus,
    to_status: "approved",
    comment: paymentReference?.trim() || null,
    amendment_payload: {
      submittedAmountGbp: row.balanceGbp,
      paymentReference: paymentReference?.trim() || null,
      directRowPayment: true,
    },
    actor_user_id: user.id,
    actor_role: "company_staff",
  });
  if (eventErr) return { ok: false, error: eventErr.message };

  const { error: updErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .update({ payment_status: "approved", approved_amount_gbp: approvedAmount })
    .eq("id", scheduleRowId);
  if (updErr) return { ok: false, error: updErr.message };

  return { ok: true };
}

export async function approveHirePaymentRowAction(
  scheduleRowId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "billing.pay")) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, hire_group_id, payment_status, approved_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp), base_amount_gbp",
    )
    .eq("id", scheduleRowId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const fromStatus = row.payment_status as HirePaymentStatus;
  const eventState = await loadPaymentRowEventState(supabase, [scheduleRowId]);
  const state = eventState.get(scheduleRowId);
  const workflowFromStatus = resolveHirePaymentWorkflowStatus(
    fromStatus,
    state?.latestToStatus ?? null,
  );
  const submitted =
    workflowFromStatus === "pending_approval" ? (state?.pendingSubmittedGbp ?? null) : null;
  if (
    !canTransitionPaymentStatus({ from: workflowFromStatus, to: "approved", actor: "company_staff" })
  ) {
    return { ok: false, error: "This payment cannot be approved." };
  }

  if (submitted == null) return { ok: false, error: "No submitted amount found for this row." };

  const discounts = (row.vehicle_hire_schedule_discounts ?? []) as { amount_gbp: number }[];
  const discountTotal = discounts.reduce((sum, d) => sum + Number(d.amount_gbp), 0);
  const priorApproved = row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : 0;
  const approvedAmount = Math.round((priorApproved + submitted) * 100) / 100;

  const { error: eventErr } = await supabase.from("vehicle_hire_payment_status_events").insert({
    schedule_row_id: scheduleRowId,
    event_kind: "status_change",
    from_status: workflowFromStatus,
    to_status: "approved",
    amendment_payload: { approvedAmountGbp: approvedAmount },
    actor_user_id: user.id,
    actor_role: "company_staff",
  });
  if (eventErr) return { ok: false, error: eventErr.message };

  const { error: updErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .update({ payment_status: "approved", approved_amount_gbp: approvedAmount })
    .eq("id", scheduleRowId);
  if (updErr) return { ok: false, error: updErr.message };

  await notifyDriverHirePaymentOutcome(row.hire_group_id as string, "hire_payment_approved", {
    amountGbp: submitted,
  });

  return { ok: true };
}

export async function rejectHirePaymentRowAction(input: {
  scheduleRowId: string;
  comment: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "billing.pay")) return { ok: false, error: "You do not have permission." };

  const comment = input.comment.trim();
  if (!comment) return { ok: false, error: "A reason is required when rejecting a payment." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select("id, hire_group_id, payment_status")
    .eq("id", input.scheduleRowId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const fromStatus = row.payment_status as HirePaymentStatus;
  const eventState = await loadPaymentRowEventState(supabase, [input.scheduleRowId]);
  const state = eventState.get(input.scheduleRowId);
  const workflowFromStatus = resolveHirePaymentWorkflowStatus(
    fromStatus,
    state?.latestToStatus ?? null,
  );
  if (
    !canTransitionPaymentStatus({
      from: workflowFromStatus,
      to: "rejected",
      actor: "company_staff",
      comment,
    })
  ) {
    return { ok: false, error: "This payment cannot be rejected." };
  }

  const { error: eventErr } = await supabase.from("vehicle_hire_payment_status_events").insert({
    schedule_row_id: input.scheduleRowId,
    event_kind: "status_change",
    from_status: workflowFromStatus,
    to_status: "rejected",
    comment,
    actor_user_id: user.id,
    actor_role: "company_staff",
  });
  if (eventErr) return { ok: false, error: eventErr.message };

  const { error: updErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .update({ payment_status: "rejected" })
    .eq("id", input.scheduleRowId);
  if (updErr) return { ok: false, error: updErr.message };

  const pendingAmount = state?.pendingSubmittedGbp;
  await notifyDriverHirePaymentOutcome(row.hire_group_id as string, "hire_payment_rejected", {
    amountGbp: pendingAmount ?? undefined,
    comment,
  });

  return { ok: true };
}

export async function amendApprovedHirePaymentRowAction(input: {
  scheduleRowId: string;
  approvedAmountGbp: number;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "billing.pay")) return { ok: false, error: "You do not have permission." };

  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required when amending an approved payment." };

  const newAmount = Math.round(input.approvedAmountGbp * 100) / 100;
  if (!Number.isFinite(newAmount) || newAmount < 0) {
    return { ok: false, error: "Enter a valid approved amount." };
  }

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, hire_group_id, payment_status, approved_amount_gbp, base_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
    )
    .eq("id", input.scheduleRowId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const fromStatus = row.payment_status as HirePaymentStatus;
  if (fromStatus !== "approved") {
    return { ok: false, error: "Only approved payments can be amended." };
  }
  if (
    !canTransitionPaymentStatus({
      from: fromStatus,
      to: "approved",
      actor: "company_staff",
      comment: reason,
    })
  ) {
    return { ok: false, error: "This payment cannot be amended." };
  }

  const discounts = (row.vehicle_hire_schedule_discounts ?? []) as { amount_gbp: number }[];
  const discountTotal = discounts.reduce((sum, d) => sum + Number(d.amount_gbp), 0);
  const netDue = Math.round((Number(row.base_amount_gbp) - discountTotal) * 100) / 100;
  if (newAmount > netDue) {
    return { ok: false, error: `Approved amount cannot exceed ${netDue.toFixed(2)} for this period.` };
  }

  const priorApproved = row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : 0;
  if (Math.abs(newAmount - priorApproved) < 0.005) {
    return { ok: false, error: "Enter a different approved amount to amend this row." };
  }

  const { error: eventErr } = await supabase.from("vehicle_hire_payment_status_events").insert({
    schedule_row_id: input.scheduleRowId,
    event_kind: "amendment",
    from_status: fromStatus,
    to_status: "approved",
    comment: reason,
    amendment_payload: {
      previousApprovedAmountGbp: priorApproved,
      newApprovedAmountGbp: newAmount,
    },
    actor_user_id: user.id,
    actor_role: "company_staff",
  });
  if (eventErr) return { ok: false, error: eventErr.message };

  const { error: updErr } = await supabase
    .from("vehicle_hire_payment_schedule")
    .update({ approved_amount_gbp: newAmount })
    .eq("id", input.scheduleRowId);
  if (updErr) return { ok: false, error: updErr.message };

  await notifyDriverHirePaymentOutcome(row.hire_group_id as string, "hire_payment_amended", {
    amountGbp: newAmount,
    comment: reason,
    previousAmountGbp: priorApproved,
  });

  return { ok: true };
}

export async function previewHirePaymentAllocationAction(input: {
  hireGroupId: string;
  amountGbp: number;
  asDriver?: boolean;
}): Promise<
  | { ok: true; allocation: ReturnType<typeof allocatePaymentAcrossRows> }
  | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const page = await buildPaymentsPageData(
    input.hireGroupId.trim(),
    input.asDriver ? { driverUserId: user.id } : {},
  );
  if (!page.ok) return page;

  if (!input.asDriver) {
    const { profile } = await requireRentalCompanyArea();
    if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  }

  const inputs: HirePaymentScheduleRowInput[] = page.data.rows.map((row) => ({
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

  return {
    ok: true,
    allocation: allocatePaymentAcrossRows(input.amountGbp, inputs, ukTodayYmd()),
  };
}

export async function applyHirePaymentDiscountAction(input: {
  scheduleRowId: string;
  amountGbp: number;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const { profile } = await requireRentalCompanyArea();
  if (!can(profile, "rentals.write")) return { ok: false, error: "You do not have permission." };

  const scheduleRowId = input.scheduleRowId.trim();
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required for the discount." };

  const amount = Math.round(input.amountGbp * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid discount amount." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select(
      "id, payment_status, base_amount_gbp, approved_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)",
    )
    .eq("id", scheduleRowId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const status = row.payment_status as HirePaymentStatus;
  if (status === "pending_approval") {
    return { ok: false, error: "Cannot apply a discount while a payment is pending approval." };
  }
  if (status === "approved") {
    return { ok: false, error: "This row is already fully paid." };
  }

  const discounts = (row.vehicle_hire_schedule_discounts ?? []) as { amount_gbp: number }[];
  const existingDiscount = discounts.reduce((sum, d) => sum + Number(d.amount_gbp), 0);
  const base = Number(row.base_amount_gbp);
  const maxDiscount = Math.max(0, Math.round((base - existingDiscount) * 100) / 100);
  if (amount > maxDiscount) {
    return { ok: false, error: `Discount cannot exceed ${maxDiscount.toFixed(2)} on this row.` };
  }

  const { error: insertErr } = await supabase.from("vehicle_hire_schedule_discounts").insert({
    schedule_row_id: scheduleRowId,
    amount_gbp: amount,
    reason,
    applied_by_user_id: user.id,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  return { ok: true };
}

export async function loadHirePaymentRowEventsAction(
  scheduleRowId: string,
): Promise<{ ok: true; events: HirePaymentRowEventDisplay[] } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const id = scheduleRowId.trim();
  if (!id) return { ok: false, error: "Payment row not found." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("vehicle_hire_payment_schedule")
    .select("id, vehicle_hire_groups(driver_user_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Payment row not found." };

  const groupRaw = row.vehicle_hire_groups as
    | { driver_user_id: string | null }
    | { driver_user_id: string | null }[]
    | null;
  const group = Array.isArray(groupRaw) ? (groupRaw[0] ?? null) : groupRaw;
  const isDriver = group?.driver_user_id === user.id;
  if (!isDriver) {
    const { profile } = await requireRentalCompanyArea();
    if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  }

  const { data: events, error: eventsErr } = await supabase
    .from("vehicle_hire_payment_status_events")
    .select("id, event_kind, from_status, to_status, comment, amendment_payload, actor_role, created_at")
    .eq("schedule_row_id", id)
    .order("created_at", { ascending: true });
  if (eventsErr) return { ok: false, error: eventsErr.message };

  const mapped = (events ?? []).map((event) => ({
    id: event.id as string,
    eventKind: event.event_kind as "status_change" | "reply" | "amendment",
    fromStatus: (event.from_status as string | null) ?? null,
    toStatus: (event.to_status as string | null) ?? null,
    comment: (event.comment as string | null) ?? null,
    amendmentPayload: (event.amendment_payload as Record<string, unknown> | null) ?? null,
    actorRole: event.actor_role as "company_staff" | "driver",
    createdAt: event.created_at as string,
  }));

  return { ok: true, events: formatHirePaymentRowEvents(mapped) };
}
