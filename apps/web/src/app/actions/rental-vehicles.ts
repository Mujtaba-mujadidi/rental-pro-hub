"use server";

import { revalidatePath } from "next/cache";
import { loadUserAccessibleSubcompanyIds } from "@/lib/auth/rental-subcompany-access";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canDeleteFleet, canManageFleet } from "@/lib/auth/rental-permissions";
import {
  isPhvTaxiLicencePaperDocType,
  isVehicleDocType,
  isVehicleStatus,
  missingRequiredDocTypes,
  normalizeVrm,
  VEHICLE_DOC_TYPE_LABELS,
  type VehicleDocType,
  type VehicleDocumentRow,
  type VehicleRow,
  type VehicleStatus,
  type VehicleTransferRow,
} from "@/lib/fleet/vehicles";
import { prepareVehicleDocumentPdf } from "@/lib/fleet/vehicle-document-pdf";
import { getVehicleWorkspaceShell, type VehicleWorkspaceShellResult } from "@/lib/fleet/load-vehicle-workspace-shell";
import {
  getCachedVehicleSwitcherList,
  revalidateVehicleWorkspaceCache,
} from "@/lib/fleet/vehicle-workspace-cache";
import { getActiveHireForVehicle } from "@/app/actions/rental-hires";
import { bareVehicleTransferBlockedByHire } from "@/lib/fleet/vehicle-transfer-readiness";
import { vehicleTransferFleetDocKindForVehicleDocType } from "@/lib/fleet/vehicle-transfer-document-requirements";
import type { TransferredOutVehicleSummary } from "@/lib/fleet/vehicle-historic-access";
import type { VehicleSwitcherOption } from "@/lib/fleet/vehicle-workspace-cache";

export type { VehicleSwitcherOption } from "@/lib/fleet/vehicle-workspace-cache";
import {
  parseCompanyNotificationSettings,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function loadCompanyNotifySettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentCompanyId: string,
): Promise<CompanyNotificationSettings> {
  const { data } = await supabase
    .from("companies")
    .select(
      "notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before, notify_insurance_days_before",
    )
    .eq("id", parentCompanyId)
    .maybeSingle();
  return parseCompanyNotificationSettings(data ?? undefined);
}

export type VehicleActionResult = { ok: true; id?: string } | { ok: false; error: string };

function revalidateVehiclePaths(vehicleId?: string, parentCompanyId?: string | null) {
  revalidatePath("/rental/vehicles");
  if (vehicleId) {
    revalidateVehicleWorkspaceCache(vehicleId, parentCompanyId);
    revalidatePath(`/rental/vehicles/${vehicleId}`);
    revalidatePath(`/rental/vehicles/${vehicleId}`, "layout");
  }
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function parseOptionalInt(raw: string | null, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null };
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number.` };
  return { ok: true, value: n };
}

function parseVehicleExpiryYmd(
  raw: string | null,
  label: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { ok: false, error: `${label} is required.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, error: `${label} must be a valid date.` };
  }
  return { ok: true, value: trimmed };
}

async function assertSubcompanyInTenant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentCompanyId: string,
  subcompanyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("subcompanies")
    .select("id, parent_company_id")
    .eq("id", subcompanyId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data || data.parent_company_id !== parentCompanyId) {
    return { ok: false, error: "Subcompany not found for this company." };
  }
  return { ok: true };
}

function parseVehicleFields(formData: FormData): {
  ok: true;
  fields: {
    vrm: string;
    make: string;
    model: string;
    colour: string | null;
    first_reg_date: string | null;
    first_reg_uk_date: string | null;
    fuel_type: string | null;
    seats: number | null;
    cc: number | null;
    mot_expiry: string | null;
    tax_expiry: string | null;
    phv_licence_no: string | null;
    phv_licence_expiry: string | null;
    licensing_authority_name: string | null;
    status: VehicleStatus;
    vehicle_age_limit_years: number | null;
    service_due_at: string | null;
    current_mileage: number | null;
    next_service_mileage: number | null;
    notes: string | null;
  };
} | { ok: false; error: string } {
  const vrm = normalizeVrm(nullIfEmpty(formData.get("vrm")) ?? "");
  if (!vrm || vrm.length < 2) return { ok: false, error: "VRM is required." };
  if (vrm.length > 12) return { ok: false, error: "VRM is too long." };

  const make = nullIfEmpty(formData.get("make"));
  const model = nullIfEmpty(formData.get("model"));
  if (!make) return { ok: false, error: "Make is required." };
  if (!model) return { ok: false, error: "Model is required." };

  const statusRaw = nullIfEmpty(formData.get("status")) ?? "available";
  if (!isVehicleStatus(statusRaw)) return { ok: false, error: "Invalid status." };

  const seats = parseOptionalInt(nullIfEmpty(formData.get("seats")), "Seats");
  if (!seats.ok) return seats;
  const cc = parseOptionalInt(nullIfEmpty(formData.get("cc")), "Engine CC");
  if (!cc.ok) return cc;
  const ageLimit = parseOptionalInt(nullIfEmpty(formData.get("vehicle_age_limit_years")), "Age limit");
  if (!ageLimit.ok) return ageLimit;
  const currentMileage = parseOptionalInt(nullIfEmpty(formData.get("current_mileage")), "Current mileage");
  if (!currentMileage.ok) return currentMileage;
  const nextServiceMileage = parseOptionalInt(nullIfEmpty(formData.get("next_service_mileage")), "Next service mileage");
  if (!nextServiceMileage.ok) return nextServiceMileage;

  return {
    ok: true,
    fields: {
      vrm,
      make,
      model,
      colour: nullIfEmpty(formData.get("colour")),
      first_reg_date: nullIfEmpty(formData.get("first_reg_date")),
      first_reg_uk_date: nullIfEmpty(formData.get("first_reg_uk_date")),
      fuel_type: nullIfEmpty(formData.get("fuel_type")),
      seats: seats.value,
      cc: cc.value,
      mot_expiry: nullIfEmpty(formData.get("mot_expiry")),
      tax_expiry: nullIfEmpty(formData.get("tax_expiry")),
      phv_licence_no: nullIfEmpty(formData.get("phv_licence_no")),
      phv_licence_expiry: nullIfEmpty(formData.get("phv_licence_expiry")),
      licensing_authority_name: nullIfEmpty(formData.get("licensing_authority_name")),
      status: statusRaw,
      vehicle_age_limit_years: ageLimit.value,
      service_due_at: nullIfEmpty(formData.get("service_due_at")),
      current_mileage: currentMileage.value,
      next_service_mileage: nextServiceMileage.value,
      notes: nullIfEmpty(formData.get("notes")),
    },
  };
}

export async function createVehicleAction(formData: FormData): Promise<VehicleActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const subcompanyId = nullIfEmpty(formData.get("subcompany_id"));
  if (!subcompanyId) return { ok: false, error: "Subcompany is required." };

  const parsed = parseVehicleFields(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const branch = await assertSubcompanyInTenant(supabase, parentCompanyId, subcompanyId);
  if (!branch.ok) return branch;

  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      parent_company_id: parentCompanyId,
      subcompany_id: subcompanyId,
      ...parsed.fields,
    })
    .select("id")
    .single();

  if (error) {
    if (/vehicles_vrm_company_unique|duplicate key/i.test(error.message)) {
      return { ok: false, error: "A vehicle with this VRM already exists for your company." };
    }
    return { ok: false, error: error.message };
  }

  revalidateVehiclePaths(data.id, parentCompanyId);
  return { ok: true, id: data.id };
}

export async function updateVehicleAction(vehicleId: string, formData: FormData): Promise<VehicleActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  const parsed = parseVehicleFields(formData);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const { data: existing, error: gErr } = await supabase
    .from("vehicles")
    .select("id, parent_company_id, subcompany_id")
    .eq("id", id)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!existing || existing.parent_company_id !== parentCompanyId) {
    return { ok: false, error: "Vehicle not found." };
  }

  // Subcompany changes go through transferVehicleAction (audit trail).
  const { error } = await supabase
    .from("vehicles")
    .update({ ...parsed.fields })
    .eq("id", id)
    .eq("parent_company_id", parentCompanyId);

  if (error) {
    if (/vehicles_vrm_company_unique|duplicate key/i.test(error.message)) {
      return { ok: false, error: "A vehicle with this VRM already exists for your company." };
    }
    return { ok: false, error: error.message };
  }

  revalidateVehiclePaths(id, parentCompanyId);
  return { ok: true, id };
}

export async function transferVehicleAction(
  vehicleId: string,
  toSubcompanyId: string,
  notes?: string | null,
): Promise<VehicleActionResult> {
  const { user, profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = vehicleId.trim();
  const toId = toSubcompanyId.trim();
  if (!id || !toId) return { ok: false, error: "Missing vehicle or destination." };

  const supabase = await createClient();
  const { data: vehicle, error: gErr } = await supabase
    .from("vehicles")
    .select("id, parent_company_id, subcompany_id")
    .eq("id", id)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!vehicle || vehicle.parent_company_id !== parentCompanyId) {
    return { ok: false, error: "Vehicle not found." };
  }
  if (vehicle.subcompany_id === toId) {
    return { ok: false, error: "Vehicle is already at that subcompany." };
  }

  const dest = await assertSubcompanyInTenant(supabase, parentCompanyId, toId);
  if (!dest.ok) return dest;

  const blockingHire = await getActiveHireForVehicle(id);
  if (bareVehicleTransferBlockedByHire(blockingHire)) {
    return {
      ok: false,
      error:
        "This vehicle has an open hire. Use the transfer wizard to end the contract, complete check-in and settlement, then transfer.",
    };
  }

  const { error: tErr } = await supabase.from("vehicle_transfers").insert({
    vehicle_id: id,
    parent_company_id: parentCompanyId,
    from_subcompany_id: vehicle.subcompany_id,
    to_subcompany_id: toId,
    transferred_by: user.id,
    notes: notes?.trim() || null,
  });
  if (tErr) return { ok: false, error: tErr.message };

  const { error: uErr } = await supabase
    .from("vehicles")
    .update({ subcompany_id: toId })
    .eq("id", id)
    .eq("parent_company_id", parentCompanyId);
  if (uErr) return { ok: false, error: uErr.message };

  revalidateVehiclePaths(id, parentCompanyId);
  return { ok: true, id };
}

export async function deleteVehicleAction(vehicleId: string): Promise<VehicleActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canDeleteFleet(profile)) return { ok: false, error: "Only owners or admins can delete vehicles." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").delete().eq("id", id).eq("parent_company_id", parentCompanyId);
  if (error) return { ok: false, error: error.message };

  revalidateVehiclePaths(id, parentCompanyId);
  return { ok: true, id };
}

export async function uploadVehicleDocumentAction(formData: FormData): Promise<VehicleActionResult> {
  const { user, profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const vehicleId = nullIfEmpty(formData.get("vehicle_id"));
  let docTypeRaw = nullIfEmpty(formData.get("doc_type")) ?? "other";
  if (!vehicleId) return { ok: false, error: "Missing vehicle." };
  if (!isVehicleDocType(docTypeRaw)) return { ok: false, error: "Invalid document type." };
  // Normalize legacy keys to the canonical PHV/Taxi licence paper type.
  if (docTypeRaw === "pco_paper" || docTypeRaw === "phv_licence") {
    docTypeRaw = "phv_taxi_licence_paper";
  }

  const collected: File[] = [];
  const multi = formData.getAll("files");
  for (const entry of multi) {
    if (entry instanceof File && entry.size > 0) collected.push(entry);
  }
  const single = formData.get("file");
  if (single instanceof File && single.size > 0) collected.push(single);

  if (!collected.length) return { ok: false, error: "Choose a PDF or one or more images." };

  const MAX_INPUT = 12 * 1024 * 1024;
  for (const file of collected) {
    if (file.size > MAX_INPUT) {
      return { ok: false, error: `${file.name || "A file"} is over 12 MB before compression.` };
    }
    const allowed = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!allowed) return { ok: false, error: "Use a PDF or images (JPEG, PNG, WebP)." };
  }

  const supabase = await createClient();
  const { data: vehicle, error: gErr } = await supabase
    .from("vehicles")
    .select("id, parent_company_id")
    .eq("id", vehicleId)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!vehicle || vehicle.parent_company_id !== parentCompanyId) {
    return { ok: false, error: "Vehicle not found." };
  }

  const filePayloads = await Promise.all(
    collected.map(async (file) => ({
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
      fileName: file.name || "upload",
    })),
  );

  const prepared = await prepareVehicleDocumentPdf(
    filePayloads,
    VEHICLE_DOC_TYPE_LABELS[docTypeRaw as VehicleDocType] ?? docTypeRaw,
  );
  if (!prepared.ok) return prepared;

  // One current PDF per doc type — supersede previous uploads (keep historical files).
  const replaceTypes = isPhvTaxiLicencePaperDocType(docTypeRaw)
    ? (["phv_taxi_licence_paper", "pco_paper", "phv_licence"] as const)
    : ([docTypeRaw] as const);
  const { data: existing } = await supabase
    .from("vehicle_documents")
    .select("id, file_path")
    .eq("vehicle_id", vehicleId)
    .in("doc_type", [...replaceTypes])
    .eq("version_status", "current");
  const supersededId = existing?.[0]?.id ?? null;
  if (existing?.length) {
    await supabase
      .from("vehicle_documents")
      .update({ version_status: "superseded" })
      .in(
        "id",
        existing.map((r) => r.id),
      );
  }

  const vehicleTransferId = nullIfEmpty(formData.get("vehicle_transfer_id"));

  const path = `${parentCompanyId}/${vehicleId}/${prepared.pdf.fileName}`;
  const { error: upErr } = await supabase.storage.from("vehicle-documents").upload(path, prepared.pdf.bytes, {
    contentType: prepared.pdf.contentType,
    upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: insErr } = await supabase.from("vehicle_documents").insert({
    vehicle_id: vehicleId,
    parent_company_id: parentCompanyId,
    doc_type: docTypeRaw as VehicleDocType,
    file_path: path,
    file_name: prepared.pdf.fileName,
    content_type: prepared.pdf.contentType,
    expiry_date: null,
    issued_date: nullIfEmpty(formData.get("issued_date")),
    notes:
      nullIfEmpty(formData.get("notes")) ??
      (prepared.pdf.pageCount > 1 ? `${prepared.pdf.pageCount} pages` : null),
    uploaded_by: user.id,
    version_status: "current",
    supersedes_document_id: supersededId,
    vehicle_transfer_id: vehicleTransferId,
  });
  if (insErr) {
    await supabase.storage.from("vehicle-documents").remove([path]);
    return { ok: false, error: insErr.message };
  }

  // Clear MOT / PHV document attention and optionally update expiry when uploading renewed docs.
  const vehiclePatch: Record<string, string | null> = {};
  if (docTypeRaw === "mot") {
    const expiryRaw = nullIfEmpty(formData.get("mot_expiry"));
    if (expiryRaw) {
      const parsed = parseVehicleExpiryYmd(expiryRaw, "MOT expiry");
      if (!parsed.ok) return parsed;
      vehiclePatch.mot_expiry = parsed.value;
    }
    vehiclePatch.mot_doc_attention_at = null;
  } else if (isPhvTaxiLicencePaperDocType(docTypeRaw)) {
    const expiryRaw = nullIfEmpty(formData.get("phv_licence_expiry"));
    if (expiryRaw) {
      const parsed = parseVehicleExpiryYmd(expiryRaw, "PHV/Taxi licence expiry");
      if (!parsed.ok) return parsed;
      vehiclePatch.phv_licence_expiry = parsed.value;
    }
    vehiclePatch.phv_doc_attention_at = null;
  }
  if (Object.keys(vehiclePatch).length) {
    const { error: vehiclePatchErr } = await supabase
      .from("vehicles")
      .update(vehiclePatch)
      .eq("id", vehicleId)
      .eq("parent_company_id", parentCompanyId);
    if (vehiclePatchErr) return { ok: false, error: vehiclePatchErr.message };
  }

  const requirementId = nullIfEmpty(formData.get("transfer_requirement_id"));
  if (requirementId) {
    const fleetKind = vehicleTransferFleetDocKindForVehicleDocType(docTypeRaw);
    if (!fleetKind) {
      return { ok: false, error: "This upload does not match the flagged transfer document." };
    }
    const { data: requirement, error: reqLoadErr } = await supabase
      .from("vehicle_transfer_document_requirements")
      .select("id, vehicle_id, document_kind, status")
      .eq("id", requirementId)
      .maybeSingle();
    if (reqLoadErr) return { ok: false, error: reqLoadErr.message };
    if (
      !requirement ||
      requirement.vehicle_id !== vehicleId ||
      requirement.status !== "required" ||
      requirement.document_kind !== fleetKind
    ) {
      return { ok: false, error: "Transfer document flag not found." };
    }
    const { error: reqErr } = await supabase
      .from("vehicle_transfer_document_requirements")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        completed_by: user.id,
      })
      .eq("id", requirementId)
      .eq("status", "required");
    if (reqErr) return { ok: false, error: reqErr.message };
  }

  revalidateVehiclePaths(vehicleId, parentCompanyId);
  return { ok: true, id: vehicleId };
}

export async function deleteVehicleDocumentAction(documentId: string): Promise<VehicleActionResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return frozen;
  if (!canManageFleet(profile)) return { ok: false, error: "You do not have permission to manage fleet." };

  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = documentId.trim();
  if (!id) return { ok: false, error: "Missing document." };

  const supabase = await createClient();
  const { data: doc, error: gErr } = await supabase
    .from("vehicle_documents")
    .select("id, file_path, parent_company_id, vehicle_id")
    .eq("id", id)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!doc || doc.parent_company_id !== parentCompanyId) {
    return { ok: false, error: "Document not found." };
  }

  const { error: dErr } = await supabase.from("vehicle_documents").delete().eq("id", id);
  if (dErr) return { ok: false, error: dErr.message };

  await supabase.storage.from("vehicle-documents").remove([doc.file_path]);

  revalidateVehiclePaths(doc.vehicle_id, parentCompanyId);
  return { ok: true, id: doc.vehicle_id };
}

export type VehicleDocumentUrlResult =
  | { ok: true; url: string; fileName: string; contentType: string | null }
  | { ok: false; error: string };

/** Short-lived signed URL so company users can view or download a vehicle document. */
export async function getVehicleDocumentUrlAction(documentId: string): Promise<VehicleDocumentUrlResult> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = documentId.trim();
  if (!id) return { ok: false, error: "Missing document." };

  const supabase = await createClient();
  const { data: doc, error: gErr } = await supabase
    .from("vehicle_documents")
    .select("id, file_path, file_name, content_type, parent_company_id")
    .eq("id", id)
    .maybeSingle();
  if (gErr) return { ok: false, error: gErr.message };
  if (!doc || doc.parent_company_id !== parentCompanyId) {
    return { ok: false, error: "Document not found." };
  }

  const { data, error } = await supabase.storage
    .from("vehicle-documents")
    .createSignedUrl(doc.file_path, 3600);
  if (error || !data?.signedUrl) {
    return { ok: false, error: error?.message ?? "Could not create a download link." };
  }

  return {
    ok: true,
    url: data.signedUrl,
    fileName: doc.file_name?.trim() || doc.file_path.split("/").pop() || "vehicle-document.pdf",
    contentType: doc.content_type,
  };
}

export type VehiclesPageData = {
  vehicles: VehicleRow[];
  transferredOutVehicles: TransferredOutVehicleSummary[];
  subcompanies: { id: string; name: string | null; is_primary: boolean }[];
  notifySettings: CompanyNotificationSettings;
  canManage: boolean;
  canDelete: boolean;
};

async function loadTransferredOutVehicles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parentCompanyId: string,
  subcompanyId: string,
  accessibleSubcompanyIds: string[] | "all",
): Promise<TransferredOutVehicleSummary[]> {
  if (accessibleSubcompanyIds !== "all" && !accessibleSubcompanyIds.includes(subcompanyId)) {
    return [];
  }

  const { data, error } = await supabase
    .from("vehicle_transfers")
    .select(
      "vehicle_id, transferred_at, to_subcompany_id, vehicles!inner(id, subcompany_id, parent_company_id, vrm, make, model), to_subcompany:subcompanies!vehicle_transfers_to_subcompany_id_fkey(name)",
    )
    .eq("from_subcompany_id", subcompanyId)
    .eq("vehicles.parent_company_id", parentCompanyId)
    .order("transferred_at", { ascending: false });

  if (error) {
    console.error("transferred-out vehicles query failed", error.message);
    return [];
  }

  const seen = new Set<string>();
  const rows: TransferredOutVehicleSummary[] = [];
  for (const row of data ?? []) {
    const nestedVehicle = row.vehicles as
      | {
          id: string;
          subcompany_id: string;
          vrm: string;
          make: string;
          model: string;
        }
      | {
          id: string;
          subcompany_id: string;
          vrm: string;
          make: string;
          model: string;
        }[]
      | null;
    const vehicle = Array.isArray(nestedVehicle) ? nestedVehicle[0] : nestedVehicle;
    if (!vehicle || vehicle.subcompany_id === subcompanyId) continue;
    if (seen.has(vehicle.id)) continue;
    seen.add(vehicle.id);
    const toSub = row.to_subcompany as { name: string | null } | { name: string | null }[] | null;
    const toName = Array.isArray(toSub) ? toSub[0]?.name : toSub?.name;
    rows.push({
      vehicleId: vehicle.id,
      vrm: vehicle.vrm,
      make: vehicle.make,
      model: vehicle.model,
      transferredAt: row.transferred_at as string,
      transferredToSubcompanyId: row.to_subcompany_id as string,
      transferredToSubcompanyName: toName ?? null,
    });
  }
  return rows;
}

/** Slim fleet list for the vehicle workspace switcher. */
export async function loadVehicleSwitcherList(): Promise<VehicleSwitcherOption[] | { error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { error: "No active company." };

  try {
    return await getCachedVehicleSwitcherList(parentCompanyId);
  } catch {
    return { error: "Could not load fleet list." };
  }
}

export async function loadVehiclesPageData(options?: {
  subcompanyId?: string;
}): Promise<VehiclesPageData | { error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { error: "No active company." };

  const subcompanyId = options?.subcompanyId?.trim() || null;
  const supabase = await createClient();

  let vehicleQuery = supabase
    .from("vehicles")
    .select(
      "id, parent_company_id, subcompany_id, vrm, make, model, colour, first_reg_date, first_reg_uk_date, fuel_type, seats, cc, mot_expiry, tax_expiry, phv_licence_no, phv_licence_expiry, licensing_authority_name, status, vehicle_age_limit_years, service_due_at, current_mileage, next_service_mileage, notes, created_at, updated_at, subcompanies(name)",
    )
    .eq("parent_company_id", parentCompanyId)
    .order("vrm", { ascending: true });

  if (subcompanyId) {
    vehicleQuery = vehicleQuery.eq("subcompany_id", subcompanyId);
  }

  const subsQuery = subcompanyId
    ? supabase
        .from("subcompanies")
        .select("id, name, is_primary")
        .eq("id", subcompanyId)
        .eq("parent_company_id", parentCompanyId)
        .maybeSingle()
    : supabase
        .from("subcompanies")
        .select("id, name, is_primary")
        .eq("parent_company_id", parentCompanyId)
        .order("created_at", { ascending: true });

  const [{ data: vehicles, error: vErr }, subsResult, notifySettings, accessibleSubcompanyIds] =
    await Promise.all([
      vehicleQuery,
      subsQuery,
      loadCompanyNotifySettings(supabase, parentCompanyId),
      loadUserAccessibleSubcompanyIds(profile),
    ]);

  const subsList: { id: string; name: string | null; is_primary: boolean | null }[] = subcompanyId
    ? subsResult.data
      ? [subsResult.data as { id: string; name: string | null; is_primary: boolean | null }]
      : []
    : ((subsResult.data ?? []) as { id: string; name: string | null; is_primary: boolean | null }[]);
  const sErr = subsResult.error;

  if (vErr) return { error: vErr.message };
  if (sErr) return { error: sErr.message };

  const vehicleIds = (vehicles ?? []).map((v) => v.id as string);
  let docRows: { vehicle_id: string; doc_type: string }[] = [];
  if (vehicleIds.length) {
    const { data, error: dErr } = await supabase
      .from("vehicle_documents")
      .select("vehicle_id, doc_type")
      .eq("parent_company_id", parentCompanyId)
      .eq("version_status", "current")
      .in("vehicle_id", vehicleIds);
    if (dErr) return { error: dErr.message };
    docRows = (data ?? []) as { vehicle_id: string; doc_type: string }[];
  }

  const transferredOutVehicles = subcompanyId
    ? await loadTransferredOutVehicles(
        supabase,
        parentCompanyId,
        subcompanyId,
        accessibleSubcompanyIds,
      )
    : [];

  const typesByVehicle = new Map<string, string[]>();
  for (const row of docRows ?? []) {
    const list = typesByVehicle.get(row.vehicle_id) ?? [];
    list.push(row.doc_type);
    typesByVehicle.set(row.vehicle_id, list);
  }

  const rows: VehicleRow[] = (vehicles ?? []).map((v) => {
    const nested = v.subcompanies as { name: string | null } | { name: string | null }[] | null;
    const subName = Array.isArray(nested) ? nested[0]?.name : nested?.name;
    const { subcompanies: _s, ...rest } = v as typeof v & { subcompanies?: unknown };
    return {
      ...(rest as Omit<VehicleRow, "subcompany_name" | "missing_docs">),
      status: rest.status as VehicleStatus,
      mot_doc_attention_at: (rest as { mot_doc_attention_at?: string | null }).mot_doc_attention_at ?? null,
      phv_doc_attention_at: (rest as { phv_doc_attention_at?: string | null }).phv_doc_attention_at ?? null,
      subcompany_name: subName ?? null,
      missing_docs: missingRequiredDocTypes(typesByVehicle.get(v.id) ?? []),
    };
  });

  return {
    vehicles: rows,
    transferredOutVehicles,
    subcompanies: subsList.map((s) => ({
      id: s.id,
      name: s.name,
      is_primary: Boolean(s.is_primary),
    })),
    notifySettings,
    canManage: canManageFleet(profile),
    canDelete: canDeleteFleet(profile),
  };
}

export async function loadVehicleDetailAction(vehicleId: string): Promise<VehicleWorkspaceShellResult> {
  return getVehicleWorkspaceShell(vehicleId);
}
