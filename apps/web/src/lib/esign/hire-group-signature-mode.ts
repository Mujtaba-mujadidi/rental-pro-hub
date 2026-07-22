import { regenerateHireEnvelopePdfForSignatureMode } from "@/lib/esign/adapters/vehicle-hire-agreement";
import {
  touchHireGroupForEnvelopeRealtime,
  touchHireGroupRealtime,
} from "@/lib/esign/touch-hire-group-realtime";
import { getHireGroupIdForEnvelope } from "@/lib/esign/hire-signing-bundle";
import { filterLayoutForSignatureMode, layoutIncludesOwnerSignFields } from "@/lib/esign/roles";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type HireSignatureMode = "recipient_only" | "owner_and_recipient";

type EnvelopeModeSource = {
  field_layout?: unknown;
  requires_owner_signature?: boolean | null;
};

export function inferSignatureModeFromEnvelope(env: EnvelopeModeSource): HireSignatureMode | null {
  const layout = Array.isArray(env.field_layout) ? (env.field_layout as EsignFieldLayoutItem[]) : [];
  if (!layout.length) return null;
  return env.requires_owner_signature === true ? "owner_and_recipient" : "recipient_only";
}

/** Signature mode already chosen on any agreement envelope in this hire group. */
export async function getHireGroupSharedSignatureMode(
  admin: Admin,
  hireGroupId: string,
): Promise<HireSignatureMode | null> {
  const { data: agreements } = await admin
    .from("vehicle_hire_agreements")
    .select("esign_envelopes(field_layout, requires_owner_signature)")
    .eq("hire_group_id", hireGroupId.trim());

  for (const row of agreements ?? []) {
    const env = row.esign_envelopes as EnvelopeModeSource | EnvelopeModeSource[] | null;
    const sources = Array.isArray(env) ? env : env ? [env] : [];
    for (const source of sources) {
      const mode = inferSignatureModeFromEnvelope(source);
      if (mode) return mode;
    }
  }
  return null;
}

export async function listHireGroupEnvelopeIds(admin: Admin, hireGroupId: string): Promise<string[]> {
  const { data: agreements } = await admin
    .from("vehicle_hire_agreements")
    .select("esign_envelope_id")
    .eq("hire_group_id", hireGroupId.trim());
  return (agreements ?? [])
    .map((a) => (a.esign_envelope_id as string | null)?.trim())
    .filter((id): id is string => Boolean(id));
}

/** Apply signature mode to one hire agreement envelope (regenerates PDF when needed). */
export async function configureHireEnvelopeSignatureMode(
  admin: Admin,
  envelopeId: string,
  mode: HireSignatureMode,
): Promise<
  | {
      ok: true;
      requiresOwner: boolean;
      fields: EsignFieldLayoutItem[];
      pdfRegenerated: boolean;
    }
  | { ok: false; error: string }
> {
  const { data: env } = await admin
    .from("esign_envelopes")
    .select("id, status, owner_signed_at, field_layout, suggested_field_layout, requires_owner_signature, unsigned_pdf_path")
    .eq("id", envelopeId.trim())
    .maybeSingle();
  if (!env) return { ok: false, error: "Envelope not found." };
  if (!env.unsigned_pdf_path) {
    return { ok: false, error: "Contract PDF is not ready yet. Return to Hires and try again." };
  }
  if (env.owner_signed_at || env.status === "sent" || env.status === "viewed" || env.status === "completed") {
    return { ok: false, error: "Contract preparation can no longer be changed." };
  }

  const requiresOwner = mode === "owner_and_recipient";
  const existingLayout = Array.isArray(env.field_layout) ? (env.field_layout as EsignFieldLayoutItem[]) : [];
  const suggested = Array.isArray(env.suggested_field_layout)
    ? (env.suggested_field_layout as EsignFieldLayoutItem[])
    : [];
  const layoutMatchesMode = (layout: EsignFieldLayoutItem[]) =>
    layoutIncludesOwnerSignFields(layout) === requiresOwner;

  let fields: EsignFieldLayoutItem[];
  let pdfRegenerated = false;
  if (existingLayout.length > 0 && layoutMatchesMode(existingLayout)) {
    fields = existingLayout;
  } else if (suggested.length > 0 && layoutMatchesMode(suggested)) {
    fields = suggested;
  } else {
    const regenerated = await regenerateHireEnvelopePdfForSignatureMode(admin, envelopeId, mode);
    if (!regenerated.ok) return regenerated;
    fields = regenerated.suggestedFields;
    pdfRegenerated = true;
  }

  fields = filterLayoutForSignatureMode(fields, requiresOwner);
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
    .eq("id", envelopeId);
  if (upErr) return { ok: false, error: upErr.message };

  await touchHireGroupForEnvelopeRealtime(admin, envelopeId);

  return { ok: true, requiresOwner, fields, pdfRegenerated };
}

/** Apply the same signature mode to every configurable envelope in the hire group. */
export async function configureHireGroupSignatureMode(
  admin: Admin,
  hireGroupId: string,
  mode: HireSignatureMode,
  options?: { skipEnvelopeId?: string },
): Promise<{ ok: true; configuredEnvelopeIds: string[] } | { ok: false; error: string }> {
  const envelopeIds = await listHireGroupEnvelopeIds(admin, hireGroupId);
  const configuredEnvelopeIds: string[] = [];

  for (const envelopeId of envelopeIds) {
    if (options?.skipEnvelopeId && envelopeId === options.skipEnvelopeId) continue;
    const res = await configureHireEnvelopeSignatureMode(admin, envelopeId, mode);
    if (!res.ok) {
      if (res.error === "Contract preparation can no longer be changed.") continue;
      return res;
    }
    configuredEnvelopeIds.push(envelopeId);
  }

  if (configuredEnvelopeIds.length) {
    await touchHireGroupRealtime(admin, hireGroupId);
  }

  return { ok: true, configuredEnvelopeIds };
}

export async function syncHireEnvelopeFromGroupSignatureMode(
  admin: Admin,
  envelopeId: string,
): Promise<
  | {
      ok: true;
      synced: boolean;
      requiresOwner: boolean;
      fields: EsignFieldLayoutItem[];
    }
  | { ok: false; error: string }
> {
  const hireGroupId = await getHireGroupIdForEnvelope(admin, envelopeId);
  if (!hireGroupId) return { ok: true, synced: false, requiresOwner: true, fields: [] };

  const sharedMode = await getHireGroupSharedSignatureMode(admin, hireGroupId);
  if (!sharedMode) return { ok: true, synced: false, requiresOwner: true, fields: [] };

  const { data: env } = await admin
    .from("esign_envelopes")
    .select("field_layout, requires_owner_signature")
    .eq("id", envelopeId.trim())
    .maybeSingle();
  const currentLayout = Array.isArray(env?.field_layout) ? (env.field_layout as EsignFieldLayoutItem[]) : [];
  const currentMode = inferSignatureModeFromEnvelope({
    field_layout: currentLayout,
    requires_owner_signature: env?.requires_owner_signature,
  });
  if (currentLayout.length > 0 && currentMode === sharedMode) {
    return {
      ok: true,
      synced: false,
      requiresOwner: sharedMode === "owner_and_recipient",
      fields: currentLayout,
    };
  }

  const configured = await configureHireEnvelopeSignatureMode(admin, envelopeId, sharedMode);
  if (!configured.ok) {
    if (configured.error === "Contract preparation can no longer be changed.") {
      return {
        ok: true,
        synced: false,
        requiresOwner: sharedMode === "owner_and_recipient",
        fields: currentLayout,
      };
    }
    return configured;
  }

  return {
    ok: true,
    synced: true,
    requiresOwner: configured.requiresOwner,
    fields: configured.fields,
  };
}
