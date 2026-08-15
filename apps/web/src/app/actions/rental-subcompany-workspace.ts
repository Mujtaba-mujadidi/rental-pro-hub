"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canWriteRentals, canWriteSubcompany } from "@/lib/auth/rental-permissions";
import { logSubcompanyEvent, type SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";
import {
  loadSubcompanyAuditTrailData,
  loadSubcompanyOverviewData,
} from "@/lib/rental/load-subcompany-section-data";
import {
  buildSubcompanyChangeSummary,
  detectSubcompanySnapshotDrift,
  diffSubcompanyEditableFields,
  hasContractImpactDrift,
  sanitizeSubcompanyUpdatePatch,
  type SubcompanyFieldChange,
} from "@/lib/rental/subcompany-contract-impact";
import {
  collectAffectedHireDocuments,
  CONTRACT_IMPACT_HIRE_STATUSES,
  hireQualifiesForSubcompanyDocumentImpact,
  mapHireForDocumentImpact,
  resolveHireVrm,
  type AffectedHireDocument,
} from "@/lib/rental/subcompany-hire-document-impact";
import { buildSubcompanyLegalSnapshot } from "@/lib/rental/subcompany-legal-snapshot";
import {
  processSubcompanyLogoForStorage,
  resolveSubcompanyWorkspaceLogoDisplayUrl,
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

function revalidateSubcompany(id: string) {
  revalidatePath("/rental/subcompany");
  revalidatePath(`/rental/subcompany/${id}`);
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
  return fetchSubcompanySwitcherList();
}

const fetchSubcompanySwitcherList = cache(async (): Promise<
  SubcompanySwitcherOption[] | { error: string }
> => {
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
});

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
    .select("id, status, subcompany_legal_snapshot")
    .eq("subcompany_id", subcompany.id)
    .in("status", [...CONTRACT_IMPACT_HIRE_STATUSES]);
  if (!hires?.length) return false;

  const hireIds = hires.map((hire) => hire.id as string);
  const [{ data: agreements }, { data: inspections }] = await Promise.all([
    supabase
      .from("vehicle_hire_agreements")
      .select("hire_group_id, signed_at, signed_storage_path, esign_envelope_id")
      .in("hire_group_id", hireIds),
    supabase.from("vehicle_hire_inspections").select("hire_group_id, status").in("hire_group_id", hireIds),
  ]);

  const agreementsByHire = new Map<string, typeof agreements>();
  for (const agreement of agreements ?? []) {
    const hireGroupId = agreement.hire_group_id as string;
    const list = agreementsByHire.get(hireGroupId) ?? [];
    list.push(agreement);
    agreementsByHire.set(hireGroupId, list);
  }

  const inspectionsByHire = new Map<string, { status: string }[]>();
  for (const inspection of inspections ?? []) {
    const hireGroupId = inspection.hire_group_id as string;
    const list = inspectionsByHire.get(hireGroupId) ?? [];
    list.push({ status: String(inspection.status ?? "") });
    inspectionsByHire.set(hireGroupId, list);
  }

  for (const hire of hires) {
    const mapped = mapHireForDocumentImpact({
      id: hire.id as string,
      status: String(hire.status ?? ""),
      subcompany_legal_snapshot: (hire.subcompany_legal_snapshot ?? null) as Record<string, unknown> | null,
      vrm: "Vehicle",
      agreements: (agreementsByHire.get(hire.id as string) ?? []) as Parameters<
        typeof mapHireForDocumentImpact
      >[0]["agreements"],
      inspections: inspectionsByHire.get(hire.id as string) ?? [],
    });
    if (!hireQualifiesForSubcompanyDocumentImpact(mapped)) continue;
    if (
      hasContractImpactDrift(
        subcompany,
        (hire.subcompany_legal_snapshot ?? {}) as Record<string, unknown>,
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

export async function getSubcompanyLogoPreviewUrlAction(
  subcompanyId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const loaded = await loadSubcompanyOrError(supabase, companyId, subcompanyId);
  if (!loaded.ok) return loaded;

  let companyLogoPath: string | null = null;
  if (loaded.row.is_primary) {
    const { data: company } = await supabase
      .from("companies")
      .select("logo_storage_path")
      .eq("id", companyId)
      .maybeSingle();
    companyLogoPath = (company?.logo_storage_path as string | null) ?? null;
  }

  const logoOnFile = Boolean(loaded.row.logo_storage_path?.trim() || companyLogoPath?.trim());
  if (!logoOnFile) return { ok: false, error: "No logo on file." };

  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    admin = null;
  }

  const url = await resolveSubcompanyWorkspaceLogoDisplayUrl(
    supabase,
    {
      subcompanyLogoPath: loaded.row.logo_storage_path,
      companyLogoPath,
      parentCompanyId: companyId,
      subcompanyId: loaded.row.id,
    },
    admin,
  );
  if (!url) return { ok: false, error: "Could not load logo preview." };
  return { ok: true, url };
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

export async function loadAffectedHireDocumentsForImpactAction(
  subcompanyId: string,
  changedFields: SubcompanyFieldChange[] = [],
): Promise<{ ok: true; documents: AffectedHireDocument[] } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const loaded = await loadSubcompanyOrError(supabase, companyId, subcompanyId);
  if (!loaded.ok) return loaded;

  const { data: hires, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, status, subcompany_legal_snapshot, vehicles(vrm)")
    .eq("subcompany_id", loaded.row.id)
    .in("status", [...CONTRACT_IMPACT_HIRE_STATUSES]);
  if (error) return { ok: false, error: error.message };

  const hireIds = (hires ?? []).map((hire) => hire.id as string);

  const [{ data: agreements }, { data: inspections }] = await Promise.all([
    hireIds.length
      ? supabase
          .from("vehicle_hire_agreements")
          .select(
            "id, hire_group_id, contract_length_kind, status, signed_at, signed_storage_path, esign_envelope_id",
          )
          .in("hire_group_id", hireIds)
      : Promise.resolve({ data: [] as const, error: null }),
    hireIds.length
      ? supabase
          .from("vehicle_hire_inspections")
          .select("id, hire_group_id, kind, status")
          .in("hire_group_id", hireIds)
      : Promise.resolve({ data: [] as const, error: null }),
  ]);

  const inspectionsByHire = new Map<string, { status: string }[]>();
  for (const inspection of inspections ?? []) {
    const hireGroupId = inspection.hire_group_id as string;
    const list = inspectionsByHire.get(hireGroupId) ?? [];
    list.push({ status: String(inspection.status ?? "") });
    inspectionsByHire.set(hireGroupId, list);
  }

  const agreementRows = (agreements ?? []) as Parameters<typeof collectAffectedHireDocuments>[0]["agreements"];
  const hireRows = (hires ?? []).map((hire) =>
    mapHireForDocumentImpact({
      id: hire.id as string,
      status: String(hire.status ?? ""),
      subcompany_legal_snapshot: (hire.subcompany_legal_snapshot ?? null) as Record<string, unknown> | null,
      vrm: resolveHireVrm(hire.vehicles),
      agreements: agreementRows.filter((row) => row.hire_group_id === hire.id),
      inspections: inspectionsByHire.get(hire.id as string) ?? [],
    }),
  );

  const documents = collectAffectedHireDocuments({
    liveSubcompany: loaded.row,
    hires: hireRows,
    agreements: agreementRows,
    inspections: (inspections ?? []) as {
      id: string;
      hire_group_id: string;
      kind: "checkout" | "checkin";
      status: string;
    }[],
  });

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
      inspection_id: d.inspectionId,
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
  return loadSubcompanyAuditTrailData(companyId, subcompanyId);
}

export async function loadSubcompanyOverviewAction(
  subcompanyId: string,
): Promise<{ ok: true; data: import("@/lib/rental/load-subcompany-section-data").SubcompanyOverviewData } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  return loadSubcompanyOverviewData(companyId, subcompanyId);
}

export async function loadSubcompanyAttentionAction(
  subcompanyId: string,
): Promise<
  | { ok: true; data: import("@/lib/rental/load-subcompany-attention-data").SubcompanyAttentionData }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };
  const { getSubcompanyAttentionData } = await import("@/lib/rental/load-subcompany-attention-data");
  return getSubcompanyAttentionData(companyId, subcompanyId);
}

export async function loadSubcompanyHiresSectionAction(
  subcompanyId: string,
): Promise<
  | {
      ok: true;
      rows: import("@/app/actions/rental-hire-wizard").HireContractTableRow[];
      canWrite: boolean;
      incomeThisMonthGbp: number;
    }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const { listHireContractsAction } = await import("@/app/actions/rental-hire-wizard");
  const { loadSubcompanyHireIncomeThisMonthForSubcompany } = await import(
    "@/lib/rental/load-subcompany-section-data"
  );

  const [res, incomeThisMonthGbp] = await Promise.all([
    listHireContractsAction("", undefined, subcompanyId),
    loadSubcompanyHireIncomeThisMonthForSubcompany(companyId, subcompanyId),
  ]);
  if (!res.ok) return res;
  return {
    ok: true,
    rows: res.rows,
    canWrite: res.canWrite,
    incomeThisMonthGbp,
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
  documentKind: import("@/lib/rental/subcompany-workspace-types").SubcompanyDocumentKind;
  agreementId?: string | null;
  inspectionId?: string | null;
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
  } else if (input.documentKind === "hire_agreement" || input.documentKind === "permission_letter") {
    q = q.is("agreement_id", null);
  }

  if (input.inspectionId) {
    q = q.eq("inspection_id", input.inspectionId);
  } else if (input.documentKind.startsWith("inspection_")) {
    return { ok: false, error: "Missing inspection id for inspection report requirement." };
  }

  const { error } = await q;
  if (error) return { ok: false, error: error.message };

  revalidatePath("/rental/hires");
  revalidatePath("/rental/subcompany");
  return { ok: true };
}

export async function dismissSubcompanyDocumentRequirementAction(
  requirementId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteSubcompany(profile)) {
    return { ok: false, error: "You do not have permission." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false, error: "No active company." };

  const supabase = await createClient();
  const { data: row, error: loadErr } = await supabase
    .from("subcompany_hire_document_requirements")
    .select("id, subcompany_id, status, hire_group_id, document_kind")
    .eq("id", requirementId.trim())
    .maybeSingle();
  if (loadErr) return { ok: false, error: loadErr.message };
  if (!row) return { ok: false, error: "Document flag not found." };
  if (row.status !== "required") return { ok: true };

  const loaded = await loadSubcompanyOrError(supabase, companyId, row.subcompany_id as string);
  if (!loaded.ok) return loaded;

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { error } = await admin
    .from("subcompany_hire_document_requirements")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq("id", row.id)
    .eq("status", "required");
  if (error) return { ok: false, error: error.message };

  await logSubcompanyEvent(admin, {
    subcompanyId: loaded.row.id,
    parentCompanyId: companyId,
    eventType: "contracts_impact_answered",
    summary: "Dismissed a document update flag that is no longer needed.",
    actorUserId: user.id,
    actorRole: profile.membership_role ?? profile.company_role,
    metadata: {
      requirement_id: row.id,
      hire_group_id: row.hire_group_id,
      document_kind: row.document_kind,
      dismissed: true,
    },
  });

  revalidatePath("/rental/hires");
  revalidatePath("/rental/subcompany");
  revalidateSubcompany(loaded.row.id);
  return { ok: true };
}

/** Detect drift helpers exported for other modules (snapshot build). */
export { buildSubcompanyLegalSnapshot, detectSubcompanySnapshotDrift };
