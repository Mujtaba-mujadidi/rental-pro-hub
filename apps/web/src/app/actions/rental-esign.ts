"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canWriteRentals } from "@/lib/auth/rental-permissions";
import { dispatchEnvelopeCompleted, dispatchEnvelopeOwnerSigned } from "@/lib/esign/adapters/dispatch-envelope-hooks";
import { VEHICLE_HIRE_AGREEMENT_CONTEXT } from "@/lib/esign/adapters/vehicle-hire-agreement";
import {
  completeOwnerSigning,
  saveEnvelopeFieldLayout,
} from "@/lib/esign/envelope";
import { sendHireGroupSigningBundleFromEnvelopeAction } from "@/app/actions/rental-hire-signing";
import { formatEsignSignedAt } from "@/lib/esign/datetime";
import { getSavedSignatureForUser, saveSignatureForUser } from "@/lib/esign/saved-signatures";
import { ESIGN_OWNER_ROLE, type EsignFieldLayoutItem } from "@/lib/esign/types";
import type { FieldValueMap } from "@/lib/esign/pdf-stamp";
import { fieldsForRole } from "@/lib/esign/roles";
import { signableFieldLayout } from "@/lib/esign/field-values";
import {
  configureHireEnvelopeSignatureMode,
  configureHireGroupSignatureMode,
  type HireSignatureMode,
} from "@/lib/esign/hire-group-signature-mode";
import { getHireGroupIdForEnvelope } from "@/lib/esign/hire-signing-bundle";
import { refreshHireEnvelopePdf } from "@/lib/esign/adapters/vehicle-hire-agreement";
import { touchHireGroupForEnvelopeRealtime } from "@/lib/esign/touch-hire-group-realtime";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function clientMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

async function requireRentalHireEnvelope(envelopeId: string) {
  const { profile, user } = await requireRentalCompanyArea();
  if (!canWriteRentals(profile)) {
    return { ok: false as const, error: "You do not have permission to manage hire e-sign." };
  }
  const companyId = profile.company_id?.trim();
  if (!companyId) return { ok: false as const, error: "No active company." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: env, error } = await admin
    .from("esign_envelopes")
    .select("id, parent_company_id, context_type")
    .eq("id", envelopeId.trim())
    .maybeSingle();
  if (error || !env?.id) return { ok: false as const, error: "Envelope not found." };
  if (env.parent_company_id !== companyId) return { ok: false as const, error: "Envelope not found." };
  if (env.context_type !== VEHICLE_HIRE_AGREEMENT_CONTEXT) {
    return { ok: false as const, error: "This envelope is not a vehicle hire agreement." };
  }

  return { ok: true as const, admin, user, envelopeId: env.id as string };
}

export async function saveRentalEsignFieldLayoutAction(
  envelopeId: string,
  layout: EsignFieldLayoutItem[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireRentalHireEnvelope(envelopeId);
  if (!gate.ok) return gate;
  const res = await saveEnvelopeFieldLayout(gate.admin, gate.envelopeId, layout);
  if (res.ok) {
    await touchHireGroupForEnvelopeRealtime(gate.admin, gate.envelopeId);
    revalidatePath(`/rental/esign/${gate.envelopeId}`);
    revalidatePath("/rental/hires");
  }
  return res;
}

export async function sendRentalEsignEnvelopeAction(
  envelopeId: string,
): Promise<{ ok: true; agreementCount?: number } | { ok: false; error: string }> {
  const gate = await requireRentalHireEnvelope(envelopeId);
  if (!gate.ok) return gate;
  const res = await sendHireGroupSigningBundleFromEnvelopeAction(gate.envelopeId);
  if (res.ok) revalidatePath(`/rental/esign/${gate.envelopeId}`);
  return res;
}

export async function resendRentalEsignEnvelopeAction(
  envelopeId: string,
): Promise<{ ok: true; agreementCount?: number } | { ok: false; error: string }> {
  const gate = await requireRentalHireEnvelope(envelopeId);
  if (!gate.ok) return gate;
  return sendHireGroupSigningBundleFromEnvelopeAction(gate.envelopeId, { resend: true });
}

export async function getRentalOwnerSavedSignatureAction(): Promise<
  { ok: true; dataUrl: string } | { ok: false }
> {
  const { profile, user } = await requireRentalCompanyArea();
  if (!canWriteRentals(profile)) return { ok: false };
  const admin = createSupabaseAdminClient();
  return getSavedSignatureForUser(admin, user.id);
}

export async function applyRentalOwnerSignatureQuickAction(
  envelopeId: string,
  signatureDataUrl: string,
  options?: { saveSignature?: boolean; ownerFullName?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireRentalHireEnvelope(envelopeId);
  if (!gate.ok) return gate;

  const confirmedName = options?.ownerFullName?.trim();
  if (!confirmedName) return { ok: false, error: "Owner full name is required." };

  const { data: env } = await gate.admin
    .from("esign_envelopes")
    .select("id, field_layout, requires_owner_signature, owner_signed_at")
    .eq("id", gate.envelopeId)
    .maybeSingle();
  if (!env?.id) return { ok: false, error: "Envelope not found." };
  if (env.owner_signed_at) return { ok: false, error: "Owner has already signed." };

  const layout = (env.field_layout ?? []) as EsignFieldLayoutItem[];
  const ownerFields = fieldsForRole(signableFieldLayout(layout), ESIGN_OWNER_ROLE);
  const signedAt = formatEsignSignedAt(new Date());
  const values: FieldValueMap = {};
  for (const f of ownerFields) {
    if (f.type === "signature") values[f.id] = { type: "signature", value: signatureDataUrl };
    else if (f.type === "date") values[f.id] = { type: "date", value: signedAt };
    else values[f.id] = { type: "text", value: confirmedName };
  }

  const meta = await clientMeta();
  const res = await completeOwnerSigning(
    gate.admin,
    {
      envelopeId: gate.envelopeId,
      values,
      ownerUserId: gate.user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
    dispatchEnvelopeOwnerSigned,
  );
  if (!res.ok) return res;

  if (options?.saveSignature !== false) {
    await saveSignatureForUser(gate.admin, gate.user.id, signatureDataUrl);
  }

  revalidatePath(`/rental/esign/${gate.envelopeId}`);
  revalidatePath("/rental/hires");
  return { ok: true };
}

/** Hire agreements: apply signature mode and suggested placeholders from generated PDF. */
export async function configureRentalEsignSignatureModeAction(
  envelopeId: string,
  mode: HireSignatureMode,
): Promise<
  | {
      ok: true;
      requiresOwner: boolean;
      fields: EsignFieldLayoutItem[];
      pdfRegenerated: boolean;
      hasSavedOwnerSignature: boolean;
    }
  | { ok: false; error: string }
> {
  const gate = await requireRentalHireEnvelope(envelopeId);
  if (!gate.ok) return gate;

  const configured = await configureHireEnvelopeSignatureMode(gate.admin, gate.envelopeId, mode);
  if (!configured.ok) return configured;

  const hireGroupId = await getHireGroupIdForEnvelope(gate.admin, gate.envelopeId);
  if (hireGroupId) {
    const siblings = await configureHireGroupSignatureMode(gate.admin, hireGroupId, mode, {
      skipEnvelopeId: gate.envelopeId,
    });
    if (!siblings.ok) return siblings;
    for (const siblingId of siblings.configuredEnvelopeIds) {
      revalidatePath(`/rental/esign/${siblingId}`);
    }
  }

  const saved = await getSavedSignatureForUser(gate.admin, gate.user.id);
  revalidatePath(`/rental/esign/${gate.envelopeId}`);
  revalidatePath("/rental/hires");
  return {
    ok: true,
    requiresOwner: configured.requiresOwner,
    fields: configured.fields,
    pdfRegenerated: configured.pdfRegenerated,
    hasSavedOwnerSignature: saved.ok,
  };
}

/** Rebuild this hire agreement PDF from latest data (terms, permission letter, driver/vehicle). */
export async function refreshRentalHireEnvelopePdfAction(
  envelopeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireRentalHireEnvelope(envelopeId);
  if (!gate.ok) return gate;

  const refreshed = await refreshHireEnvelopePdf(gate.admin, gate.envelopeId);
  if (!refreshed.ok) return refreshed;

  const { error: upErr } = await gate.admin
    .from("esign_envelopes")
    .update({
      field_layout: refreshed.suggestedFields,
      status: "awaiting_placement",
    })
    .eq("id", gate.envelopeId);
  if (upErr) return { ok: false, error: upErr.message };

  await touchHireGroupForEnvelopeRealtime(gate.admin, gate.envelopeId);
  revalidatePath(`/rental/esign/${gate.envelopeId}`);
  revalidatePath("/rental/hires");
  return { ok: true };
}
