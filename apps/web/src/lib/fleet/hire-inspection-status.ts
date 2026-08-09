import type { SupabaseClient } from "@supabase/supabase-js";

export type HireInspectionCompletion = {
  checkoutCompleted: boolean;
  checkinCompleted: boolean;
};

export async function loadHireCheckinCompleted(
  supabase: SupabaseClient,
  hireGroupId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("vehicle_hire_inspections")
    .select("id")
    .eq("hire_group_id", hireGroupId.trim())
    .eq("kind", "checkin")
    .eq("status", "completed")
    .maybeSingle();
  return Boolean(data?.id);
}

export function hireInspectionCompletionFromRows(
  rows: readonly { kind: string; status: string }[],
): HireInspectionCompletion {
  return {
    checkoutCompleted: rows.some((row) => row.kind === "checkout" && row.status === "completed"),
    checkinCompleted: rows.some((row) => row.kind === "checkin" && row.status === "completed"),
  };
}

export function mapHireInspectionCompletionByGroup(
  rows: readonly { hire_group_id: string; kind: string; status: string }[],
): Map<string, HireInspectionCompletion> {
  const byGroup = new Map<string, { kind: string; status: string }[]>();
  for (const row of rows) {
    const list = byGroup.get(row.hire_group_id) ?? [];
    list.push({ kind: row.kind, status: row.status });
    byGroup.set(row.hire_group_id, list);
  }

  const result = new Map<string, HireInspectionCompletion>();
  for (const [groupId, groupRows] of byGroup) {
    result.set(groupId, hireInspectionCompletionFromRows(groupRows));
  }
  return result;
}
