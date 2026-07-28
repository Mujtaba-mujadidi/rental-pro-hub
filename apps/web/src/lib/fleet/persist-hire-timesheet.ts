import type { SupabaseClient } from "@supabase/supabase-js";
import { generateRentScheduleRows, withDepositRow } from "@/lib/fleet/hire-payment-schedule";
import type { RentCadence } from "@/lib/fleet/hire-types";

const BLOCKING_PAYMENT_STATUSES = new Set(["approved", "pending_approval"]);

export async function persistHireTimesheetForGroup(
  db: SupabaseClient,
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: group, error: gErr } = await db
    .from("vehicle_hire_groups")
    .select(
      "id, start_date, rent_cadence, rent_amount_gbp, deposit_gbp, default_payment_account_id, vehicle_hire_agreements(end_date)",
    )
    .eq("id", hireGroupId)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!group) return { ok: false, error: "Hire group not found." };

  const { data: existingRows, error: existingErr } = await db
    .from("vehicle_hire_payment_schedule")
    .select("payment_status, approved_amount_gbp")
    .eq("hire_group_id", hireGroupId);
  if (existingErr) return { ok: false, error: existingErr.message };

  const hasRecordedPayments = (existingRows ?? []).some((row) => {
    const status = String(row.payment_status ?? "");
    if (BLOCKING_PAYMENT_STATUSES.has(status)) return true;
    return Number(row.approved_amount_gbp ?? 0) > 0.005;
  });
  if (hasRecordedPayments) {
    return {
      ok: false,
      error: "Cannot regenerate the payment schedule while payments have been recorded or are awaiting approval.",
    };
  }

  const g = group as {
    start_date: string;
    rent_cadence: RentCadence;
    rent_amount_gbp: number;
    deposit_gbp: number | null;
    default_payment_account_id: string | null;
    vehicle_hire_agreements?: { end_date: string }[];
  };

  const ends = (g.vehicle_hire_agreements ?? []).map((a) => a.end_date);
  const endDate = ends.sort().at(-1);
  if (!endDate) return { ok: false, error: "No contract end dates." };

  const rentRows = generateRentScheduleRows({
    startDate: g.start_date,
    endDate,
    cadence: g.rent_cadence,
    rentAmountGbp: Number(g.rent_amount_gbp),
  });
  const rows = withDepositRow(
    rentRows,
    g.deposit_gbp != null ? Number(g.deposit_gbp) : null,
    g.start_date,
  );

  const { error: delErr } = await db.from("vehicle_hire_payment_schedule").delete().eq("hire_group_id", hireGroupId);
  if (delErr) return { ok: false, error: delErr.message };

  if (!rows.length) return { ok: true };

  const { error: insErr } = await db.from("vehicle_hire_payment_schedule").insert(
    rows.map((r) => ({
      hire_group_id: hireGroupId,
      period_start: r.periodStart,
      period_end: r.periodEnd,
      base_amount_gbp: r.baseAmountGbp,
      row_kind: r.rowKind,
      sort_order: r.sortOrder,
      expected_payment_account_id: g.default_payment_account_id,
      payment_status: "not_received",
    })),
  );
  if (insErr) return { ok: false, error: insErr.message };

  return { ok: true };
}
