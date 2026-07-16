import { appendEsignAudit } from "@/lib/esign/audit";
import { generateAccessToken, generateOtp, hashSecret, safeEqualHash } from "@/lib/esign/crypto";
import { sendEsignMail } from "@/lib/esign/mail";
import { stampPdfWithFieldValues, type FieldValueMap } from "@/lib/esign/pdf-stamp";
import {
  ESIGN_OWNER_ROLE,
  ESIGN_RECIPIENT_ROLE,
  fieldsForRole,
  layoutHasRoleSignature,
} from "@/lib/esign/roles";
import {
  DEFAULT_SIGNER_ROLE,
  ESIGN_BUCKET,
  ESIGN_DEFAULT_RETENTION_YEARS,
  type EsignContextType,
  type EsignFieldLayoutItem,
  type EsignRecipientInput,
} from "@/lib/esign/types";
import { getPublicSiteUrl } from "@/lib/supabase/site-url";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type CreateEnvelopeFromPdfInput = {
  contextType: EsignContextType;
  contextId: string;
  parentCompanyId?: string | null;
  title: string;
  pdfBytes: Uint8Array;
  recipients: EsignRecipientInput[];
  createdBy?: string | null;
  /** Pre-positioned fields matching PDF execution placeholders. */
  suggestedFields?: EsignFieldLayoutItem[];
  requiresOwnerSignature?: boolean;
};

export type CreateEnvelopeResult =
  | { ok: true; envelopeId: string }
  | { ok: false; error: string };

function retentionUntilFromNow(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + ESIGN_DEFAULT_RETENTION_YEARS);
  return d.toISOString();
}

export function parseFieldValues(raw: unknown): FieldValueMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as FieldValueMap;
}

function mergeFieldValues(existing: FieldValueMap, incoming: FieldValueMap): FieldValueMap {
  return { ...existing, ...incoming };
}

function validateRoleValues(
  layout: EsignFieldLayoutItem[],
  role: string,
  values: FieldValueMap,
): string | null {
  const roleFields = fieldsForRole(layout, role);
  for (const f of roleFields) {
    if (f.type === "signature" && !values[f.id]?.value?.trim()) {
      return "Signature is required.";
    }
    if (f.type === "text" && !values[f.id]?.value?.trim()) {
      return "Text field is required.";
    }
    if (f.type === "date" && !values[f.id]?.value?.trim()) {
      return "Date is required.";
    }
  }
  return null;
}

async function stampAndStorePdf(
  admin: Admin,
  envelopeId: string,
  layout: EsignFieldLayoutItem[],
  values: FieldValueMap,
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unsigned = await downloadUnsignedPdf(admin, envelopeId);
  if (!unsigned) return { ok: false, error: "Could not load unsigned PDF." };
  let stamped: Uint8Array;
  try {
    stamped = await stampPdfWithFieldValues(unsigned, layout, values);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not stamp PDF." };
  }
  const { error: upErr } = await admin.storage.from(ESIGN_BUCKET).upload(storagePath, stamped, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

export async function createEnvelopeFromPdf(
  admin: Admin,
  input: CreateEnvelopeFromPdfInput,
): Promise<CreateEnvelopeResult> {
  if (input.recipients.length !== 1) {
    return { ok: false, error: "Exactly one recipient is required." };
  }
  const { data: envRow, error: envErr } = await admin
    .from("esign_envelopes")
    .insert({
      context_type: input.contextType,
      context_id: input.contextId,
      parent_company_id: input.parentCompanyId ?? null,
      status: "awaiting_placement",
      title: input.title,
      field_layout: [],
      suggested_field_layout: input.suggestedFields ?? [],
      requires_owner_signature: input.requiresOwnerSignature ?? true,
      field_values: {},
      created_by: input.createdBy ?? null,
      retention_until: retentionUntilFromNow(),
    })
    .select("id")
    .single();
  if (envErr || !envRow?.id) {
    return { ok: false, error: envErr?.message ?? "Could not create envelope." };
  }

  const envelopeId = envRow.id as string;
  const path = `${envelopeId}/unsigned.pdf`;
  const { error: upErr } = await admin.storage.from(ESIGN_BUCKET).upload(path, input.pdfBytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) {
    await admin.from("esign_envelopes").delete().eq("id", envelopeId);
    return { ok: false, error: `PDF upload failed: ${upErr.message}` };
  }

  await admin.from("esign_envelopes").update({ unsigned_pdf_path: path }).eq("id", envelopeId);

  const recipientRows = input.recipients.map((r) => ({
    envelope_id: envelopeId,
    email: r.email.trim().toLowerCase(),
    name: r.name?.trim() || null,
    role: r.role?.trim() || DEFAULT_SIGNER_ROLE,
  }));
  const { error: recErr } = await admin.from("esign_recipients").insert(recipientRows);
  if (recErr) {
    return { ok: false, error: recErr.message };
  }

  await appendEsignAudit(admin, envelopeId, "envelope_created", {
    actor: input.createdBy ?? "system",
    metadata: { context_type: input.contextType, context_id: input.contextId },
  });

  return { ok: true, envelopeId };
}

export async function saveEnvelopeFieldLayout(
  admin: Admin,
  envelopeId: string,
  layout: EsignFieldLayoutItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: env, error } = await admin
    .from("esign_envelopes")
    .select("id, status, owner_signed_at")
    .eq("id", envelopeId)
    .maybeSingle();
  if (error || !env?.id) return { ok: false, error: error?.message ?? "Envelope not found." };
  if (env.status === "completed" || env.status === "void") {
    return { ok: false, error: "Envelope can no longer be edited." };
  }
  if (env.owner_signed_at) {
    return { ok: false, error: "Layout is locked after the owner has signed." };
  }
  if (env.status === "sent" || env.status === "viewed") {
    return { ok: false, error: "Envelope was already sent to the recipient." };
  }

  const { error: upErr } = await admin
    .from("esign_envelopes")
    .update({ field_layout: layout, status: env.status === "draft" ? "awaiting_placement" : env.status })
    .eq("id", envelopeId);
  if (upErr) return { ok: false, error: upErr.message };
  await appendEsignAudit(admin, envelopeId, "fields_saved", {
    metadata: { field_count: layout.length },
  });
  return { ok: true };
}

export async function completeOwnerSigning(
  admin: Admin,
  input: {
    envelopeId: string;
    values: FieldValueMap;
    ownerUserId: string;
    ip?: string | null;
    userAgent?: string | null;
  },
  onOwnerSigned?: OnEnvelopeOwnerSigned,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: env, error: eErr } = await admin
    .from("esign_envelopes")
    .select(
      "id, status, field_layout, field_values, context_type, context_id, parent_company_id, owner_signed_at",
    )
    .eq("id", input.envelopeId)
    .maybeSingle();
  if (eErr || !env?.id) return { ok: false, error: eErr?.message ?? "Envelope not found." };
  if (env.owner_signed_at) return { ok: false, error: "Owner has already signed." };
  if (env.status === "completed" || env.status === "void" || env.status === "expired") {
    return { ok: false, error: "Envelope is closed." };
  }
  if (env.status === "sent" || env.status === "viewed") {
    return { ok: false, error: "Envelope was already sent to the recipient." };
  }

  const layout = (env.field_layout ?? []) as EsignFieldLayoutItem[];
  if (!layoutHasRoleSignature(layout, ESIGN_OWNER_ROLE)) {
    return { ok: false, error: "Add at least one owner signature field before signing." };
  }

  const validationError = validateRoleValues(layout, ESIGN_OWNER_ROLE, input.values);
  if (validationError) return { ok: false, error: validationError };

  const merged = mergeFieldValues(parseFieldValues(env.field_values), input.values);
  const partialPath = `${input.envelopeId}/partial.pdf`;
  const stamped = await stampAndStorePdf(admin, input.envelopeId, layout, merged, partialPath);
  if (!stamped.ok) return stamped;

  const now = new Date().toISOString();
  await admin
    .from("esign_envelopes")
    .update({
      field_values: merged,
      owner_signed_at: now,
      owner_signed_by: input.ownerUserId,
      status: "owner_signed",
      signed_pdf_path: partialPath,
    })
    .eq("id", input.envelopeId);

  await appendEsignAudit(admin, input.envelopeId, "owner_signed", {
    actor: input.ownerUserId,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  if (onOwnerSigned) {
    await onOwnerSigned(admin, {
      id: env.id as string,
      context_type: env.context_type as string,
      context_id: env.context_id as string,
      parent_company_id: (env.parent_company_id as string | null) ?? null,
    });
  }

  return { ok: true };
}

export async function sendEnvelope(
  admin: Admin,
  envelopeId: string,
  opts?: { ip?: string | null; userAgent?: string | null; actor?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: env, error } = await admin
    .from("esign_envelopes")
    .select("id, status, title, field_layout, owner_signed_at, requires_owner_signature")
    .eq("id", envelopeId)
    .maybeSingle();
  if (error || !env?.id) return { ok: false, error: error?.message ?? "Envelope not found." };
  if (env.status === "completed") return { ok: false, error: "Already completed." };
  if (env.status === "void") return { ok: false, error: "Envelope is void." };

  const needsOwner = env.requires_owner_signature !== false;
  if (needsOwner) {
    if (!env.owner_signed_at || env.status !== "owner_signed") {
      return { ok: false, error: "Sign as contract owner before sending to the recipient." };
    }
  } else if (env.status !== "awaiting_placement" && env.status !== "draft") {
    if (env.status === "sent" || env.status === "viewed") {
      return { ok: false, error: "Already sent." };
    }
    if (env.status === "owner_signed") {
      // allow
    } else {
      return { ok: false, error: "Envelope is not ready to send." };
    }
  }

  const layout = (env.field_layout ?? []) as EsignFieldLayoutItem[];
  if (!Array.isArray(layout) || layout.length === 0) {
    return { ok: false, error: "Add at least one field before sending." };
  }
  if (needsOwner && !layoutHasRoleSignature(layout, ESIGN_OWNER_ROLE)) {
    return { ok: false, error: "Add an owner signature field." };
  }
  if (!layoutHasRoleSignature(layout, ESIGN_RECIPIENT_ROLE)) {
    return { ok: false, error: "Add a recipient signature field." };
  }

  const { data: recipients, error: rErr } = await admin
    .from("esign_recipients")
    .select("id, email, name")
    .eq("envelope_id", envelopeId);
  if (rErr || recipients?.length !== 1) {
    return { ok: false, error: rErr?.message ?? "Exactly one recipient is required." };
  }

  const site = getPublicSiteUrl();
  const expires = new Date();
  expires.setDate(expires.getDate() + 14);

  for (const rec of recipients) {
    const token = generateAccessToken();
    const otp = generateOtp();
    const otpExpires = new Date();
    otpExpires.setHours(otpExpires.getHours() + 24);

    const { error: upRec } = await admin
      .from("esign_recipients")
      .update({
        access_token_hash: hashSecret(token),
        otp_hash: hashSecret(otp),
        otp_expires_at: otpExpires.toISOString(),
        otp_attempts: 0,
        verified_at: null,
        signed_at: null,
      })
      .eq("id", rec.id);
    if (upRec) return { ok: false, error: upRec.message };

    const link = `${site}/sign/${token}`;
    const mail = await sendEsignMail({
      to: rec.email,
      subject: `Sign: ${env.title}`,
      text: [
        `You have been asked to sign: ${env.title}`,
        "",
        `Open this link: ${link}`,
        `Your access code (OTP): ${otp}`,
        "",
        "The code expires in 24 hours. Do not share this email.",
        "",
        "We collect your email, signature image, IP address, and device information for contract records under UK GDPR (performance of a contract). See the privacy notice on the signing page.",
      ].join("\n"),
      html: `<p>You have been asked to sign: <strong>${escapeHtml(env.title)}</strong></p>
<p><a href="${link}">Open signing page</a></p>
<p>Your access code (OTP): <strong>${otp}</strong></p>
<p>The code expires in 24 hours.</p>
<p style="font-size:12px;color:#555">We collect your email, signature, IP address, and device information for contract records under UK GDPR. A privacy notice is shown before you sign.</p>`,
    });
    if (!mail.ok) return { ok: false, error: mail.error };
  }

  const { error: upEnv } = await admin
    .from("esign_envelopes")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      expires_at: expires.toISOString(),
    })
    .eq("id", envelopeId);
  if (upEnv) return { ok: false, error: upEnv.message };

  await appendEsignAudit(admin, envelopeId, "envelope_sent", {
    actor: opts?.actor ?? null,
    ip: opts?.ip,
    userAgent: opts?.userAgent,
    metadata: { recipient_count: recipients.length },
  });

  return { ok: true };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function findRecipientByAccessToken(admin: Admin, token: string) {
  const hash = hashSecret(token);
  const { data, error } = await admin
    .from("esign_recipients")
    .select("id, envelope_id, email, name, role, otp_hash, otp_expires_at, otp_attempts, verified_at, signed_at")
    .eq("access_token_hash", hash)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data?.id) return { ok: false as const, error: "Invalid or expired link." };
  return { ok: true as const, recipient: data };
}

export async function verifyRecipientOtp(
  admin: Admin,
  recipientId: string,
  otp: string,
  opts?: { ip?: string | null; userAgent?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: rec, error } = await admin
    .from("esign_recipients")
    .select("id, envelope_id, otp_hash, otp_expires_at, otp_attempts, verified_at")
    .eq("id", recipientId)
    .maybeSingle();
  if (error || !rec?.id) return { ok: false, error: "Recipient not found." };
  if (rec.verified_at) return { ok: true };

  const attempts = (rec.otp_attempts as number) ?? 0;
  if (attempts >= 8) {
    return { ok: false, error: "Too many attempts. Request a new signing email." };
  }
  if (!rec.otp_hash || !rec.otp_expires_at || new Date(rec.otp_expires_at) < new Date()) {
    await admin.from("esign_recipients").update({ otp_attempts: attempts + 1 }).eq("id", recipientId);
    return { ok: false, error: "Code expired. Ask the sender to resend." };
  }
  if (!safeEqualHash(rec.otp_hash as string, hashSecret(otp.trim()))) {
    await admin.from("esign_recipients").update({ otp_attempts: attempts + 1 }).eq("id", recipientId);
    return { ok: false, error: "Incorrect code." };
  }

  await admin
    .from("esign_recipients")
    .update({ verified_at: new Date().toISOString(), otp_attempts: 0 })
    .eq("id", recipientId);

  await admin.from("esign_envelopes").update({ status: "viewed" }).eq("id", rec.envelope_id).eq("status", "sent");

  await appendEsignAudit(admin, rec.envelope_id as string, "otp_verified", {
    ip: opts?.ip,
    userAgent: opts?.userAgent,
    metadata: { recipient_id: recipientId },
  });

  return { ok: true };
}

export async function downloadUnsignedPdf(admin: Admin, envelopeId: string): Promise<Uint8Array | null> {
  const { data: env } = await admin
    .from("esign_envelopes")
    .select("unsigned_pdf_path")
    .eq("id", envelopeId)
    .maybeSingle();
  const path = env?.unsigned_pdf_path as string | undefined;
  if (!path) return null;
  const { data, error } = await admin.storage.from(ESIGN_BUCKET).download(path);
  if (error || !data) return null;
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

export type CompleteSigningInput = {
  envelopeId: string;
  recipientId: string;
  values: FieldValueMap;
  ip?: string | null;
  userAgent?: string | null;
};

export type OnEnvelopeCompleted = (
  admin: Admin,
  envelope: { id: string; context_type: string; context_id: string; parent_company_id: string | null },
) => Promise<void>;

export type OnEnvelopeOwnerSigned = OnEnvelopeCompleted;

export async function completeSigning(
  admin: Admin,
  input: CompleteSigningInput,
  onCompleted?: OnEnvelopeCompleted,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: rec, error: rErr } = await admin
    .from("esign_recipients")
    .select("id, envelope_id, verified_at, signed_at, email")
    .eq("id", input.recipientId)
    .maybeSingle();
  if (rErr || !rec?.id) return { ok: false, error: "Recipient not found." };
  if (rec.envelope_id !== input.envelopeId) return { ok: false, error: "Mismatch." };
  if (!rec.verified_at) return { ok: false, error: "Verify the access code first." };
  if (rec.signed_at) return { ok: false, error: "Already signed." };

  const { data: env, error: eErr } = await admin
    .from("esign_envelopes")
    .select(
      "id, status, field_layout, field_values, unsigned_pdf_path, context_type, context_id, parent_company_id, owner_signed_at, requires_owner_signature",
    )
    .eq("id", input.envelopeId)
    .maybeSingle();
  if (eErr || !env?.id) return { ok: false, error: eErr?.message ?? "Envelope not found." };
  const needsOwner = env.requires_owner_signature !== false;
  if (needsOwner && !env.owner_signed_at) return { ok: false, error: "Owner must sign before the recipient." };
  if (env.status === "completed") return { ok: false, error: "Already completed." };
  if (env.status === "void" || env.status === "expired") return { ok: false, error: "Envelope closed." };
  if (env.status !== "sent" && env.status !== "viewed") {
    return { ok: false, error: "Envelope is not awaiting recipient signature." };
  }

  const layout = (env.field_layout ?? []) as EsignFieldLayoutItem[];
  const validationError = validateRoleValues(layout, ESIGN_RECIPIENT_ROLE, input.values);
  if (validationError) return { ok: false, error: validationError };

  const merged = mergeFieldValues(parseFieldValues(env.field_values), input.values);
  const signedPath = `${input.envelopeId}/signed.pdf`;
  const stamped = await stampAndStorePdf(admin, input.envelopeId, layout, merged, signedPath);
  if (!stamped.ok) return stamped;

  const now = new Date().toISOString();
  await admin.from("esign_recipients").update({ signed_at: now }).eq("id", input.recipientId);
  await admin
    .from("esign_envelopes")
    .update({
      field_values: merged,
      status: "completed",
      signed_pdf_path: signedPath,
      completed_at: now,
    })
    .eq("id", input.envelopeId);

  await appendEsignAudit(admin, input.envelopeId, "envelope_completed", {
    actor: rec.email as string,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  if (onCompleted) {
    await onCompleted(admin, {
      id: env.id as string,
      context_type: env.context_type as string,
      context_id: env.context_id as string,
      parent_company_id: (env.parent_company_id as string | null) ?? null,
    });
  }

  return { ok: true };
}
