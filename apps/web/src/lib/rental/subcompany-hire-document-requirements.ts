import type { SupabaseClient } from "@supabase/supabase-js";
import type { HireGroupStatus } from "@/lib/fleet/hire-types";

/** Hires whose live documents no longer need subcompany detail updates. */
export const ENDED_HIRE_GROUP_STATUSES_FOR_DOCUMENT_IMPACT = [
  "terminated",
  "completed",
  "cancelled",
] as const satisfies readonly HireGroupStatus[];

export function hireIsEndedForSubcompanyDocumentImpact(status: string): boolean {
  return (ENDED_HIRE_GROUP_STATUSES_FOR_DOCUMENT_IMPACT as readonly string[]).includes(status);
}

export function hireEndedStatusLabel(status: string): string | null {
  if (status === "terminated") return "Contract ended";
  if (status === "completed") return "Hire completed";
  if (status === "cancelled") return "Cancelled";
  return null;
}

/** Clear open subcompany document-update flags when a hire is no longer running. */
export async function cancelOpenSubcompanyDocumentRequirementsForHire(
  admin: SupabaseClient,
  hireGroupId: string,
  completedBy?: string | null,
): Promise<void> {
  const { error } = await admin
    .from("subcompany_hire_document_requirements")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      ...(completedBy ? { completed_by: completedBy } : {}),
    })
    .eq("hire_group_id", hireGroupId.trim())
    .eq("status", "required");
  if (error) {
    console.error("[cancelOpenSubcompanyDocumentRequirementsForHire]", error.message);
  }
}

/** Clears stale document-update flags for ended hires under one subcompany. */
export async function reconcileEndedHireSubcompanyDocumentRequirements(
  admin: SupabaseClient,
  input: { subcompanyId: string; parentCompanyId: string; completedBy?: string | null },
): Promise<void> {
  const { data: reqs, error: reqErr } = await admin
    .from("subcompany_hire_document_requirements")
    .select("id, hire_group_id")
    .eq("subcompany_id", input.subcompanyId.trim())
    .eq("status", "required");
  if (reqErr) {
    console.error("[reconcileEndedHireSubcompanyDocumentRequirements]", reqErr.message);
    return;
  }
  if (!reqs?.length) return;

  const hireIds = [...new Set(reqs.map((row) => row.hire_group_id as string))];
  const { data: hires, error: hireErr } = await admin
    .from("vehicle_hire_groups")
    .select("id, status, subcompany_id")
    .in("id", hireIds)
    .eq("parent_company_id", input.parentCompanyId.trim());
  if (hireErr) {
    console.error("[reconcileEndedHireSubcompanyDocumentRequirements]", hireErr.message);
    return;
  }

  const endedHireIds = (hires ?? [])
    .filter(
      (row) =>
        row.subcompany_id === input.subcompanyId &&
        hireIsEndedForSubcompanyDocumentImpact(String(row.status ?? "")),
    )
    .map((row) => row.id as string);
  if (!endedHireIds.length) return;

  const { error: cancelErr } = await admin
    .from("subcompany_hire_document_requirements")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      ...(input.completedBy ? { completed_by: input.completedBy } : {}),
    })
    .eq("subcompany_id", input.subcompanyId.trim())
    .eq("status", "required")
    .in("hire_group_id", endedHireIds);
  if (cancelErr) {
    console.error("[reconcileEndedHireSubcompanyDocumentRequirements]", cancelErr.message);
  }
}
