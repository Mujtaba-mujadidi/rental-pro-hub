"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSuperAdmin } from "@/lib/auth/profile";
import {
  onPlatformCompanyContractOwnerSigned,
  onPlatformCompanyContractSigned,
  preparePlatformCompanyContractEnvelope,
} from "@/lib/esign/adapters/platform-company-contract";
import { regenerateEnvelopePdfForSignatureMode } from "@/lib/esign/adapters/regenerate-pdf";
import {
  completeOwnerSigning,
  completeSigning,
  findRecipientByAccessToken,
  saveEnvelopeFieldLayout,
  sendEnvelope,
  verifyRecipientOtp,
} from "@/lib/esign/envelope";
import { fieldsForRole, normalizeFieldRole } from "@/lib/esign/roles";
import {
  getSavedSignatureForEmail,
  getSavedSignatureForUser,
  saveSignatureForEmail,
  saveSignatureForUser,
} from "@/lib/esign/saved-signatures";
import { ESIGN_OWNER_ROLE, type EsignFieldLayoutItem } from "@/lib/esign/types";
import type { FieldValueMap } from "@/lib/esign/pdf-stamp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function clientMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

export async function prepareCompanyContractEsignAction(
  companyId: string,
): Promise<{ ok: true; envelopeId: string } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const id = companyId?.trim();
  if (!id) return { ok: false, error: "Missing company." };
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }
  const res = await preparePlatformCompanyContractEnvelope(admin, id, user.id);
  if (res.ok) {
    revalidatePath("/super-admin/companies");
  }
  return res;
}

export async function saveEsignFieldLayoutAction(
  envelopeId: string,
  layout: EsignFieldLayoutItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  return saveEnvelopeFieldLayout(admin, envelopeId, layout);
}

export async function sendEsignEnvelopeAction(
  envelopeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const meta = await clientMeta();

  const { data: env } = await admin
    .from("esign_envelopes")
    .select("id, context_type, context_id")
    .eq("id", envelopeId)
    .maybeSingle();

  const res = await sendEnvelope(admin, envelopeId, {
    actor: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  if (!res.ok) return res;

  if (env?.context_type === "platform_company_contract" && env.context_id) {
    const now = new Date().toISOString();
    await admin
      .from("company_contracts")
      .update({ status: "sent_for_signature" })
      .eq("id", env.context_id);
    const { data: cc } = await admin
      .from("company_contracts")
      .select("current_version_id")
      .eq("id", env.context_id)
      .maybeSingle();
    if (cc?.current_version_id) {
      await admin
        .from("company_contract_versions")
        .update({ version_status: "sent_for_signature", sent_for_signature_at: now })
        .eq("id", cc.current_version_id);
    }
    await admin
      .from("contract_signature_requests")
      .update({ status: "sent" })
      .eq("provider_submission_id", envelopeId);
  }

  revalidatePath("/super-admin/companies");
  revalidatePath(`/super-admin/esign/${envelopeId}`);
  return { ok: true };
}

export async function getOwnerSavedSignatureAction(): Promise<
  { ok: true; dataUrl: string } | { ok: false }
> {
  const { user } = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  return getSavedSignatureForUser(admin, user.id);
}

export async function saveOwnerSignatureOnlyAction(
  dataUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  return saveSignatureForUser(admin, user.id, dataUrl);
}

/**
 * Choose recipient-only vs owner+recipient, seed placeholder fields, and optionally
 * apply the owner's saved signature immediately (no field walkthrough).
 */
export async function configureEsignSignatureModeAction(
  envelopeId: string,
  mode: "recipient_only" | "owner_and_recipient",
): Promise<
  | {
      ok: true;
      requiresOwner: boolean;
      hasSavedOwnerSignature: boolean;
      fields: EsignFieldLayoutItem[];
      pdfRegenerated: boolean;
    }
  | { ok: false; error: string }
> {
  const { user } = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const id = envelopeId?.trim();
  if (!id) return { ok: false, error: "Missing envelope." };

  const { data: env, error } = await admin
    .from("esign_envelopes")
    .select("id, status, owner_signed_at, suggested_field_layout")
    .eq("id", id)
    .maybeSingle();
  if (error || !env?.id) return { ok: false, error: error?.message ?? "Envelope not found." };
  if (env.owner_signed_at || env.status === "sent" || env.status === "viewed" || env.status === "completed") {
    return { ok: false, error: "Signature mode can no longer be changed." };
  }

  const requiresOwner = mode === "owner_and_recipient";
  const existingSuggested = Array.isArray(env.suggested_field_layout)
    ? (env.suggested_field_layout as EsignFieldLayoutItem[])
    : [];
  const suggestedHasOwner = existingSuggested.some(
    (f) => normalizeFieldRole(f.role) === ESIGN_OWNER_ROLE && f.type === "signature",
  );

  // Prepare already builds owner+recipient PDF — skip a second full regenerate when it matches.
  let fields: EsignFieldLayoutItem[];
  let pdfRegenerated = false;
  if (existingSuggested.length > 0 && suggestedHasOwner === requiresOwner) {
    fields = existingSuggested;
  } else {
    const regenerated = await regenerateEnvelopePdfForSignatureMode(admin, id, mode);
    if (!regenerated.ok) return regenerated;
    fields = regenerated.suggestedFields;
    pdfRegenerated = true;
  }

  if (!fields.length) {
    return { ok: false, error: "No signature placeholders available on this contract PDF." };
  }

  const { error: upErr } = await admin
    .from("esign_envelopes")
    .update({
      requires_owner_signature: requiresOwner,
      field_layout: fields,
      status: "awaiting_placement",
    })
    .eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };

  const saved = await getSavedSignatureForUser(admin, user.id);
  revalidatePath(`/super-admin/esign/${id}`);
  return {
    ok: true,
    requiresOwner,
    hasSavedOwnerSignature: saved.ok,
    fields,
    pdfRegenerated,
  };
}

/** Apply owner signature (saved or newly drawn) onto auto-placed owner fields and mark owner signed. */
export async function applyOwnerSignatureQuickAction(
  envelopeId: string,
  signatureDataUrl: string,
  options?: { saveSignature?: boolean; ownerFullName?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const meta = await clientMeta();
  const id = envelopeId?.trim();
  if (!id) return { ok: false, error: "Missing envelope." };
  if (!signatureDataUrl?.startsWith("data:image")) {
    return { ok: false, error: "A signature image is required." };
  }

  const confirmedName = options?.ownerFullName?.trim() || "";
  if (!confirmedName) {
    return { ok: false, error: "Confirm the owner full name before signing." };
  }

  const { data: env, error } = await admin
    .from("esign_envelopes")
    .select("id, field_layout, requires_owner_signature, owner_signed_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !env?.id) return { ok: false, error: error?.message ?? "Envelope not found." };
  if (env.requires_owner_signature === false) {
    return { ok: false, error: "This envelope does not require an owner signature." };
  }
  if (env.owner_signed_at) return { ok: false, error: "Owner has already signed." };

  const layout = (env.field_layout ?? []) as EsignFieldLayoutItem[];
  const ownerFields = fieldsForRole(layout, ESIGN_OWNER_ROLE);
  if (!ownerFields.some((f) => f.type === "signature")) {
    return { ok: false, error: "No owner signature field on this envelope." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const values: FieldValueMap = {};
  for (const f of ownerFields) {
    if (f.type === "signature") values[f.id] = { type: "signature", value: signatureDataUrl };
    else if (f.type === "date") values[f.id] = { type: "date", value: today };
    else if (f.type === "text") values[f.id] = { type: "text", value: confirmedName };
    else values[f.id] = { type: "text", value: confirmedName };
  }

  const res = await completeOwnerSigning(
    admin,
    {
      envelopeId: id,
      values,
      ownerUserId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    onPlatformCompanyContractOwnerSigned,
  );
  if (!res.ok) return res;

  if (options?.saveSignature !== false) {
    await saveSignatureForUser(admin, user.id, signatureDataUrl);
  }

  revalidatePath(`/super-admin/esign/${id}`);
  return { ok: true };
}

export async function completeOwnerEsignSigningAction(
  envelopeId: string,
  values: FieldValueMap,
  options?: { saveSignature?: boolean; signatureDataUrl?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const admin = createSupabaseAdminClient();
  const meta = await clientMeta();

  const res = await completeOwnerSigning(
    admin,
    {
      envelopeId,
      values,
      ownerUserId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    onPlatformCompanyContractOwnerSigned,
  );
  if (!res.ok) return res;

  if (options?.saveSignature && options.signatureDataUrl) {
    await saveSignatureForUser(admin, user.id, options.signatureDataUrl);
  }

  revalidatePath(`/super-admin/esign/${envelopeId}`);
  revalidatePath(`/super-admin/esign/${envelopeId}/sign`);
  return { ok: true };
}

export async function verifyEsignOtpAction(
  token: string,
  otp: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  const found = await findRecipientByAccessToken(admin, token.trim());
  if (!found.ok) return { ok: false, error: found.error };
  const meta = await clientMeta();
  return verifyRecipientOtp(admin, found.recipient.id as string, otp, meta);
}

export async function getRecipientSavedSignatureAction(
  token: string,
): Promise<{ ok: true; dataUrl: string } | { ok: false }> {
  const admin = createSupabaseAdminClient();
  const found = await findRecipientByAccessToken(admin, token.trim());
  if (!found.ok) return { ok: false };
  return getSavedSignatureForEmail(admin, found.recipient.email as string);
}

export async function completeEsignSigningAction(
  token: string,
  values: FieldValueMap,
  options?: { saveSignature?: boolean; signatureDataUrl?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  const found = await findRecipientByAccessToken(admin, token.trim());
  if (!found.ok) return { ok: false, error: found.error };
  const rec = found.recipient;
  if (!rec.verified_at) return { ok: false, error: "Verify the access code first." };
  const meta = await clientMeta();
  const res = await completeSigning(
    admin,
    {
      envelopeId: rec.envelope_id as string,
      recipientId: rec.id as string,
      values,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    onPlatformCompanyContractSigned,
  );
  if (!res.ok) return res;

  if (options?.saveSignature && options.signatureDataUrl) {
    await saveSignatureForEmail(admin, rec.email as string, options.signatureDataUrl);
  }
  return { ok: true };
}

/** Latest completed platform-company envelope for a company (for viewing signed PDF). */
export async function getCompanySignedEsignEnvelopeAction(
  companyId: string,
): Promise<{ ok: true; envelopeId: string } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const id = companyId?.trim();
  if (!id) return { ok: false, error: "Missing company." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: byParent, error: pErr } = await admin
    .from("esign_envelopes")
    .select("id")
    .eq("parent_company_id", id)
    .eq("context_type", "platform_company_contract")
    .eq("status", "completed")
    .not("signed_pdf_path", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pErr && byParent?.id) {
    return { ok: true, envelopeId: byParent.id as string };
  }

  const { data: contract } = await admin
    .from("company_contracts")
    .select("id")
    .eq("parent_company_id", id)
    .maybeSingle();
  if (!contract?.id) {
    return { ok: false, error: "No signed contract PDF found for this company." };
  }

  const { data: byContext, error: cErr } = await admin
    .from("esign_envelopes")
    .select("id")
    .eq("context_type", "platform_company_contract")
    .eq("context_id", contract.id)
    .eq("status", "completed")
    .not("signed_pdf_path", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cErr || !byContext?.id) {
    return { ok: false, error: cErr?.message ?? "No signed contract PDF found for this company." };
  }
  return { ok: true, envelopeId: byContext.id as string };
}
