"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea, type AppProfile } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import {
  isVehicleDocType,
  isVehicleStatus,
  normalizeVrm,
  type VehicleDocType,
  type VehicleDocumentRow,
  type VehicleRow,
  type VehicleStatus,
  type VehicleTransferRow,
} from "@/lib/fleet/vehicles";
import { createClient } from "@/lib/supabase/server";

export type VehicleActionResult = { ok: true; id?: string } | { ok: false; error: string };

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

  revalidatePath("/rental/vehicles");
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

  revalidatePath("/rental/vehicles");
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

  revalidatePath("/rental/vehicles");
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

  revalidatePath("/rental/vehicles");
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
  const docTypeRaw = nullIfEmpty(formData.get("doc_type")) ?? "other";
  if (!vehicleId) return { ok: false, error: "Missing vehicle." };
  if (!isVehicleDocType(docTypeRaw)) return { ok: false, error: "Invalid document type." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to upload." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "File must be 10 MB or smaller." };

  const allowed = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(file.type)) return { ok: false, error: "Use PDF, JPEG, PNG, or WebP." };

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

  const ext =
    file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
  const safeName = `${docTypeRaw}-${Date.now()}.${ext}`;
  const path = `${parentCompanyId}/${vehicleId}/${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from("vehicle-documents").upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: insErr } = await supabase.from("vehicle_documents").insert({
    vehicle_id: vehicleId,
    parent_company_id: parentCompanyId,
    doc_type: docTypeRaw as VehicleDocType,
    file_path: path,
    file_name: file.name || safeName,
    content_type: file.type,
    expiry_date: nullIfEmpty(formData.get("expiry_date")),
    issued_date: nullIfEmpty(formData.get("issued_date")),
    notes: nullIfEmpty(formData.get("notes")),
    uploaded_by: user.id,
  });
  if (insErr) {
    await supabase.storage.from("vehicle-documents").remove([path]);
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/rental/vehicles");
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

  revalidatePath("/rental/vehicles");
  return { ok: true, id: doc.vehicle_id };
}

export type VehiclesPageData = {
  vehicles: VehicleRow[];
  subcompanies: { id: string; name: string | null; is_primary: boolean }[];
  canManage: boolean;
  canDelete: boolean;
};

export async function loadVehiclesPageData(): Promise<VehiclesPageData | { error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { error: "No active company." };

  const supabase = await createClient();
  const [{ data: vehicles, error: vErr }, { data: subs, error: sErr }] = await Promise.all([
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
  ]);

  if (vErr) return { error: vErr.message };
  if (sErr) return { error: sErr.message };

  const rows: VehicleRow[] = (vehicles ?? []).map((v) => {
    const nested = v.subcompanies as { name: string | null } | { name: string | null }[] | null;
    const subName = Array.isArray(nested) ? nested[0]?.name : nested?.name;
    const { subcompanies: _s, ...rest } = v as typeof v & { subcompanies?: unknown };
    return {
      ...(rest as Omit<VehicleRow, "subcompany_name">),
      status: rest.status as VehicleStatus,
      subcompany_name: subName ?? null,
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
    }
  | { ok: false; error: string }
> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  const supabase = await createClient();
  const [{ data: vehicle, error: vErr }, { data: docs, error: dErr }, { data: transfers, error: tErr }] =
    await Promise.all([
      supabase.from("vehicles").select("*").eq("id", id).eq("parent_company_id", parentCompanyId).maybeSingle(),
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
    ]);

  if (vErr) return { ok: false, error: vErr.message };
  if (!vehicle) return { ok: false, error: "Vehicle not found." };
  if (dErr) return { ok: false, error: dErr.message };
  if (tErr) return { ok: false, error: tErr.message };

  const subIds = [
    ...new Set((transfers ?? []).flatMap((t) => [t.from_subcompany_id, t.to_subcompany_id])),
  ];
  const nameById = new Map<string, string | null>();
  if (subIds.length > 0) {
    const { data: subs } = await supabase.from("subcompanies").select("id, name").in("id", subIds);
    for (const s of subs ?? []) nameById.set(s.id, s.name);
  }

  return {
    ok: true,
    vehicle: { ...(vehicle as VehicleRow), status: vehicle.status as VehicleStatus },
    documents: (docs ?? []) as VehicleDocumentRow[],
    transfers: (transfers ?? []).map((t) => ({
      ...t,
      from_name: nameById.get(t.from_subcompany_id) ?? null,
      to_name: nameById.get(t.to_subcompany_id) ?? null,
    })),
  };
}
