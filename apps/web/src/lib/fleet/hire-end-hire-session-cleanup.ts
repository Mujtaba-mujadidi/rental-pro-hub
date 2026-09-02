import { HIRE_RETURN_CHARGE_SOURCE_KINDS } from "@/lib/fleet/hire-return-charges";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Remove end-hire session artifacts (check-in inspection, return-charge lines, related receipts).
 * Runs on cancel regardless of hire status so a restarted end-hire wizard starts clean.
 */
export async function revertEndHireSessionArtifacts(
  admin: SupabaseClient,
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const { data: checkinCharges } = await admin
    .from("vehicle_hire_driver_charge_line_items")
    .select("id, balance_payment_id")
    .eq("hire_group_id", id)
    .in("source_kind", [...HIRE_RETURN_CHARGE_SOURCE_KINDS]);

  const paymentIds = [
    ...new Set(
      (checkinCharges ?? [])
        .map((row) => (row.balance_payment_id as string | null)?.trim() || "")
        .filter(Boolean),
    ),
  ];

  const { error: chargeDeleteError } = await admin
    .from("vehicle_hire_driver_charge_line_items")
    .delete()
    .eq("hire_group_id", id)
    .in("source_kind", [...HIRE_RETURN_CHARGE_SOURCE_KINDS]);
  if (chargeDeleteError) return { ok: false, error: chargeDeleteError.message };

  if (paymentIds.length > 0) {
    const { error: paymentDeleteError } = await admin
      .from("vehicle_hire_balance_payments")
      .delete()
      .eq("hire_group_id", id)
      .in("id", paymentIds);
    if (paymentDeleteError) return { ok: false, error: paymentDeleteError.message };
  }

  await admin
    .from("vehicle_hire_balance_payments")
    .delete()
    .eq("hire_group_id", id)
    .eq("payment_category", "driver_charge")
    .or("notes.ilike.%check-in%,notes.ilike.%return charge%");

  const { data: checkinInspections } = await admin
    .from("vehicle_hire_inspections")
    .select("id")
    .eq("hire_group_id", id)
    .eq("kind", "checkin");
  const checkinInspectionIds = (checkinInspections ?? [])
    .map((row) => (row.id as string | null)?.trim() || "")
    .filter(Boolean);

  if (checkinInspectionIds.length > 0) {
    const { data: checkinMedia } = await admin
      .from("vehicle_hire_inspection_media")
      .select("file_path")
      .in("inspection_id", checkinInspectionIds);
    const mediaPaths = [
      ...new Set(
        (checkinMedia ?? [])
          .map((row) => (row.file_path as string | null)?.trim() || "")
          .filter(Boolean),
      ),
    ];
    if (mediaPaths.length > 0) {
      await admin.storage.from("hire-inspection-media").remove(mediaPaths);
    }
  }

  const { error: inspectionDeleteError } = await admin
    .from("vehicle_hire_inspections")
    .delete()
    .eq("hire_group_id", id)
    .eq("kind", "checkin");
  if (inspectionDeleteError) return { ok: false, error: inspectionDeleteError.message };

  return { ok: true };
}
