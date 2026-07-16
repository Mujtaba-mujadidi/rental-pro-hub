"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";

export type RegisterSubcompanyResult = { ok: true; id: string } | { ok: false; error: string };

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function registerSubcompanyAction(formData: FormData): Promise<RegisterSubcompanyResult> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return { ok: false, error: frozen.error };
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "Missing rental company context." };

  const name = nullIfEmpty(formData.get("name"));
  if (!name) return { ok: false, error: "Company name is required." };

  const firstName = nullIfEmpty(formData.get("primary_contact_first_name"));
  const lastName = nullIfEmpty(formData.get("primary_contact_last_name"));
  const contactEmail = nullIfEmpty(formData.get("primary_contact_email"));
  const contactPhone = nullIfEmpty(formData.get("primary_contact_phone"));
  const dobRaw = nullIfEmpty(formData.get("primary_contact_dob"));

  if (!firstName) return { ok: false, error: "Primary contact first name is required." };
  if (!lastName) return { ok: false, error: "Primary contact last name is required." };
  if (!contactEmail) return { ok: false, error: "Primary contact email is required." };
  if (!contactPhone) return { ok: false, error: "Primary contact phone is required." };
  if (!dobRaw) return { ok: false, error: "Primary contact date of birth is required." };

  let dob: string;
  try {
    const d = new Date(dobRaw);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid date of birth." };
    dob = d.toISOString().slice(0, 10);
  } catch {
    return { ok: false, error: "Invalid date of birth." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const statusRaw = nullIfEmpty(formData.get("status")) ?? "active";
  const status =
    statusRaw === "active" || statusRaw === "inactive" || statusRaw === "pending" ? statusRaw : "active";

  const postcodeRaw = nullIfEmpty(formData.get("registered_postcode"));
  const registeredPostcode = postcodeRaw ? postcodeRaw.trim().toUpperCase().replace(/\s+/g, "") : null;

  const { data, error } = await admin
    .from("subcompanies")
    .insert({
      parent_company_id: parentCompanyId,
      is_primary: false,
      name,
      legal_name: nullIfEmpty(formData.get("legal_name")),
      company_number: nullIfEmpty(formData.get("company_number")),
      registered_address_line1: nullIfEmpty(formData.get("registered_address_line1")),
      registered_address_line2: nullIfEmpty(formData.get("registered_address_line2")),
      registered_town: nullIfEmpty(formData.get("registered_town")),
      registered_county: nullIfEmpty(formData.get("registered_county")),
      registered_postcode: registeredPostcode,
      country: nullIfEmpty(formData.get("country")) ?? "GB",
      primary_contact_first_name: firstName,
      primary_contact_last_name: lastName,
      primary_contact_dob: dob,
      primary_contact_phone: contactPhone,
      primary_contact_email: contactEmail,
      status,
      notes: nullIfEmpty(formData.get("notes")),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "Could not create subcompany." };

  revalidatePath("/rental/subcompany");
  return { ok: true, id: data.id };
}
