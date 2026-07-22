"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canWriteRentals } from "@/lib/auth/rental-permissions";
import {
  getHireGroupIdForEnvelope,
  loadHireBundleSigningPayload,
  sendHireGroupSigningBundle,
} from "@/lib/esign/hire-signing-bundle";
import { validateAllEnvelopesReadyForHireBundleSend } from "@/lib/fleet/hire-signing-bundle";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function clientMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

async function requireHireGroupWrite(hireGroupId: string) {
  const { profile, user } = await requireRentalCompanyArea();
  const writable = await assertRentalCompanyWritable(profile);
  if (!writable.ok) return writable;
  if (!canWriteRentals(profile)) return { ok: false as const, error: "You do not have permission." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group?.id || group.parent_company_id !== profile.company_id) {
    return { ok: false as const, error: "Hire contract not found." };
  }

  return { ok: true as const, admin, user, hireGroupId: group.id as string, status: group.status as string };
}

async function loadEnvelopeReadyRows(admin: ReturnType<typeof createSupabaseAdminClient>, hireGroupId: string) {
  const { data, error } = await admin
    .from("vehicle_hire_agreements")
    .select(
      "esign_envelope_id, esign_envelopes(id, status, field_layout, requires_owner_signature, owner_signed_at, esign_recipients(signed_at))",
    )
    .eq("hire_group_id", hireGroupId);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => {
      const env = (row as {
        esign_envelopes?: {
          id?: string;
          status?: string;
          field_layout?: EsignFieldLayoutItem[];
          requires_owner_signature?: boolean;
          owner_signed_at?: string | null;
          esign_recipients?: { signed_at?: string | null }[];
        } | null;
      }).esign_envelopes;
      const envelopeId = (env?.id ?? row.esign_envelope_id) as string | undefined;
      if (!envelopeId) return null;
      const signed = Boolean(env?.esign_recipients?.[0]?.signed_at) || env?.status === "completed";
      return {
        envelopeId,
        status: (env?.status as string) ?? "draft",
        requiresOwner: env?.requires_owner_signature !== false,
        ownerSignedAt: (env?.owner_signed_at as string | null) ?? null,
        fieldLayout: (env?.field_layout ?? []) as EsignFieldLayoutItem[],
        signed,
      };
    })
    .filter(Boolean) as {
    envelopeId: string;
    status: string;
    requiresOwner: boolean;
    ownerSignedAt: string | null;
    fieldLayout: EsignFieldLayoutItem[];
    signed: boolean;
  }[];
}

export async function loadHireGroupSigningPrepAction(
  hireGroupId: string,
): Promise<
  | {
      ok: true;
      agreementCount: number;
      unsignedCount: number;
      bundleSent: boolean;
      canSend: boolean;
      sendBlockReason: string | null;
      agreements: { envelopeId: string; lengthLabel: string; signed: boolean; status: string }[];
    }
  | { ok: false; error: string }
> {
  const gate = await requireHireGroupWrite(hireGroupId);
  if (!gate.ok) return gate;

  const loaded = await loadHireBundleSigningPayload(gate.admin, gate.hireGroupId);
  if (!loaded.ok) return loaded;

  const envelopeRows = await loadEnvelopeReadyRows(gate.admin, gate.hireGroupId);
  const ready = validateAllEnvelopesReadyForHireBundleSend(envelopeRows);

  const { data: group } = await gate.admin
    .from("vehicle_hire_groups")
    .select("signing_bundle_sent_at")
    .eq("id", gate.hireGroupId)
    .maybeSingle();

  return {
    ok: true,
    agreementCount: loaded.payload.agreements.length,
    unsignedCount: loaded.payload.agreements.filter((a) => !a.signed).length,
    bundleSent: Boolean(group?.signing_bundle_sent_at),
    canSend: ready.ok && gate.status === "pending_signature" && loaded.payload.agreements.some((a) => !a.signed),
    sendBlockReason: ready.ok ? null : ready.error,
    agreements: loaded.payload.agreements.map((a) => ({
      envelopeId: a.envelopeId,
      lengthLabel: a.lengthLabel,
      signed: a.signed,
      status: a.envelopeStatus,
    })),
  };
}

export async function sendHireGroupSigningBundleAction(
  hireGroupId: string,
  options?: { resend?: boolean },
): Promise<{ ok: true; agreementCount: number } | { ok: false; error: string }> {
  const gate = await requireHireGroupWrite(hireGroupId);
  if (!gate.ok) return gate;
  const meta = await clientMeta();

  const res = await sendHireGroupSigningBundle(gate.admin, gate.hireGroupId, {
    actorUserId: gate.user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    resend: options?.resend,
  });
  if (!res.ok) return res;

  const loaded = await loadHireBundleSigningPayload(gate.admin, gate.hireGroupId);
  revalidatePath("/rental/hires");
  revalidatePath("/rental/vehicles");
  if (loaded.ok) {
    for (const a of loaded.payload.agreements) {
      revalidatePath(`/rental/esign/${a.envelopeId}`);
    }
  }

  return { ok: true, agreementCount: res.agreementCount };
}

export async function sendHireGroupSigningBundleFromEnvelopeAction(
  envelopeId: string,
  options?: { resend?: boolean },
): Promise<{ ok: true; agreementCount: number } | { ok: false; error: string }> {
  const gate = await requireRentalCompanyArea();
  if (!canWriteRentals(gate.profile)) return { ok: false, error: "You do not have permission." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const hireGroupId = await getHireGroupIdForEnvelope(admin, envelopeId);
  if (!hireGroupId) return { ok: false, error: "Not a hire agreement envelope." };

  return sendHireGroupSigningBundleAction(hireGroupId, options);
}
