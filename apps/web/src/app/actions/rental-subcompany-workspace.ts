"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canWriteRentals, canWriteSubcompany } from "@/lib/auth/rental-permissions";
import { logSubcompanyEvent, type SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";
import {
  buildSubcompanyChangeSummary,
  detectSubcompanySnapshotDrift,
  diffSubcompanyEditableFields,
  hasContractImpactDrift,
  sanitizeSubcompanyUpdatePatch,
  type SubcompanyFieldChange,
} from "@/lib/rental/subcompany-contract-impact";
import { buildSubcompanyLegalSnapshot } from "@/lib/rental/subcompany-legal-snapshot";
import {
  processSubcompanyLogoForStorage,
  SUBCOMPANY_LOGOS_BUCKET,
} from "@/lib/rental/subcompany-logo";
import {
  mapSubcompanyRow,
  SUBCOMPANY_SELECT,
  type SubcompanyRow,
  type SubcompanyWorkspaceShell,
} from "@/lib/rental/subcompany";
import { getSubcompanyWorkspaceShell } from "@/lib/rental/load-subcompany-workspace-shell";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

const AFFECTED_HIRE_STATUSES = ["draft", "pending_signature", "reserved", "active"] as const;

function revalidateSubcompany(id: string) {
  revalidatePath("/rental/subcompany");
  revalidatePath(`/rental/subcompany/${id}`);
  revalidatePath(`/rental/subcompany/${id}/details`);
  revalidatePath(`/rental/subcompany/${id}/activity`);
}

async function loadSubcompanyOrError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  subcompanyId: string,
): Promise<{ ok: true; row: SubcompanyRow } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("subcompanies")
    .select(SUBCOMPANY_SELECT)
    .eq("id", subcompanyId.trim())
    .eq("parent_company_id", companyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Subcompany not found." };
  return { ok: true, row: mapSubcompanyRow(data as Record<string, unknown>) };
}

export type SubcompanySwitcherOption = {
  id: string;
  name: string;
  isPrimary: boolean;
  status: string;
};

export async function loadSubcompanySwitcherListAction(): Promise<
  SubcompanySwitcherOption[] | { error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { error: "No active company." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subcompanies")
    .select("id, name, is_primary, status")
    .eq("parent_company_id", companyId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (error) return { error: error.message };

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) || "—",
    isPrimary: Boolean(r.is_primary),
    status: String(r.status ?? "active"),
  }));
}

export async function loadSubcompanyWorkspaceShellAction(
  subcompanyId: string,
): Promise<{ ok: true; shell: SubcompanyWorkspaceShell } | { ok: false; error: string }> {
  return getSubcompanyWorkspaceShell(subcompanyId);
}

async function countAffectedHiresWithDrift(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subcompany: SubcompanyRow,
): Promise<boolean> {
  const { data: hires } = await supabase
    .from("vehicle_hire_groups")
    .select("id, subcompany_legal_snapshot")
    .eq("subcompany_id", subcompany.id)
    .in("status", [...AFFECTED_HIRE_STATUSES]);

  for (const h of hires ?? []) {
    if (
      hasContractImpactDrift(
        subcompany,
        (h.subcompany_legal_snapshot ?? {}) as Record<string, unknown>,
      )
    ) {
      return true;
    }
  }
  return false;
}

export async function updateSubcompanyAction(
  subcompanyId: string,
  input: Record<string, unknown>,
): Promise<
  | { ok: true; promptContractImpact: boolean; changedFields: SubcompanyFieldChange[] }
  | { ok: false; error: string }
> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteSubcompany(profile)) {
    return { ok: false, error: "You do not have permission to update subcompanies." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const sanitized = sanitizeSubcompanyUpdatePatch(input);
  if (!sanitized.ok) return sanitized;

  const supabase = await createClient();
  const loaded = await loadSubcompanyOrError(supabase, companyId, subcompanyId);
  if (!loaded.ok) return loaded;
  const before = loaded.row;

  if (sanitized.patch.status === "inactive" && before.is_primary) {
    return { ok: false, error: "The primary subcompany cannot be deactivated." };
  }

  if (sanitized.patch.status === "inactive") {
    const { count: openReqs } = await supabase
      .from("subcompany_hire_document_requirements")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", before.id)
      .eq("status", "required");
    if ((openReqs ?? 0) > 0) {
      return { ok: false, error: "Resolve open contract document updates before deactivating." };
    }
    const { count: activeHires } = await supabase
      .from("vehicle_hire_groups")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", before.id)
      .in("status", ["pending_signature", "reserved", "active"]);
    if ((activeHires ?? 0) > 0) {
      return { ok: false, error: "Cannot deactivate while this subcompany has active hires." };
    }
  }

  const { error } = await supabase
    .from("subcompanies")
    .update(sanitized.patch)
    .eq("id", before.id)
    .eq("parent_company_id", companyId);
  if (error) return { ok: false, error: error.message };

  const afterLoaded = await loadSubcompanyOrError(supabase, companyId, before.id);
  if (!afterLoaded.ok) return afterLoaded;
  const after = afterLoaded.row;

  const changedFields = diffSubcompanyEditableFields(before, after);
  const eventType =
    sanitized.patch.status === "inactive" && before.status !== "inactive" ? "deactivated" : "updated";

  try {
    const admin = createSupabaseAdminClient();
    await logSubcompanyEvent(admin, {
      subcompanyId: before.id,
      parentCompanyId: companyId,
      eventType,
      summary: buildSubcompanyChangeSummary(changedFields),
      actorUserId: user.id,
      actorRole: profile.membership_role ?? profile.company_role,
      metadata: { changes: changedFields },
    });
  } catch (e) {
    console.error("[updateSubcompanyAction] audit", e);
  }

  const promptContractImpact =
    changedFields.some((c) =>
      [
        "logo_storage_path",
        "legal_name",
        "display_name",
        "registered_address_line1",
        "registered_address_line2",
        "registered_town",
        "registered_county",
        "registered_postcode",
        "country",
        "primary_contact_first_name",
        "primary_contact_last_name",
        "primary_contact_phone",
        "primary_contact_email",
      ].includes(c.field),
    ) && (await countAffectedHiresWithDrift(supabase, after));

  revalidateSubcompany(before.id);
  return { ok: true, promptContractImpact, changedFields };
}

export async function uploadSubcompanyLogoAction(
  subcompanyId: string,
  formData: FormData,
): Promise<{ ok: true; promptContractImpact: boolean } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteSubcompany(profile)) {
    return { ok: false, error: "You do not have permission to update subcompanies." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const logo = formData.get("logo");
  if (!(logo instanceof File) || logo.size === 0) {
    return { ok: false, error: "Choose a logo file." };
  }
  if (!LOGO_TYPES.has(logo.type)) {
    return { ok: false, error: "Logo must be PNG, JPEG, or WebP." };
  }
  if (logo.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "Logo must be 5 MB or smaller." };
  }

  const supabase = await createClient();
  const loaded = await loadSubcompanyOrError(supabase, companyId, subcompanyId);
  if (!loaded.ok) return loaded;

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const raw = Buffer.from(await logo.arrayBuffer());
  const processed = await processSubcompanyLogoForStorage(raw, logo.type);
  const folder = `${companyId}/${loaded.row.id}`;
  const path = `${folder}/logo.${processed.ext}`;

  const { data: listed } = await admin.storage.from(SUBCOMPANY_LOGOS_BUCKET).list(folder);
  const stale = (listed ?? [])
    .map((f) => f.name)
    .filter((name) => name.startsWith("logo."))
    .map((name) => `${folder}/${name}`);
  if (stale.length) {
    await admin.storage.from(SUBCOMPANY_LOGOS_BUCKET).remove(stale);
  }

  const { error: upErr } = await admin.storage.from(SUBCOMPANY_LOGOS_BUCKET).upload(path, processed.buffer, {
    contentType: processed.contentType,
    upsert: true,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: dbErr } = await supabase
    .from("subcompanies")
    .update({ logo_storage_path: path })
    .eq("id", loaded.row.id)
    .eq("parent_company_id", companyId);
  if (dbErr) return { ok: false, error: dbErr.message };

  await logSubcompanyEvent(admin, {
    subcompanyId: loaded.row.id,
    parentCompanyId: companyId,
    eventType: "logo_changed",
    summary: "Updated subcompany logo.",
    actorUserId: user.id,
    actorRole: profile.membership_role ?? profile.company_role,
    metadata: { logo_storage_path: path },
  });

  const after = { ...loaded.row, logo_storage_path: path };
  const promptContractImpact = await countAffectedHiresWithDrift(supabase, after);
  revalidateSubcompany(loaded.row.id);
  return { ok: true, promptContractImpact };
}

export async function removeSubcompanyLogoAction(
  subcompanyId: string,
): Promise<{ ok: true; promptContractImpact: boolean } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteSubcompany(profile)) {
    return { ok: false, error: "You do not have permission to update subcompanies." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const loaded = await loadSubcompanyOrError(supabase, companyId, subcompanyId);
  if (!loaded.ok) return loaded;
  if (!loaded.row.logo_storage_path) return { ok: true, promptContractImpact: false };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  await admin.storage.from(SUBCOMPANY_LOGOS_BUCKET).remove([loaded.row.logo_storage_path]);
  const { error } = await supabase
    .from("subcompanies")
    .update({ logo_storage_path: null })
    .eq("id", loaded.row.id)
    .eq("parent_company_id", companyId);
  if (error) return { ok: false, error: error.message };

  await logSubcompanyEvent(admin, {
    subcompanyId: loaded.row.id,
    parentCompanyId: companyId,
    eventType: "logo_changed",
    summary: "Removed subcompany logo.",
    actorUserId: user.id,
    actorRole: profile.membership_role ?? profile.company_role,
  });

  const after = { ...loaded.row, logo_storage_path: null };
  const promptContractImpact = await countAffectedHiresWithDrift(supabase, after);
  revalidateSubcompany(loaded.row.id);
  return { ok: true, promptContractImpact };
}

export type AffectedHireDocument = {
  hireGroupId: string;
  agreementId: string | null;
  documentKind: "hire_agreement" | "permission_letter";
  label: string;
};

export async function loadAffectedHireDocumentsForImpactAction(
  subcompanyId: string,
): Promise<{ ok: true; documents: AffectedHireDocument[] } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const loaded = await loadSubcompanyOrError(supabase, companyId, subcompanyId);
  if (!loaded.ok) return loaded;

  const { data: hires, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "id, status, subcompany_legal_snapshot, vehicles(vrm), vehicle_hire_agreements(id, contract_length_kind, status)",
    )
    .eq("subcompany_id", loaded.row.id)
    .in("status", [...AFFECTED_HIRE_STATUSES]);
  if (error) return { ok: false, error: error.message };

  const documents: AffectedHireDocument[] = [];
  for (const h of hires ?? []) {
    const snap = (h.subcompany_legal_snapshot ?? {}) as Record<string, unknown>;
    if (!hasContractImpactDrift(loaded.row, snap)) continue;

    const vrm =
      (h.vehicles as { vrm?: string } | null)?.vrm ??
      ((Array.isArray(h.vehicles) ? h.vehicles[0] : null) as { vrm?: string } | null)?.vrm ??
      "Vehicle";
    const agreements = (h.vehicle_hire_agreements ?? []) as {
      id: string;
      contract_length_kind: string;
      status: string;
    }[];
    const liveAgreements = agreements.filter((a) => a.status !== "superseded" && a.status !== "cancelled");
    for (const a of liveAgreements) {
      documents.push({
        hireGroupId: h.id as string,
        agreementId: a.id,
        documentKind: "hire_agreement",
        label: `${vrm} · Hire agreement (${a.contract_length_kind.replace(/_/g, " ")})`,
      });
    }
    documents.push({
      hireGroupId: h.id as string,
      agreementId: null,
      documentKind: "permission_letter",
      label: `${vrm} · Permission letter`,
    });
  }

  return { ok: true, documents };
}

export async function recordSubcompanyContractImpactAnswerAction(input: {
  subcompanyId: string;
  contractsNeedUpdate: boolean;
  changedFields: SubcompanyFieldChange[];
  selectedDocuments: AffectedHireDocument[];
}): Promise<{ ok: true; batchId: string } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteSubcompany(profile)) {
    return { ok: false, error: "You do not have permission." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const loaded = await loadSubcompanyOrError(supabase, companyId, input.subcompanyId);
  if (!loaded.ok) return loaded;

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: batch, error: batchErr } = await admin
    .from("subcompany_detail_change_batches")
    .insert({
      subcompany_id: loaded.row.id,
      parent_company_id: companyId,
      changed_fields: input.changedFields,
      contracts_need_update: input.contractsNeedUpdate,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (batchErr || !batch?.id) {
    return { ok: false, error: batchErr?.message ?? "Could not save impact answer." };
  }

  if (input.contractsNeedUpdate && input.selectedDocuments.length) {
    const rows = input.selectedDocuments.map((d) => ({
      batch_id: batch.id,
      subcompany_id: loaded.row.id,
      hire_group_id: d.hireGroupId,
      document_kind: d.documentKind,
      agreement_id: d.agreementId,
      status: "required",
    }));
    const { error: reqErr } = await admin.from("subcompany_hire_document_requirements").insert(rows);
    if (reqErr) return { ok: false, error: reqErr.message };
  }

  await logSubcompanyEvent(admin, {
    subcompanyId: loaded.row.id,
    parentCompanyId: companyId,
    eventType: "contracts_impact_answered",
    summary: input.contractsNeedUpdate
      ? `Marked ${input.selectedDocuments.length} document(s) as requiring update.`
      : "Confirmed no contract updates required for this change.",
    actorUserId: user.id,
    actorRole: profile.membership_role ?? profile.company_role,
    metadata: {
      contracts_need_update: input.contractsNeedUpdate,
      selected_count: input.selectedDocuments.length,
    },
  });

  revalidateSubcompany(loaded.row.id);
  revalidatePath("/rental/hires");
  return { ok: true, batchId: batch.id as string };
}

export async function loadSubcompanyAuditTrailAction(
  subcompanyId: string,
): Promise<{ ok: true; events: SubcompanyAuditRow[] } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const loaded = await loadSubcompanyOrError(supabase, companyId, subcompanyId);
  if (!loaded.ok) return loaded;

  const { data, error } = await supabase
    .from("subcompany_events")
    .select("id, event_type, actor_user_id, actor_role, summary, metadata, created_at")
    .eq("subcompany_id", loaded.row.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    events: (data ?? []).map((e) => ({
      id: e.id as string,
      event_type: e.event_type as SubcompanyAuditRow["event_type"],
      actor_user_id: (e.actor_user_id as string | null) ?? null,
      actor_role: (e.actor_role as string | null) ?? null,
      summary: e.summary as string,
      metadata: (e.metadata ?? {}) as Record<string, unknown>,
      created_at: e.created_at as string,
    })),
  };
}

export type SubcompanyOverviewStats = {
  vehicleCount: number;
  activeHireCount: number;
  pendingHireCount: number;
  totalHireCount: number;
  openRequirementCount: number;
};

export type OpenDocumentRequirement = {
  id: string;
  hireGroupId: string;
  documentKind: string;
  agreementId: string | null;
  label: string;
  href: string;
};

export async function loadSubcompanyOverviewAction(
  subcompanyId: string,
): Promise<
  | {
      ok: true;
      stats: SubcompanyOverviewStats;
      openRequirements: import("@/lib/rental/subcompany-workspace-types").SubcompanyOpenRequirement[];
    }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const loaded = await loadSubcompanyOrError(supabase, companyId, subcompanyId);
  if (!loaded.ok) return loaded;

  const [
    { count: vehicleCount },
    { count: activeHireCount },
    { count: pendingHireCount },
    { count: totalHireCount },
    { data: reqs },
  ] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", loaded.row.id),
    supabase
      .from("vehicle_hire_groups")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", loaded.row.id)
      .eq("status", "active"),
    supabase
      .from("vehicle_hire_groups")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", loaded.row.id)
      .in("status", ["pending_signature", "reserved"]),
    supabase
      .from("vehicle_hire_groups")
      .select("id", { count: "exact", head: true })
      .eq("subcompany_id", loaded.row.id),
    supabase
      .from("subcompany_hire_document_requirements")
      .select("id, hire_group_id, document_kind, agreement_id")
      .eq("subcompany_id", loaded.row.id)
      .eq("status", "required")
      .order("created_at", { ascending: true }),
  ]);

  const hireIds = [...new Set((reqs ?? []).map((r) => r.hire_group_id as string))];
  const labelByHire = new Map<string, string>();
  if (hireIds.length) {
    const { data: hireRows } = await supabase
      .from("vehicle_hire_groups")
      .select("id, vehicles(vrm)")
      .in("id", hireIds);
    for (const h of hireRows ?? []) {
      const v = h.vehicles as { vrm?: string } | { vrm?: string }[] | null;
      const vrm = Array.isArray(v) ? v[0]?.vrm : v?.vrm;
      labelByHire.set(h.id as string, vrm?.trim() || "Hire");
    }
  }

  const openRequirements = (reqs ?? []).map((r) => {
    const hireGroupId = r.hire_group_id as string;
    const documentKind = r.document_kind as "hire_agreement" | "permission_letter";
    const base = labelByHire.get(hireGroupId) ?? "Hire";
    return {
      id: r.id as string,
      hireGroupId,
      documentKind,
      agreementId: (r.agreement_id as string | null) ?? null,
      label:
        documentKind === "permission_letter"
          ? `${base} · Permission letter`
          : `${base} · Hire agreement`,
      href: `/rental/hires/${hireGroupId}/details`,
    };
  });

  return {
    ok: true,
    stats: {
      vehicleCount: vehicleCount ?? 0,
      activeHireCount: activeHireCount ?? 0,
      pendingHireCount: pendingHireCount ?? 0,
      totalHireCount: totalHireCount ?? 0,
      openRequirementCount: openRequirements.length,
    },
    openRequirements,
  };
}

/** Refresh hire group lessor snapshot from live subcompany (before regenerate/supersede). */
export async function refreshHireSubcompanySnapshotAction(
  hireGroupId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile) && !canWriteSubcompany(profile)) {
    return { ok: false, error: "You do not have permission." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, subcompany_id")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group || group.parent_company_id !== companyId) {
    return { ok: false, error: "Hire contract not found." };
  }
  if (!group.subcompany_id) return { ok: false, error: "Hire has no subcompany." };

  const loaded = await loadSubcompanyOrError(supabase, companyId, group.subcompany_id as string);
  if (!loaded.ok) return loaded;

  const snapshot = buildSubcompanyLegalSnapshot(loaded.row);
  const { error: upErr } = await supabase
    .from("vehicle_hire_groups")
    .update({ subcompany_legal_snapshot: snapshot })
    .eq("id", group.id);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath(`/rental/hires/${group.id}`);
  return { ok: true };
}

export async function completeSubcompanyDocumentRequirementAction(input: {
  hireGroupId: string;
  documentKind: "hire_agreement" | "permission_letter";
  agreementId?: string | null;
  completedVia: "supersede_resign" | "regenerate_unsigned";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  let q = admin
    .from("subcompany_hire_document_requirements")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: user.id,
      completed_via: input.completedVia,
    })
    .eq("hire_group_id", input.hireGroupId)
    .eq("document_kind", input.documentKind)
    .eq("status", "required");

  if (input.agreementId) {
    q = q.eq("agreement_id", input.agreementId);
  }

  const { error } = await q;
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rental/hires");
  revalidatePath("/rental/subcompany");
  return { ok: true };
}

/** Detect drift helpers exported for other modules (snapshot build). */
export { buildSubcompanyLegalSnapshot, detectSubcompanySnapshotDrift };
