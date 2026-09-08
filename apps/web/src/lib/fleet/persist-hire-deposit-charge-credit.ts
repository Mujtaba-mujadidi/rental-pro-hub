import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import {
  mapDriverChargeLineItemFromDb,
  type DriverChargeLineItemDbRow,
} from "@/lib/fleet/hire-driver-charges";
import {
  allocateExtraChargePaymentAcrossRows,
  buildExtraChargePaymentTableRows,
  EXTRA_CHARGE_PAYMENT_EVENT_TYPES,
} from "@/lib/fleet/hire-driver-charge-payment";
import { roundGbp } from "@/lib/fleet/hire-money";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHARGE_LINE_SELECT =
  "id, hire_group_id, charge_type, amount_gbp, resolution, source_kind, source_id, description, balance_payment_id, charged_on, created_at, paid_gbp, collection_status";

/**
 * Record deposit apply-to-balance against outstanding extra charges using the same
 * FIFO allocator as staff extra-charge payments (vehicle P&L realises driver_charge receipts).
 */
export async function persistDepositCreditToDriverCharges(input: {
  admin: SupabaseClient;
  hireGroupId: string;
  parentCompanyId: string;
  userId: string;
  amountGbp: number;
  paidAtIso: string;
}): Promise<{ ok: true; creditAppliedGbp: number } | { ok: false; error: string }> {
  const amount = roundGbp(Math.max(0, input.amountGbp));
  if (amount <= 0.005) return { ok: true, creditAppliedGbp: 0 };

  const [{ data: chargeRows, error: chargeError }, { data: receipts, error: receiptError }, { data: eventRows, error: eventError }] =
    await Promise.all([
      input.admin
        .from("vehicle_hire_driver_charge_line_items")
        .select(CHARGE_LINE_SELECT)
        .eq("hire_group_id", input.hireGroupId)
        .eq("parent_company_id", input.parentCompanyId),
      input.admin
        .from("vehicle_hire_balance_payments")
        .select("id, amount_gbp, direction, payment_category, paid_at")
        .eq("hire_group_id", input.hireGroupId),
      input.admin
        .from("vehicle_hire_group_events")
        .select("event_type, metadata")
        .eq("hire_group_id", input.hireGroupId)
        .in("event_type", [...EXTRA_CHARGE_PAYMENT_EVENT_TYPES])
        .order("created_at", { ascending: true }),
    ]);
  if (chargeError) return { ok: false, error: chargeError.message };
  if (receiptError) return { ok: false, error: receiptError.message };
  if (eventError) return { ok: false, error: eventError.message };

  const mappedCharges = (chargeRows ?? [])
    .map((row) => mapDriverChargeLineItemFromDb(row as DriverChargeLineItemDbRow))
    .filter((row): row is NonNullable<typeof row> => row != null);

  const receiptRows = (receipts ?? []).map((payment) => ({
    amountGbp: Number(payment.amount_gbp ?? 0),
    direction: (payment.direction as string | null) ?? null,
    paymentCategory: (payment.payment_category as string | null) ?? "settlement",
  }));

  const timedPayments = (receipts ?? [])
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

  const allocationEvents = (eventRows ?? []).map((event) => ({
    eventType: String(event.event_type ?? ""),
    metadata: (event.metadata as Record<string, unknown> | null) ?? {},
  }));

  const tableRows = buildExtraChargePaymentTableRows({
    charges: mappedCharges,
    receipts: receiptRows,
    timedPayments,
    allocationEvents,
  });

  const allocation = allocateExtraChargePaymentAcrossRows(amount, tableRows);
  if (!allocation.allocations.length) {
    return { ok: true, creditAppliedGbp: 0 };
  }

  const appliedGbp = roundGbp(
    allocation.allocations.reduce((sum, line) => sum + line.allocatedGbp, 0),
  );
  if (appliedGbp <= 0.005) return { ok: true, creditAppliedGbp: 0 };

  const { data: insertedPayment, error: insertError } = await input.admin
    .from("vehicle_hire_balance_payments")
    .insert({
      hire_group_id: input.hireGroupId,
      amount_gbp: appliedGbp,
      payment_method: "other",
      payment_account_id: null,
      payment_reference: null,
      direction: "received_from_driver",
      payment_category: "driver_charge",
      notes: "Deposit applied to balance",
      paid_at: input.paidAtIso,
      recorded_by_user_id: input.userId,
    })
    .select("id")
    .maybeSingle();
  if (insertError) return { ok: false, error: insertError.message };
  if (!insertedPayment?.id) {
    return { ok: false, error: "Could not record the deposit against extra charges." };
  }

  const logRes = await logHireGroupEvent(input.admin, {
    hireGroupId: input.hireGroupId,
    eventType: "driver_charge_payment_recorded",
    summary: `Applied £${appliedGbp.toFixed(2)} deposit to extra charges.`,
    actorRole: "company_staff",
    actorUserId: input.userId,
    metadata: {
      balancePaymentId: insertedPayment.id,
      amountGbp: appliedGbp,
      paymentMethod: "other",
      source: "deposit_apply_to_balance",
      allocations: allocation.allocations.map((line) => ({
        chargeLineItemId: line.rowId,
        amountGbp: line.allocatedGbp,
        label: line.label,
      })),
    },
  });
  if (!logRes.ok) return logRes;

  return { ok: true, creditAppliedGbp: appliedGbp };
}
