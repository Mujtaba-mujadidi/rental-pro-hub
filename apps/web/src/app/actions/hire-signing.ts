"use server";

import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth/profile";
import {
  assertBundleAccessToEnvelope,
  bundleFieldsForEnvelope,
  completeHireBundleAgreementSigning,
  issueHireBundleSigningTokenForDriver,
  loadHireBundleSigningPayloadByToken,
  verifyHireBundleOtp,
} from "@/lib/esign/hire-signing-bundle";
import { getSavedSignatureForEmail, saveSignatureForEmail } from "@/lib/esign/saved-signatures";
import type { FieldValueMap } from "@/lib/esign/pdf-stamp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function clientMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  };
}

export async function startDriverHireSigningFromRequestAction(
  requestId: string,
): Promise<{ ok: true; signingPath: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("company_driver_access_requests")
    .select("id, status, hire_group_id, driver_user_id")
    .eq("id", requestId.trim())
    .eq("driver_user_id", user.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row?.id) return { ok: false, error: "Request not found." };
  if (row.status !== "approved") {
    return { ok: false, error: "Driver access must be approved before you can sign." };
  }
  if (!row.hire_group_id) {
    return { ok: false, error: "This hire request is not linked to a contract yet." };
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const meta = await clientMeta();
  const issued = await issueHireBundleSigningTokenForDriver(
    admin,
    row.hire_group_id as string,
    user.id,
    meta,
  );
  if (!issued.ok) return issued;

  return { ok: true, signingPath: `/sign/hire/${issued.token}` };
}

export async function loadHireBundleSigningStateAction(
  token: string,
): Promise<
  | {
      ok: true;
      companyName: string;
      vehicleVrm: string;
      hirerName: string;
      bundleVerified: boolean;
      bundleExpired: boolean;
      allSigned: boolean;
      agreements: {
        envelopeId: string;
        title: string;
        lengthLabel: string;
        signed: boolean;
      }[];
    }
  | { ok: false; error: string }
> {
  try {
    const admin = createSupabaseAdminClient();
    const res = await loadHireBundleSigningPayloadByToken(admin, token.trim());
    if (!res.ok) return res;
    const p = res.payload;
    return {
      ok: true,
      companyName: p.companyName,
      vehicleVrm: p.vehicleVrm,
      hirerName: p.hirerName,
      bundleVerified: p.bundleVerified,
      bundleExpired: p.bundleExpired,
      allSigned: p.allSigned,
      agreements: p.agreements.map((a) => ({
        envelopeId: a.envelopeId,
        title: a.title,
        lengthLabel: a.lengthLabel,
        signed: a.signed,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load signing session." };
  }
}

export async function verifyHireBundleOtpAction(
  token: string,
  otp: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createSupabaseAdminClient();
    const meta = await clientMeta();
    return verifyHireBundleOtp(admin, token.trim(), otp, meta);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not verify code." };
  }
}

export async function getHireBundleSavedSignatureAction(
  token: string,
): Promise<{ ok: true; dataUrl: string } | { ok: false }> {
  try {
    const admin = createSupabaseAdminClient();
    const res = await loadHireBundleSigningPayloadByToken(admin, token.trim());
    if (!res.ok) return { ok: false };
    return getSavedSignatureForEmail(admin, res.payload.hirerEmail);
  } catch {
    return { ok: false };
  }
}

export async function completeHireBundleAgreementAction(
  token: string,
  envelopeId: string,
  values: FieldValueMap,
  options?: { saveSignature?: boolean; signatureDataUrl?: string },
): Promise<{ ok: true; allSigned: boolean } | { ok: false; error: string }> {
  try {
    const admin = createSupabaseAdminClient();
    const meta = await clientMeta();
    const res = await completeHireBundleAgreementSigning(admin, token.trim(), envelopeId, values, meta);
    if (!res.ok) return res;

    if (options?.saveSignature && options.signatureDataUrl) {
      const loaded = await loadHireBundleSigningPayloadByToken(admin, token.trim());
      if (loaded.ok) {
        await saveSignatureForEmail(admin, loaded.payload.hirerEmail, options.signatureDataUrl);
      }
    }

    return res;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not complete signing." };
  }
}

export async function loadHireBundleAgreementFieldsAction(
  token: string,
  envelopeId: string,
): Promise<{ ok: true; fields: ReturnType<typeof bundleFieldsForEnvelope> } | { ok: false; error: string }> {
  try {
    const admin = createSupabaseAdminClient();
    const access = await assertBundleAccessToEnvelope(admin, token.trim(), envelopeId);
    if (!access.ok) return access;

    const { data: env } = await admin
      .from("esign_envelopes")
      .select("field_layout")
      .eq("id", envelopeId)
      .maybeSingle();
    if (!env) return { ok: false, error: "Agreement not found." };

    const layout = Array.isArray(env.field_layout) ? env.field_layout : [];
    return { ok: true, fields: bundleFieldsForEnvelope(layout as never[]) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load fields." };
  }
}
