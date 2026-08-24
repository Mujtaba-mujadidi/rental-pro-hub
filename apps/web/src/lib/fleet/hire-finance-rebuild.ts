import "server-only";

import {
  buildHireFinancialSummarySnapshot,
  computeActiveHireAccountPosition,
  computeHireExtraChargeLineMoney,
  computeHireIncomeGbp,
  computeHireSchedulePaymentSummary,
} from "@/lib/fleet/hire-finance";
import { EXTRA_CHARGE_PAYMENT_EVENT_TYPES } from "@/lib/fleet/hire-driver-charge-payment";
import {
  mapDriverChargeLineItemsFromDb,
  type DriverChargeLineItemDbRow,
} from "@/lib/fleet/hire-driver-charges";
import type { HireIncomeGroupContext } from "@/lib/fleet/hire-income";
import type { HirePaymentScheduleRowInput } from "@/lib/fleet/hire-payment-summary";
import type { HirePaymentStatus, RentCadence } from "@/lib/fleet/hire-types";
import { ukTodayYmd } from "@/lib/datetime/uk";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

function asYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/**
 * Rebuild hire finance read-model after payment / charge mutations.
 * Caller must already have authorised the mutation; this uses the service role.
 */
export async function rebuildHireFinancialSummary(hireGroupId: string): Promise<void> {
  const id = hireGroupId.trim();
  if (!id) return;

  const admin = createSupabaseAdminClient();
  const todayYmd = ukTodayYmd();

  const { data: group, error: groupErr } = await admin
    .from("vehicle_hire_groups")
    .select(
      "id, vehicle_id, parent_company_id, status, terminated_at, ended_at, rent_cadence, settlement_discount_gbp, settlement_balance_direction, deposit_disposition, deposit_refund_amount_gbp",
    )
    .eq("id", id)
    .maybeSingle();
  if (groupErr || !group) {
    console.error("rebuildHireFinancialSummary: group", groupErr?.message ?? "missing");
    return;
  }

  const parentCompanyId = String(group.parent_company_id ?? "");
  const vehicleId = String(group.vehicle_id ?? "");
  if (!parentCompanyId || !vehicleId) return;

  const [
    { data: scheduleRows },
    { data: balanceRows },
    { data: chargeRows },
    { data: eventRows },
  ] = await Promise.all([
    admin
      .from("vehicle_hire_payment_schedule")
      .select(
        "id, period_start, period_end, row_kind, base_amount_gbp, payment_status, approved_amount_gbp, sort_order, vehicle_hire_schedule_discounts(amount_gbp)",
      )
      .eq("hire_group_id", id)
      .order("sort_order", { ascending: true }),
    admin
      .from("vehicle_hire_balance_payments")
      .select("id, amount_gbp, direction, payment_category, paid_at")
      .eq("hire_group_id", id)
      .order("paid_at", { ascending: true }),
    admin
      .from("vehicle_hire_driver_charge_line_items")
      .select(
        "id, hire_group_id, charge_type, amount_gbp, resolution, source_kind, source_id, description, balance_payment_id, charged_on, created_at",
      )
      .eq("hire_group_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("vehicle_hire_group_events")
      .select("event_type, created_at, metadata")
      .eq("hire_group_id", id)
      .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
      .order("created_at", { ascending: true }),
  ]);

  const paymentSchedule: HirePaymentScheduleRowInput[] = (scheduleRows ?? []).map((row, index) => {
    const discounts = (row.vehicle_hire_schedule_discounts as { amount_gbp: number }[] | null) ?? [];
    const discountTotalGbp = discounts.reduce((sum, d) => sum + Number(d.amount_gbp ?? 0), 0);
    return {
      id: row.id as string,
      periodStart: String(row.period_start),
      periodEnd: String(row.period_end),
      rowKind: row.row_kind === "deposit" ? "deposit" : "rent",
      baseAmountGbp: Number(row.base_amount_gbp ?? 0),
      discountTotalGbp: roundGbp(discountTotalGbp),
      paymentStatus: String(row.payment_status ?? "not_received") as HirePaymentStatus,
      approvedAmountGbp:
        row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : null,
      pendingSubmittedGbp: null,
      sortOrder: Number(row.sort_order ?? index),
    };
  });

  const charges = mapDriverChargeLineItemsFromDb((chargeRows ?? []) as DriverChargeLineItemDbRow[]);

  const timedExtraPayments = (balanceRows ?? [])
    .filter(
      (payment) =>
        String(payment.payment_category ?? "") === "driver_charge" &&
        String(payment.direction ?? "") === "received_from_driver",
    )
    .map((payment) => ({
      id: payment.id as string,
      amountGbp: Number(payment.amount_gbp ?? 0),
      paidAt: String(payment.paid_at ?? ""),
    }))
    .filter((payment) => payment.id && payment.paidAt && payment.amountGbp > 0);

  const allocationEvents = (eventRows ?? []).map((event) => ({
    eventType: String(event.event_type ?? ""),
    metadata: (event.metadata as Record<string, unknown> | null) ?? null,
  }));

  const extras = computeHireExtraChargeLineMoney({
    charges,
    timedPayments: timedExtraPayments,
    allocationEvents,
  });
  const scheduleSummary = computeHireSchedulePaymentSummary(paymentSchedule, todayYmd);

  const groupContext: HireIncomeGroupContext = {
    contractEndedYmd:
      asYmd(group.terminated_at as string | null) ?? asYmd(group.ended_at as string | null),
    rentCadence: ((group.rent_cadence as RentCadence) ?? "weekly") as RentCadence,
    rentBillingMode: "end_of_period",
    settlementWriteOffGbp: Number(group.settlement_discount_gbp ?? 0),
    depositDisposition: (group.deposit_disposition as string | null) ?? null,
    depositRefundAmountGbp:
      group.deposit_refund_amount_gbp != null ? Number(group.deposit_refund_amount_gbp) : null,
    depositGbp: 0,
    signedRentBalanceGbp: null,
    settlementSettled: String(group.settlement_balance_direction ?? "") === "settled",
  };

  const income = computeHireIncomeGbp({
    scheduleRows: paymentSchedule.map((row) => ({
      hireGroupId: id,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      rowKind: row.rowKind,
      paymentStatus: row.paymentStatus,
      approvedAmountGbp: row.approvedAmountGbp,
      baseAmountGbp: row.baseAmountGbp,
      discountTotalGbp: row.discountTotalGbp,
    })),
    balancePayments: (balanceRows ?? []).map((payment) => ({
      hireGroupId: id,
      amountGbp: Number(payment.amount_gbp ?? 0),
      direction: (payment.direction as string | null) ?? null,
      paymentCategory: (payment.payment_category as string | null) ?? null,
    })),
    driverChargeLineItems: charges,
    groupContextByGroupId: new Map([[id, groupContext]]),
    todayYmd,
  });

  const depositReceivedGbp = roundGbp(
    paymentSchedule
      .filter((row) => row.rowKind === "deposit")
      .reduce((sum, row) => sum + (row.approvedAmountGbp ?? 0), 0),
  );

  const accountPosition = computeActiveHireAccountPosition({
    depositRequiredGbp: depositReceivedGbp,
    depositReceivedGbp,
    rentChargedAfterDiscountGbp: scheduleSummary.totalDueGbp,
    rentPaidConfirmedGbp: scheduleSummary.totalPaidGbp,
    extraChargesOutstandingGbp: extras.outstandingGbp,
  });

  const snapshot = buildHireFinancialSummarySnapshot({
    hireGroupId: id,
    parentCompanyId,
    vehicleId,
    scheduleSummary,
    extras,
    income,
    accountPosition,
  });

  const nowIso = new Date().toISOString();
  const { error: upsertErr } = await admin.from("vehicle_hire_financial_summary").upsert(
    {
      hire_group_id: snapshot.hireGroupId,
      parent_company_id: snapshot.parentCompanyId,
      vehicle_id: snapshot.vehicleId,
      rent_due_gbp: snapshot.rentDueGbp,
      rent_paid_gbp: snapshot.rentPaidGbp,
      rent_outstanding_gbp: snapshot.rentOutstandingGbp,
      extras_posted_gbp: snapshot.extrasPostedGbp,
      extras_paid_gbp: snapshot.extrasPaidGbp,
      extras_outstanding_gbp: snapshot.extrasOutstandingGbp,
      schedule_rent_income_gbp: snapshot.scheduleRentIncomeGbp,
      driver_charge_income_gbp: snapshot.driverChargeIncomeGbp,
      deposit_retention_income_gbp: snapshot.depositRetentionIncomeGbp,
      supplemental_collections_gbp: snapshot.supplementalCollectionsGbp,
      settlement_write_offs_gbp: snapshot.settlementWriteOffsGbp,
      net_hire_income_gbp: snapshot.netHireIncomeGbp,
      open_balance_gbp: snapshot.openBalanceGbp,
      open_direction: snapshot.openDirection,
      rebuilt_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: "hire_group_id" },
  );
  if (upsertErr) {
    console.error("rebuildHireFinancialSummary: summary upsert", upsertErr.message);
  }

  for (const line of snapshot.chargeLines) {
    const { error: lineErr } = await admin
      .from("vehicle_hire_driver_charge_line_items")
      .update({
        paid_gbp: line.paidGbp,
        collection_status: line.collectionStatus,
      })
      .eq("id", line.chargeLineItemId)
      .eq("hire_group_id", id)
      .eq("parent_company_id", parentCompanyId);
    if (lineErr) {
      console.error(
        "rebuildHireFinancialSummary: charge line",
        line.chargeLineItemId,
        lineErr.message,
      );
    }
  }

  const { error: deleteAllocErr } = await admin
    .from("vehicle_hire_payment_allocations")
    .delete()
    .eq("hire_group_id", id)
    .eq("target_type", "driver_charge_line");
  if (deleteAllocErr) {
    console.error("rebuildHireFinancialSummary: clear allocations", deleteAllocErr.message);
    return;
  }

  if (snapshot.allocations.length) {
    const { error: insertAllocErr } = await admin.from("vehicle_hire_payment_allocations").insert(
      snapshot.allocations.map((allocation) => ({
        hire_group_id: id,
        parent_company_id: parentCompanyId,
        balance_payment_id: allocation.paymentId,
        target_type: "driver_charge_line",
        target_id: allocation.chargeLineItemId,
        amount_gbp: allocation.allocatedGbp,
      })),
    );
    if (insertAllocErr) {
      console.error("rebuildHireFinancialSummary: insert allocations", insertAllocErr.message);
    }
  }
}
