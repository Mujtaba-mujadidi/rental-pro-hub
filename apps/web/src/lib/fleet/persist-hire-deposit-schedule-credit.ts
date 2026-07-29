import { allocatePaymentAcrossRows } from "@/lib/fleet/hire-payment-allocation";
import { depositRentScheduleCreditGbp } from "@/lib/fleet/hire-deposit-schedule-allocation";
import {
  hirePaymentRowPaidGbp,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import type { HireDepositDisposition } from "@/lib/fleet/hire-termination-summary";
import type { SupabaseClient } from "@supabase/supabase-js";

type ScheduleDbRow = {
  id: string;
  period_start: string;
  period_end: string;
  row_kind: string;
  base_amount_gbp: number;
  payment_status: string;
  approved_amount_gbp: number | null;
  sort_order: number;
  vehicle_hire_schedule_discounts?: { amount_gbp: number }[];
};

function mapScheduleDbRow(row: ScheduleDbRow): HirePaymentScheduleRowInput {
  const discounts = row.vehicle_hire_schedule_discounts ?? [];
  const discountTotalGbp = discounts.reduce((sum, item) => sum + Number(item.amount_gbp), 0);
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    rowKind: row.row_kind === "deposit" ? "deposit" : "rent",
    baseAmountGbp: Number(row.base_amount_gbp),
    discountTotalGbp,
    paymentStatus: row.payment_status as HirePaymentScheduleRowInput["paymentStatus"],
    approvedAmountGbp: row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
    pendingSubmittedGbp: null,
    sortOrder: row.sort_order,
  };
}

/** Persist deposit rent credit onto accrued schedule rows (termination + deposit resolution). */
export async function persistDepositCreditToRentSchedule(input: {
  admin: SupabaseClient;
  hireGroupId: string;
  userId: string;
  disposition: HireDepositDisposition | string;
  depositGbp: number;
  signedRentBalanceGbp: number;
  depositRefundAmountGbp?: number | null;
  accrualYmd: string;
  scheduleRows?: HirePaymentScheduleRowInput[];
}): Promise<{ ok: true; creditAppliedGbp: number } | { ok: false; error: string }> {
  const creditGbp = depositRentScheduleCreditGbp({
    disposition: input.disposition,
    depositGbp: input.depositGbp,
    signedRentBalanceGbp: input.signedRentBalanceGbp,
    depositRefundAmountGbp: input.depositRefundAmountGbp,
  });
  if (creditGbp <= 0.005) return { ok: true, creditAppliedGbp: 0 };

  let scheduleRows = input.scheduleRows;
  if (!scheduleRows) {
    const { data, error } = await input.admin
      .from("vehicle_hire_payment_schedule")
      .select(
        "id, period_start, period_end, row_kind, base_amount_gbp, payment_status, approved_amount_gbp, sort_order, vehicle_hire_schedule_discounts(amount_gbp)",
      )
      .eq("hire_group_id", input.hireGroupId)
      .order("sort_order", { ascending: true });
    if (error) return { ok: false, error: error.message };
    scheduleRows = (data ?? []).map((row) => mapScheduleDbRow(row as ScheduleDbRow));
  }

  const allocation = allocatePaymentAcrossRows(creditGbp, scheduleRows, input.accrualYmd, {
    accruedOnly: true,
  });
  if (!allocation.allocations.length) return { ok: true, creditAppliedGbp: 0 };

  for (const line of allocation.allocations) {
    const row = scheduleRows.find((item) => item.id === line.rowId);
    if (!row) continue;

    const priorPaid = hirePaymentRowPaidGbp(row);
    const approvedAmount = Math.round((priorPaid + line.allocatedGbp) * 100) / 100;

    const { error: eventErr } = await input.admin.from("vehicle_hire_payment_status_events").insert({
      schedule_row_id: line.rowId,
      event_kind: "status_change",
      from_status: row.paymentStatus,
      to_status: "approved",
      comment: "Deposit applied to rent at contract end",
      amendment_payload: {
        depositAppliedGbp: line.allocatedGbp,
        approvedAmountGbp: approvedAmount,
      },
      actor_user_id: input.userId,
      actor_role: "company_staff",
    });
    if (eventErr) return { ok: false, error: eventErr.message };

    const { error: updErr } = await input.admin
      .from("vehicle_hire_payment_schedule")
      .update({
        payment_status: "approved",
        approved_amount_gbp: approvedAmount,
      })
      .eq("id", line.rowId);
    if (updErr) return { ok: false, error: updErr.message };
  }

  return { ok: true, creditAppliedGbp: creditGbp };
}
