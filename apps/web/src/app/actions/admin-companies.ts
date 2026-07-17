"use server";

import { revalidatePath } from "next/cache";
import { revalidateCompanyGate } from "@/lib/auth/company-gate-cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { useLegacyBootstrapContractSigning } from "@/lib/esign/legacy-bootstrap";
import { preparePlatformCompanyContractEnvelope } from "@/lib/esign/adapters/platform-company-contract";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { insertCompanyDeletionArchive } from "@/lib/companies/deletion-archive";
import { runPermanentCompanyPurgeWithProgress } from "@/lib/companies/permanent-company-purge";
import { createClient as createSupabasePublicClient } from "@supabase/supabase-js";
import { resolveSupabasePublishableEnv } from "@/lib/supabase/env";
import { getPublicSiteUrl } from "@/lib/supabase/site-url";
import { companyIdentitiesMatch } from "@/lib/companies/company-identity";
import {
  ensureRentalCompanyMembership,
  findAuthUserIdByEmail,
} from "@/lib/auth/ensure-rental-membership";

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export type RegisterCompanyResult =
  | { ok: true; id: string; inviteWarning?: string; eSignWarning?: string; esignEnvelopeId?: string }
  | { ok: false; error: string };

export type SendCompanyInviteResult = { ok: true } | { ok: false; error: string };
export type DeleteCompanyResult = { ok: true } | { ok: false; error: string };
export type ApplyContractChangeResult = { ok: true } | { ok: false; error: string };

function isNextRedirectError(e: unknown): boolean {
  if (typeof e !== "object" || e === null || !("digest" in e)) return false;
  const d = (e as { digest: unknown }).digest;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT");
}

/** Convert / attach an Auth user as the company primary contact (owner). */
async function promoteExistingUserToCompanyPrimary(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  userId: string,
  row: {
    primary_contact_first_name: string | null;
    primary_contact_last_name: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const first = row.primary_contact_first_name?.trim() || "";
  const last = row.primary_contact_last_name?.trim() || "";
  const ensured = await ensureRentalCompanyMembership(admin, {
    userId,
    companyId,
    membershipRole: "owner",
    companyRole: "admin",
    firstName: first,
    lastName: last,
    displayName: [first, last].filter(Boolean).join(" ").trim() || "Company admin",
    subcompanyScope: "all",
  });
  if (!ensured.ok) return ensured;

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("companies")
    .update({
      primary_contact_user_id: userId,
      invite_last_sent_at: now,
      pending_primary_invite_after_contract_signed: false,
    })
    .eq("id", companyId);
  if (upErr) return { ok: false, error: upErr.message };

  return { ok: true };
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
        company_role: "admin",
        company_id: companyId,
        first_name: row.primary_contact_first_name ?? "",
        last_name: row.primary_contact_last_name ?? "",
        rental_membership_role: "owner",
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
      const existingId = await findAuthUserIdByEmail(admin, emailRaw);
      if (!existingId) {
        return {
          ok: false,
          error:
            "This email already has an account, but it could not be linked. Ask them to use Forgot password, or change the primary contact email.",
        };
      }
      // Account already has a password (e.g. accidental driver signup). Promote to rental owner.
      return promoteExistingUserToCompanyPrimary(admin, companyId, existingId, row);
    }
    return { ok: false, error: m };
  }

  // Critical: do not trust handle_new_user alone — invite metadata is often missing on INSERT,
  // which previously defaulted the user to profiles.role = driver.
  const uid = inv?.user?.id ?? (await findAuthUserIdByEmail(admin, emailRaw));
  if (!uid) {
    return {
      ok: false,
      error:
        "Invite may have been emailed, but the account could not be linked as company admin. Use Resend invite.",
    };
  }

  return promoteExistingUserToCompanyPrimary(admin, companyId, uid, row);
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

/** Sends the standard Supabase password-recovery email to the primary contact (after they have signed in at least once). */
export async function sendPrimaryContactPasswordResetAction(companyId: string): Promise<SendCompanyInviteResult> {
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

    const { data: row, error: rowErr } = await admin
      .from("companies")
      .select("id, primary_contact_email, primary_contact_user_id")
      .eq("id", trimmed)
      .maybeSingle();
    if (rowErr) return { ok: false, error: rowErr.message };
    if (!row?.id) return { ok: false, error: "Company not found." };

    const email = row.primary_contact_email?.trim();
    const uid = row.primary_contact_user_id?.trim();
    if (!email) {
      return { ok: false, error: "Primary contact email is missing for this company." };
    }
    if (!uid) {
      return { ok: false, error: "Send an invite first to create the primary contact account." };
    }

    const { data: auth, error: authErr } = await admin.auth.admin.getUserById(uid);
    if (authErr || !auth?.user) {
      return { ok: false, error: authErr?.message ?? "Could not load the primary contact account." };
    }
    if (!auth.user.last_sign_in_at) {
      return {
        ok: false,
        error: "The primary contact has not signed in yet. Use Resend invite until they finish signup.",
      };
    }

    const { url, anonKey } = resolveSupabasePublishableEnv();
    const pub = createSupabasePublicClient(url, anonKey);
    const redirectTo = `${getPublicSiteUrl()}/auth/callback`;
    const { error: resetErr } = await pub.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetErr) {
      return { ok: false, error: resetErr.message };
    }

    try {
      revalidatePath("/super-admin/companies");
    } catch (revalErr) {
      console.error("revalidatePath /super-admin/companies", revalErr);
    }
    return { ok: true };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("sendPrimaryContactPasswordResetAction", e);
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export type InitialContractCommercial = {
  contract_type?: string | null;
  pricing_model?: string | null;
  billing_frequency?: string | null;
  start_date?: string | null;
  currency?: string | null;
  payment_terms_days?: number | null;
  billing_anchor_day?: number | null;
  recurring_amount?: number | null;
  signatory_name?: string | null;
  signatory_title?: string | null;
  signatory_email?: string | null;
  preset_id?: string | null;
};

export type InitialContractTermsBinding = {
  catalogVersionId: string | null;
  snapshot: Record<string, unknown>;
};

export async function createInitialCompanyContract(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  legalSnapshot: Record<string, unknown>,
  commercial: InitialContractCommercial,
  options?: { forceLegacyBootstrap?: boolean; terms?: InitialContractTermsBinding | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const legacy = options?.forceLegacyBootstrap === true || useLegacyBootstrapContractSigning();
  const now = new Date().toISOString();
  const commercialSnapshot: Record<string, unknown> = {
    ...commercial,
    recurring_amount: commercial.recurring_amount ?? null,
  };

  const contractInsert: Record<string, unknown> = {
    parent_company_id: companyId,
    status: legacy ? "active" : "draft",
    legacy_bootstrap_signed: legacy,
    contract_type: commercial.contract_type ?? null,
    pricing_model: commercial.pricing_model ?? null,
    billing_frequency: commercial.billing_frequency ?? "monthly",
    start_date: commercial.start_date ?? null,
    currency: commercial.currency ?? "GBP",
    payment_terms_days: commercial.payment_terms_days ?? 30,
    billing_anchor_day: commercial.billing_anchor_day ?? null,
  };

  const { data: contractRow, error: cErr } = await admin
    .from("company_contracts")
    .insert(contractInsert)
    .select("id")
    .single();
  if (cErr || !contractRow?.id) {
    return { ok: false, error: cErr?.message ?? "Could not create company contract." };
  }

  const termsBinding = options?.terms;
  const termsSnapshot = termsBinding?.snapshot && Object.keys(termsBinding.snapshot).length > 0 ? termsBinding.snapshot : {};
  const termsCatalogId = termsBinding?.catalogVersionId?.trim() || null;

  const versionInsert: Record<string, unknown> = {
    contract_id: contractRow.id,
    version_number: 1,
    snapshot: legalSnapshot,
    legal_snapshot: legalSnapshot,
    commercial_snapshot: commercialSnapshot,
    pricing_snapshot: { amount: commercial.recurring_amount ?? 0, currency: commercial.currency ?? "GBP" },
    version_status: legacy ? "legacy_import" : "draft",
    signed_at: legacy ? now : null,
    terms_snapshot: termsSnapshot,
    terms_catalog_version_id: termsCatalogId,
  };

  const { data: verRow, error: vErr } = await admin
    .from("company_contract_versions")
    .insert(versionInsert)
    .select("id")
    .single();
  if (vErr || !verRow?.id) {
    return { ok: false, error: vErr?.message ?? "Could not create contract version." };
  }

  if (legacy) {
    await admin
      .from("company_contracts")
      .update({ current_version_id: verRow.id, contract_signed_at: now })
      .eq("id", contractRow.id);
  } else {
    await admin.from("company_contracts").update({ current_version_id: verRow.id }).eq("id", contractRow.id);
  }

  const { error: snapErr } = await admin.from("contract_pricing_snapshots").insert({
    contract_id: contractRow.id,
    version_id: verRow.id,
    snapshot: versionInsert.pricing_snapshot as Record<string, unknown>,
    preset_id: commercial.preset_id ?? null,
  });
  if (snapErr) {
    return { ok: false, error: snapErr.message };
  }

  return { ok: true };
}

/** After company contract is marked active: send queued primary invite if opted into invite-after-sign. */
export async function trySendPendingPrimaryInviteAfterContractSigned(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
): Promise<void> {
  const { data: co, error } = await admin
    .from("companies")
    .select("pending_primary_invite_after_contract_signed")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !co?.pending_primary_invite_after_contract_signed) return;
  const inv = await sendCompanyPrimaryInviteForCompany(admin, companyId);
  if (!inv.ok) {
    console.error("[invite-after-sign] Pending primary invite failed", companyId, inv.error);
  }
}

export async function getRegisterCompanyInviteDefaultsAction(): Promise<
  { ok: true; defaultSendInvite: boolean } | { ok: false; error: string }
> {
  try {
    await requireSuperAdmin();
    return { ok: true, defaultSendInvite: useLegacyBootstrapContractSigning() };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

export async function listCompanyIdentitiesAction(): Promise<
  | {
      ok: true;
      companies: { id: string; name: string; primary_contact_email: string | null; company_number: string | null }[];
    }
  | { ok: false; error: string }
> {
  try {
    await requireSuperAdmin();
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return { ok: false, error: "Not authorised." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data, error } = await admin
    .from("companies")
    .select("id, name, primary_contact_email, company_number");
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    companies: (data ?? []).map((r) => ({
      id: r.id as string,
      name: String(r.name ?? ""),
      primary_contact_email: (r.primary_contact_email as string | null) ?? null,
      company_number: (r.company_number as string | null) ?? null,
    })),
  };
}

export async function registerCompanyAction(formData: FormData): Promise<RegisterCompanyResult> {
  const { user } = await requireSuperAdmin();

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

  const legalName = nullIfEmpty(formData.get("legal_name"));
  const billingEmail = nullIfEmpty(formData.get("billing_email"));
  const companyNumber = nullIfEmpty(formData.get("company_number"));
  const reg1 = nullIfEmpty(formData.get("registered_address_line1"));
  const reg2 = nullIfEmpty(formData.get("registered_address_line2"));
  const regTown = nullIfEmpty(formData.get("registered_town"));
  const regCounty = nullIfEmpty(formData.get("registered_county"));
  const country = nullIfEmpty(formData.get("country")) ?? "GB";
  const notes = nullIfEmpty(formData.get("notes"));

  // Prevent duplicate companies (name, primary contact email, or company number).
  const { data: existingRows, error: existingErr } = await admin
    .from("companies")
    .select("id, name, primary_contact_email, company_number");
  if (existingErr) {
    return { ok: false, error: existingErr.message };
  }
  const proposed = {
    name,
    primary_contact_email: contactEmail,
    company_number: companyNumber,
  };
  const duplicate = (existingRows ?? []).find((row) =>
    companyIdentitiesMatch(proposed, {
      name: row.name ?? "",
      primary_contact_email: row.primary_contact_email,
      company_number: row.company_number,
    }),
  );
  if (duplicate) {
    const why =
      contactEmail &&
      duplicate.primary_contact_email &&
      contactEmail.trim().toLowerCase() === String(duplicate.primary_contact_email).trim().toLowerCase()
        ? "primary contact email"
        : companyNumber &&
            duplicate.company_number &&
            companyNumber.trim().toUpperCase().replace(/\s+/g, "") ===
              String(duplicate.company_number).trim().toUpperCase().replace(/\s+/g, "")
          ? "company number"
          : "company name";
    return {
      ok: false,
      error: `A company with this ${why} already exists (${duplicate.name}). Open that company instead of creating a duplicate.`,
    };
  }

  const termsCatalogVersionIdEarly = nullIfEmpty(formData.get("terms_catalog_version_id"));
  const { count: publishedTermsCount, error: termsCountErr } = await admin
    .from("contract_terms_versions")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("family", "rental_master");
  if (termsCountErr) {
    return { ok: false, error: termsCountErr.message };
  }
  const hasPublishedTerms = (publishedTermsCount ?? 0) > 0;
  if (hasPublishedTerms && !termsCatalogVersionIdEarly) {
    return {
      ok: false,
      error: "Select the terms & conditions version that applies to this contract (Super admin → Contract terms).",
    };
  }

  let termsBinding: InitialContractTermsBinding | null = null;
  if (termsCatalogVersionIdEarly) {
    const { data: trow, error: terr } = await admin
      .from("contract_terms_versions")
      .select("id, family, version_label, title, body, body_hash, status")
      .eq("id", termsCatalogVersionIdEarly)
      .eq("status", "published")
      .maybeSingle();
    if (terr || !trow?.id) {
      return { ok: false, error: "Terms version not found or not published." };
    }
    termsBinding = {
      catalogVersionId: trow.id as string,
      snapshot: {
        terms_version_id: trow.id,
        family: trow.family,
        version_label: trow.version_label,
        title: trow.title,
        body_hash: trow.body_hash,
        body: trow.body,
        accepted_via: "registration",
      },
    };
  }

  const { data, error } = await admin
    .from("companies")
    .insert({
      name,
      legal_name: legalName,
      company_number: companyNumber,
      registered_address_line1: reg1,
      registered_address_line2: reg2,
      registered_town: regTown,
      registered_county: regCounty,
      registered_postcode: registeredPostcode,
      country,
      primary_contact_first_name: firstName,
      primary_contact_last_name: lastName,
      primary_contact_dob: dob,
      primary_contact_phone: contactPhone,
      primary_contact_email: contactEmail,
      billing_email: billingEmail,
      status,
      notes,
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

  const contractSnap = {
    name,
    legal_name: legalName,
    company_number: companyNumber,
    registered_address_line1: reg1,
    registered_address_line2: reg2,
    registered_town: regTown,
    registered_county: regCounty,
    registered_postcode: registeredPostcode,
    country,
    primary_contact_first_name: firstName,
    primary_contact_last_name: lastName,
    primary_contact_dob: dob,
    primary_contact_phone: contactPhone,
    primary_contact_email: contactEmail,
    billing_email: billingEmail,
    notes,
  };

  const parseOptInt = (v: FormDataEntryValue | null): number | null => {
    const s = nullIfEmpty(v);
    if (s == null) return null;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };
  const parseOptAmount = (v: FormDataEntryValue | null): number | null => {
    const s = nullIfEmpty(v);
    if (s == null) return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  const commercial: InitialContractCommercial = {
    contract_type: nullIfEmpty(formData.get("contract_type")),
    pricing_model: nullIfEmpty(formData.get("pricing_model")),
    billing_frequency: nullIfEmpty(formData.get("billing_frequency")) ?? "monthly",
    start_date: nullIfEmpty(formData.get("contract_start_date")),
    currency: nullIfEmpty(formData.get("currency")) ?? "GBP",
    payment_terms_days: parseOptInt(formData.get("payment_terms_days")),
    billing_anchor_day: parseOptInt(formData.get("billing_anchor_day")),
    recurring_amount: parseOptAmount(formData.get("recurring_amount")),
    signatory_name: nullIfEmpty(formData.get("signatory_name")),
    signatory_title: nullIfEmpty(formData.get("signatory_title")),
    signatory_email: nullIfEmpty(formData.get("signatory_email")),
    preset_id: nullIfEmpty(formData.get("pricing_preset_id")),
  };

  const presetId = commercial.preset_id?.trim();
  if (presetId) {
    const { data: pr } = await admin
      .from("contract_pricing_presets")
      .select("id, pricing_model_type, parameters, billing_frequency, currency")
      .eq("id", presetId)
      .maybeSingle();
    if (pr) {
      commercial.preset_id = pr.id as string;
      commercial.pricing_model = (pr.pricing_model_type as string) ?? commercial.pricing_model;
      commercial.currency = (pr.currency as string) ?? commercial.currency;
      if (pr.billing_frequency) commercial.billing_frequency = pr.billing_frequency as string;
      const params = (pr.parameters ?? {}) as Record<string, unknown>;
      const amt = params.monthly_amount ?? params.amount ?? params.recurring_amount;
      if (typeof amt === "number" && Number.isFinite(amt)) commercial.recurring_amount = amt;
      else if (typeof amt === "string") {
        const n = Number.parseFloat(amt);
        if (Number.isFinite(n)) commercial.recurring_amount = n;
      }
    }
  }

  const contractRes = await createInitialCompanyContract(admin, companyId, contractSnap, commercial, {
    terms: termsBinding,
  });
  if (!contractRes.ok) {
    await admin.from("companies").delete().eq("id", companyId);
    return { ok: false, error: contractRes.error };
  }

  const { error: subcompanyErr } = await admin.from("subcompanies").insert({
    parent_company_id: companyId,
    is_primary: true,
    name,
    legal_name: legalName,
    company_number: companyNumber,
    registered_address_line1: reg1,
    registered_address_line2: reg2,
    registered_town: regTown,
    registered_county: regCounty,
    registered_postcode: registeredPostcode,
    country,
    primary_contact_first_name: firstName,
    primary_contact_last_name: lastName,
    primary_contact_dob: dob,
    primary_contact_phone: contactPhone,
    primary_contact_email: contactEmail,
    status,
    notes,
  });
  if (subcompanyErr) {
    await admin.from("companies").delete().eq("id", companyId);
    return { ok: false, error: `Could not create default subcompany: ${subcompanyErr.message}` };
  }

  const usesEsignPath = !useLegacyBootstrapContractSigning();
  const pendingAfterSign = usesEsignPath && !sendInvite;
  const { error: pendingErr } = await admin
    .from("companies")
    .update({ pending_primary_invite_after_contract_signed: pendingAfterSign })
    .eq("id", companyId);
  if (pendingErr) {
    return { ok: false, error: pendingErr.message };
  }

  let eSignWarning: string | undefined;
  let esignEnvelopeId: string | undefined;
  if (usesEsignPath) {
    const esign = await preparePlatformCompanyContractEnvelope(admin, companyId, user.id);
    if (!esign.ok) {
      eSignWarning = `Contract PDF was not prepared for e-sign: ${esign.error}. Use “Prepare contract for e-sign” on the company row when ready.`;
    } else {
      esignEnvelopeId = esign.envelopeId;
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
  revalidatePath("/rental");
  if (inviteWarning || eSignWarning || esignEnvelopeId) {
    return { ok: true, id: companyId, inviteWarning, eSignWarning, esignEnvelopeId };
  }
  return { ok: true, id: companyId };
}

export type CompanyLifecycleResult = { ok: true } | { ok: false; error: string };

/** Begin 6-month offboarding: archive snapshot, mark company + terminate contract; tenants get limited app access. */
export async function startCompanyOffboardingAction(companyId: string): Promise<CompanyLifecycleResult> {
  try {
    const { user } = await requireSuperAdmin();
    const trimmed = companyId?.trim();
    if (!trimmed) return { ok: false, error: "Missing company." };

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
    }

    const { data: row, error: getErr } = await admin
      .from("companies")
      .select("id, deletion_phase")
      .eq("id", trimmed)
      .maybeSingle();
    if (getErr) return { ok: false, error: getErr.message };
    if (!row?.id) return { ok: false, error: "Company not found." };

    const phase = (row.deletion_phase as string) ?? "active";
    if (phase !== "active") {
      return { ok: false, error: "Offboarding can only start for a company in the active lifecycle phase." };
    }

    const archived = await insertCompanyDeletionArchive(admin, trimmed, user.id, {
      reason: "offboarding_start",
      linkCompanyRow: true,
    });
    if (!archived.ok) {
      return { ok: false, error: `Could not archive company data: ${archived.error}` };
    }

    const ends = new Date();
    ends.setMonth(ends.getMonth() + 6);

    const { error: upCo } = await admin
      .from("companies")
      .update({
        deletion_phase: "offboarding",
        offboarding_started_at: new Date().toISOString(),
        offboarding_ends_at: ends.toISOString(),
        access_blocked_at: null,
        deletion_requested_by: user.id,
      })
      .eq("id", trimmed);
    if (upCo) return { ok: false, error: upCo.message };

    const { error: termErr } = await admin
      .from("company_contracts")
      .update({
        status: "terminated",
        terminated_at: new Date().toISOString(),
        termination_reason: "Company offboarding (archived; contract closed pending purge or reactivation).",
      })
      .eq("parent_company_id", trimmed);
    if (termErr) console.warn("[startCompanyOffboardingAction] terminate contract", termErr.message);

    revalidateCompanyGate(trimmed);
    revalidatePath("/super-admin/companies");
    return { ok: true };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Restore operations and start a new contract / onboarding path (before permanent purge). */
export async function reactivateCompanyAction(companyId: string): Promise<CompanyLifecycleResult> {
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

    const { data: row, error: getErr } = await admin
      .from("companies")
      .select("id, deletion_phase")
      .eq("id", trimmed)
      .maybeSingle();
    if (getErr) return { ok: false, error: getErr.message };
    if (!row?.id) return { ok: false, error: "Company not found." };

    const phase = (row.deletion_phase as string) ?? "active";
    if (phase !== "offboarding" && phase !== "access_blocked") {
      return { ok: false, error: "Only offboarding or access-blocked companies can be reactivated." };
    }

    const { error: upCo } = await admin
      .from("companies")
      .update({
        deletion_phase: "active",
        offboarding_started_at: null,
        offboarding_ends_at: null,
        access_blocked_at: null,
        deletion_requested_by: null,
        rental_onboarding_completed_at: null,
        rental_onboarding_step: 0,
      })
      .eq("id", trimmed);
    if (upCo) return { ok: false, error: upCo.message };

    const { error: ctrErr } = await admin
      .from("company_contracts")
      .update({
        status: "draft",
        terminated_at: null,
        termination_reason: null,
      })
      .eq("parent_company_id", trimmed);
    if (ctrErr) console.warn("[reactivateCompanyAction] contract reset", ctrErr.message);

    revalidateCompanyGate(trimmed);
    revalidatePath("/super-admin/companies");
    revalidatePath("/rental");
    return { ok: true };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error." };
  }
}

/** Shared purge: tenant auth users + company row + logo. No new archive (snapshot at offboarding start). */
async function executePermanentCompanyPurge(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  logoStoragePath: string | null,
): Promise<DeleteCompanyResult> {
  const result = await runPermanentCompanyPurgeWithProgress(admin, companyId, logoStoragePath, () => {});
  if (!result.ok) return result;
  revalidatePath("/super-admin/companies");
  return { ok: true };
}

/**
 * Permanent delete after the retention window: only when `access_blocked`.
 * Does not insert a new archive row (snapshot was taken at offboarding start).
 */
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
      .select("id, logo_storage_path, deletion_phase")
      .eq("id", trimmed)
      .maybeSingle();
    if (getErr) return { ok: false, error: getErr.message };
    if (!company?.id) return { ok: false, error: "Company not found." };

    const phase = (company.deletion_phase as string) ?? "active";
    if (phase !== "access_blocked") {
      return {
        ok: false,
        error:
          "Permanent delete is only allowed when the company is in the access-blocked phase (after the offboarding period). Use Force delete now during offboarding if you need to remove the tenant immediately.",
      };
    }

    return executePermanentCompanyPurge(admin, trimmed, company.logo_storage_path);
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("deleteCompanyAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error deleting company.",
    };
  }
}

/**
 * Super-admin only: hard-delete during offboarding without waiting for access_blocked.
 * Prefer the streamed API route for UI progress; this remains for scripts/tests.
 * Archive already exists from when offboarding started.
 */
export async function forceDeleteOffboardedCompanyAction(companyId: string): Promise<DeleteCompanyResult> {
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
      .select("id, logo_storage_path, deletion_phase")
      .eq("id", trimmed)
      .maybeSingle();
    if (getErr) return { ok: false, error: getErr.message };
    if (!company?.id) return { ok: false, error: "Company not found." };

    const phase = (company.deletion_phase as string) ?? "active";
    if (phase !== "offboarding") {
      return {
        ok: false,
        error:
          "Force delete now is only available while the company is in offboarding. Otherwise use permanent delete after access is blocked, or reactivate.",
      };
    }

    return executePermanentCompanyPurge(admin, trimmed, company.logo_storage_path);
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    console.error("forceDeleteOffboardedCompanyAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unexpected error deleting company.",
    };
  }
}

/** @deprecated Use forceDeleteOffboardedCompanyAction */
export const purgeOffboardedCompanyNowAction = forceDeleteOffboardedCompanyAction;

export async function applyLatestCompanyContractChangeAction(
  companyId: string,
): Promise<ApplyContractChangeResult> {
  try {
    const { user } = await requireSuperAdmin();
    const trimmed = companyId?.trim();
    if (!trimmed) return { ok: false, error: "Missing company." };

    let admin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
    }

    const { data: pending, error: pendingErr } = await admin
      .from("company_contract_change_requests")
      .select("id, transition_type, review_status")
      .eq("parent_company_id", trimmed)
      .eq("status", "pending_signature")
      .in("review_status", ["awaiting_signature", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingErr) return { ok: false, error: pendingErr.message };
    if (!pending?.id) {
      return {
        ok: false,
        error:
          "No reviewed contract change ready to apply. Approve the request on Contract changes first, or wait for e-sign completion.",
      };
    }
    if (pending.transition_type === "new_legal_entity") {
      return {
        ok: false,
        error: "This request is a new legal entity transition. Complete it from Contract changes, not Apply here.",
      };
    }

    const { error: rpcErr } = await admin.rpc("apply_company_contract_change", {
      p_change_id: pending.id,
      p_signed_by: user.id,
    });
    if (rpcErr) return { ok: false, error: rpcErr.message };

    revalidateCompanyGate(trimmed);
    revalidatePath("/super-admin/companies");
    revalidatePath("/rental");
    return { ok: true };
  } catch (e) {
    if (isNextRedirectError(e)) throw e;
    return { ok: false, error: e instanceof Error ? e.message : "Unexpected error applying contract change." };
  }
}
