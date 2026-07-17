"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea, type AppProfile } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
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
import { createClient } from "@/lib/supabase/server";

export type VehicleActionResult = { ok: true; id?: string } | { ok: false; error: string };

function revalidateVehiclePaths(vehicleId?: string) {
  revalidatePath("/rental/vehicles");
  if (vehicleId) {
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

function canManageFleet(profile: AppProfile) {
  return profile.membership_role === "owner" || profile.membership_role === "admin" || profile.membership_role === "operations";
}

function canDeleteFleet(profile: AppProfile) {
  return profile.membership_role === "owner" || profile.membership_role === "admin";
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

  revalidateVehiclePaths(data.id);
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

  revalidateVehiclePaths(id);
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

  revalidateVehiclePaths(id);
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

  revalidateVehiclePaths(id);
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

  // One stored PDF per required doc type — replace previous uploads of this type
  // (including legacy pco_paper / phv_licence rows for the PHV/Taxi paper slot).
  const replaceTypes = isPhvTaxiLicencePaperDocType(docTypeRaw)
    ? (["phv_taxi_licence_paper", "pco_paper", "phv_licence"] as const)
    : ([docTypeRaw] as const);
  const { data: existing } = await supabase
    .from("vehicle_documents")
    .select("id, file_path")
    .eq("vehicle_id", vehicleId)
    .in("doc_type", [...replaceTypes]);
  if (existing?.length) {
    await supabase
      .from("vehicle_documents")
      .delete()
      .in(
        "id",
        existing.map((r) => r.id),
      );
    await supabase.storage.from("vehicle-documents").remove(existing.map((r) => r.file_path));
  }

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
  });
  if (insErr) {
    await supabase.storage.from("vehicle-documents").remove([path]);
    return { ok: false, error: insErr.message };
  }

  revalidateVehiclePaths(vehicleId);
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

  revalidateVehiclePaths(doc.vehicle_id);
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
  subcompanies: { id: string; name: string | null; is_primary: boolean }[];
  canManage: boolean;
  canDelete: boolean;
};

export type VehicleSwitcherOption = {
  id: string;
  vrm: string;
  make: string;
  model: string;
  status: VehicleStatus;
};

/** Slim fleet list for the vehicle workspace switcher. */
export async function loadVehicleSwitcherList(): Promise<VehicleSwitcherOption[] | { error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { error: "No active company." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .select("id, vrm, make, model, status")
    .eq("parent_company_id", parentCompanyId)
    .order("vrm", { ascending: true });
  if (error) return { error: error.message };

  return (data ?? []).map((v) => ({
    id: v.id,
    vrm: v.vrm,
    make: v.make,
    model: v.model,
    status: v.status as VehicleStatus,
  }));
}

export async function loadVehiclesPageData(): Promise<VehiclesPageData | { error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { error: "No active company." };

  const supabase = await createClient();
  const [{ data: vehicles, error: vErr }, { data: subs, error: sErr }, { data: docRows, error: dErr }] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select(
          "id, parent_company_id, subcompany_id, vrm, make, model, colour, first_reg_date, first_reg_uk_date, fuel_type, seats, cc, mot_expiry, tax_expiry, phv_licence_no, phv_licence_expiry, licensing_authority_name, status, vehicle_age_limit_years, service_due_at, current_mileage, next_service_mileage, notes, created_at, updated_at, subcompanies(name)",
        )
        .eq("parent_company_id", parentCompanyId)
        .order("vrm", { ascending: true }),
      supabase
        .from("subcompanies")
        .select("id, name, is_primary")
        .eq("parent_company_id", parentCompanyId)
        .order("created_at", { ascending: true }),
      supabase.from("vehicle_documents").select("vehicle_id, doc_type").eq("parent_company_id", parentCompanyId),
    ]);

  if (vErr) return { error: vErr.message };
  if (sErr) return { error: sErr.message };
  if (dErr) return { error: dErr.message };

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
      subcompany_name: subName ?? null,
      missing_docs: missingRequiredDocTypes(typesByVehicle.get(v.id) ?? []),
    };
  });

  return {
    vehicles: rows,
    subcompanies: (subs ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      is_primary: Boolean(s.is_primary),
    })),
    canManage: canManageFleet(profile),
    canDelete: canDeleteFleet(profile),
  };
}

export async function loadVehicleDetailAction(vehicleId: string): Promise<
  | {
      ok: true;
      vehicle: VehicleRow;
      documents: VehicleDocumentRow[];
      transfers: VehicleTransferRow[];
      subcompanies: { id: string; name: string | null; is_primary: boolean }[];
      canManage: boolean;
      canDelete: boolean;
    }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  const supabase = await createClient();
  const [{ data: vehicle, error: vErr }, { data: docs, error: dErr }, { data: transfers, error: tErr }, { data: subs, error: sErr }] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select(
          "*, subcompanies(name)",
        )
        .eq("id", id)
        .eq("parent_company_id", parentCompanyId)
        .maybeSingle(),
      supabase
        .from("vehicle_documents")
        .select("id, vehicle_id, doc_type, file_path, file_name, content_type, expiry_date, issued_date, notes, created_at")
        .eq("vehicle_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("vehicle_transfers")
        .select("id, vehicle_id, from_subcompany_id, to_subcompany_id, transferred_at, notes")
        .eq("vehicle_id", id)
        .order("transferred_at", { ascending: false })
        .limit(20),
      supabase
        .from("subcompanies")
        .select("id, name, is_primary")
        .eq("parent_company_id", parentCompanyId)
        .order("created_at", { ascending: true }),
    ]);

  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };
  if (dErr) return { ok: false, error: dErr.message };
  if (tErr) return { ok: false, error: tErr.message };
  if (sErr) return { ok: false, error: sErr.message };

  const nested = vehicle.subcompanies as { name: string | null } | { name: string | null }[] | null;
  const subName = Array.isArray(nested) ? nested[0]?.name : nested?.name;
  const { subcompanies: _s, ...rest } = vehicle as typeof vehicle & { subcompanies?: unknown };

  const subIds = [
    ...new Set((transfers ?? []).flatMap((t) => [t.from_subcompany_id, t.to_subcompany_id])),
  ];
  const nameById = new Map<string, string | null>();
  for (const s of subs ?? []) nameById.set(s.id, s.name);
  for (const sid of subIds) {
    if (!nameById.has(sid)) {
      // already loaded all company subs above
    }
  }

  return {
    ok: true,
    vehicle: {
      ...(rest as Omit<VehicleRow, "subcompany_name" | "missing_docs">),
      status: rest.status as VehicleStatus,
      subcompany_name: subName ?? null,
      missing_docs: missingRequiredDocTypes((docs ?? []).map((d) => d.doc_type)),
    },
    documents: (docs ?? []) as VehicleDocumentRow[],
    transfers: (transfers ?? []).map((t) => ({
      ...t,
      from_name: nameById.get(t.from_subcompany_id) ?? null,
      to_name: nameById.get(t.to_subcompany_id) ?? null,
    })),
    subcompanies: (subs ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      is_primary: Boolean(s.is_primary),
    })),
    canManage: canManageFleet(profile),
    canDelete: canDeleteFleet(profile),
  };
}
