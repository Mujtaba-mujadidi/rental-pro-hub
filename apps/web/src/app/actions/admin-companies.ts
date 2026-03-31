"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPublicSiteUrl } from "@/lib/supabase/site-url";

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function extForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "bin";
}

export type RegisterCompanyResult =
  | { ok: true; id: string; inviteWarning?: string }
  | { ok: false; error: string };

export type SendCompanyInviteResult = { ok: true } | { ok: false; error: string };
export type DeleteCompanyResult = { ok: true } | { ok: false; error: string };

function isNextRedirectError(e: unknown): boolean {
  if (typeof e !== "object" || e === null || !("digest" in e)) return false;
  const d = (e as { digest: unknown }).digest;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT");
}

async function sendCompanyPrimaryInviteForCompany(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
): Promise<SendCompanyInviteResult> {
  const { data: row, error: rowErr } = await admin
    .from("companies")
    .select("id, primary_contact_email, primary_contact_first_name, primary_contact_last_name")
    .eq("id", companyId)
    .maybeSingle();

  if (rowErr) return { ok: false, error: rowErr.message };
  if (!row?.id) return { ok: false, error: "Company not found." };
  const emailRaw = row.primary_contact_email?.trim();
  if (!emailRaw) {
    return { ok: false, error: "Primary contact email is missing for this company." };
  }

  const callbackBase = `${getPublicSiteUrl()}/auth/callback`;

  let inv: Awaited<ReturnType<typeof admin.auth.admin.inviteUserByEmail>>["data"];
  let invErr: Awaited<ReturnType<typeof admin.auth.admin.inviteUserByEmail>>["error"];
  try {
    const out = await admin.auth.admin.inviteUserByEmail(emailRaw, {
      redirectTo: callbackBase,
      data: {
        app_role: "rental_company",
        company_id: companyId,
        first_name: row.primary_contact_first_name ?? "",
        last_name: row.primary_contact_last_name ?? "",
      },
    });
    inv = out.data;
    invErr = out.error;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invite request failed (network or Auth API error).";
    return { ok: false, error: msg };
  }

  if (invErr) {
    const m = invErr.message;
    if (/already registered|already been registered|user already exists/i.test(m)) {
      return {
        ok: false,
        error:
          "This email already has an account. They can use “Forgot password” on the login page, or change the primary contact email on the company record.",
      };
    }
    return { ok: false, error: m };
  }

  const uid = inv?.user?.id;
  const now = new Date().toISOString();

  try {
    const { error: upErr } = await admin
      .from("companies")
      .update({
        ...(uid ? { primary_contact_user_id: uid } : {}),
        invite_last_sent_at: now,
      })
      .eq("id", companyId);

    if (upErr) {
      return { ok: false, error: upErr.message };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update company after invite." };
  }

  return { ok: true };
}

export async function sendCompanyPrimaryInviteAction(companyId: string): Promise<SendCompanyInviteResult> {
  try {
    await requireSuperAdmin();
    const trimmed = companyId?.trim();
    if (!trimmed) return { ok: false, error: "Missing company." };

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
    }

    const res = await sendCompanyPrimaryInviteForCompany(admin, trimmed);
    if (res.ok) {
      try {
        revalidatePath("/super-admin/companies");
      } catch (revalErr) {
        console.error("revalidatePath /super-admin/companies", revalErr);
      }
    }
    return res;
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("sendCompanyPrimaryInviteAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error sending invite.",
    };
  }
}

export async function registerCompanyAction(formData: FormData): Promise<RegisterCompanyResult> {
  await requireSuperAdmin();

  const name = nullIfEmpty(formData.get("name"));
  if (!name) {
    return { ok: false, error: "Company name is required." };
  }

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

  const sendInvite = formData.get("send_invite") !== "false";

  const wantsLogo = nullIfEmpty(formData.get("has_logo")) === "true";
  const logo = formData.get("logo");

  if (wantsLogo) {
    if (!(logo instanceof File) || logo.size === 0) {
      return { ok: false, error: "Upload a logo image or uncheck “Company has a logo”." };
    }
    if (!LOGO_TYPES.has(logo.type)) {
      return { ok: false, error: "Logo must be PNG, JPEG, or WebP." };
    }
    if (logo.size > LOGO_MAX_BYTES) {
      return { ok: false, error: "Logo must be 2MB or smaller." };
    }
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
    .from("companies")
    .insert({
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

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data?.id) {
    return { ok: false, error: "Could not create company." };
  }

  const companyId = data.id;

  if (wantsLogo && logo instanceof File && logo.size > 0) {
    const ext = extForMime(logo.type);
    const path = `${companyId}/logo.${ext}`;
    const buf = Buffer.from(await logo.arrayBuffer());
    const { error: upErr } = await admin.storage.from("company-logos").upload(path, buf, {
      contentType: logo.type,
      upsert: true,
    });
    if (upErr) {
      await admin.from("companies").delete().eq("id", companyId);
      return { ok: false, error: upErr.message };
    }
    const { error: logoDbErr } = await admin.from("companies").update({ logo_storage_path: path }).eq("id", companyId);
    if (logoDbErr) {
      return { ok: false, error: logoDbErr.message };
    }
  }

  let inviteWarning: string | undefined;
  if (sendInvite) {
    const invRes = await sendCompanyPrimaryInviteForCompany(admin, companyId);
    if (!invRes.ok) {
      inviteWarning = `Company saved, but invite could not be sent: ${invRes.error}`;
    }
  }

  revalidatePath("/super-admin/companies");
  if (inviteWarning) {
    return { ok: true, id: companyId, inviteWarning };
  }
  return { ok: true, id: companyId };
}

export async function deleteCompanyAction(companyId: string): Promise<DeleteCompanyResult> {
  try {
    await requireSuperAdmin();
    const trimmed = companyId?.trim();
    if (!trimmed) return { ok: false, error: "Missing company." };

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
    }

    const { data: company, error: getErr } = await admin
      .from("companies")
      .select("id, logo_storage_path")
      .eq("id", trimmed)
      .maybeSingle();
    if (getErr) return { ok: false, error: getErr.message };
    if (!company?.id) return { ok: false, error: "Company not found." };

    // Delete linked rental_company auth users so the removed tenant does not leave active company accounts behind.
    const { data: linkedProfiles, error: linkedProfilesErr } = await admin
      .from("profiles")
      .select("id, role")
      .eq("company_id", trimmed);
    if (linkedProfilesErr) return { ok: false, error: linkedProfilesErr.message };

    for (const p of linkedProfiles ?? []) {
      if (p?.id && p.role === "rental_company") {
        const { error: authDelErr } = await admin.auth.admin.deleteUser(p.id);
        if (authDelErr) {
          return {
            ok: false,
            error: `Could not delete linked rental company user (${p.id}): ${authDelErr.message}`,
          };
        }
      }
    }

    const { error: delErr } = await admin.from("companies").delete().eq("id", trimmed);
    if (delErr) return { ok: false, error: delErr.message };

    if (company.logo_storage_path) {
      const { error: rmLogoErr } = await admin.storage.from("company-logos").remove([company.logo_storage_path]);
      if (rmLogoErr) {
        console.error("deleteCompanyAction remove logo", rmLogoErr);
      }
    }

    revalidatePath("/super-admin/companies");
    return { ok: true };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("deleteCompanyAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error deleting company.",
    };
  }
}
