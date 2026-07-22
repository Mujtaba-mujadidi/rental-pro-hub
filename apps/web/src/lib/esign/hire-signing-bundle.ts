import { dispatchEnvelopeCompleted } from "@/lib/esign/adapters/dispatch-envelope-hooks";
import { VEHICLE_HIRE_AGREEMENT_CONTEXT } from "@/lib/esign/adapters/vehicle-hire-agreement";
import { appendEsignAudit } from "@/lib/esign/audit";
import { generateAccessToken, generateOtp, hashSecret, safeEqualHash } from "@/lib/esign/crypto";
import { completeSigning } from "@/lib/esign/envelope";
import { fieldsForRole } from "@/lib/esign/roles";
import { CONTRACT_LENGTH_LABELS, formatRentLabel } from "@/lib/fleet/hire-access-display";
import { sendHireSigningBundleEmail } from "@/lib/fleet/hire-signing-mail";
import {
  countUnsignedHireBundleAgreements,
  hireBundleSigningComplete,
  sortHireBundleAgreements,
  validateAllEnvelopesReadyForHireBundleSend,
  type HireBundleAgreementRef,
} from "@/lib/fleet/hire-signing-bundle";
import type { ContractLengthKind } from "@/lib/fleet/hire-types";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";
import { getPublicSiteUrl } from "@/lib/supabase/site-url";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ESIGN_RECIPIENT_ROLE, type EsignFieldLayoutItem } from "@/lib/esign/types";
import type { FieldValueMap } from "@/lib/esign/pdf-stamp";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type HireBundleGroupRow = {
  id: string;
  parent_company_id: string;
  status: string;
  signing_bundle_token_hash: string | null;
  signing_bundle_otp_hash: string | null;
  signing_bundle_otp_expires_at: string | null;
  signing_bundle_otp_attempts: number;
  signing_bundle_verified_at: string | null;
  signing_bundle_sent_at: string | null;
  signing_bundle_expires_at: string | null;
  driver_user_id: string;
  vehicles: { vrm?: string | null } | null;
};

export type HireBundleSigningPayload = {
  hireGroupId: string;
  companyName: string;
  vehicleVrm: string;
  hirerEmail: string;
  hirerName: string;
  bundleVerified: boolean;
  bundleSent: boolean;
  bundleExpired: boolean;
  agreements: (HireBundleAgreementRef & { title: string; lengthLabel: string })[];
  allSigned: boolean;
};

export async function findHireGroupByBundleToken(
  admin: Admin,
  token: string,
): Promise<{ ok: true; group: HireBundleGroupRow } | { ok: false; error: string }> {
  const hash = hashSecret(token.trim());
  const { data, error } = await admin
    .from("vehicle_hire_groups")
    .select(
      "id, parent_company_id, status, signing_bundle_token_hash, signing_bundle_otp_hash, signing_bundle_otp_expires_at, signing_bundle_otp_attempts, signing_bundle_verified_at, signing_bundle_sent_at, signing_bundle_expires_at, driver_user_id, vehicles(vrm)",
    )
    .eq("signing_bundle_token_hash", hash)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.id) return { ok: false, error: "Invalid or expired link." };
  return { ok: true, group: data as unknown as HireBundleGroupRow };
}

export async function getHireGroupIdForEnvelope(admin: Admin, envelopeId: string): Promise<string | null> {
  const { data: env } = await admin
    .from("esign_envelopes")
    .select("context_type, context_id")
    .eq("id", envelopeId.trim())
    .maybeSingle();
  if (!env?.context_id || env.context_type !== VEHICLE_HIRE_AGREEMENT_CONTEXT) return null;
  const { data: agreement } = await admin
    .from("vehicle_hire_agreements")
    .select("hire_group_id")
    .eq("id", env.context_id)
    .maybeSingle();
  return (agreement?.hire_group_id as string | null) ?? null;
}

export async function loadBundleAgreements(admin: Admin, hireGroupId: string): Promise<HireBundleAgreementRef[]> {
  const { data, error } = await admin
    .from("vehicle_hire_agreements")
    .select(
      "id, contract_length_kind, end_date, esign_envelope_id, esign_envelopes(id, status, esign_recipients(signed_at))",
    )
    .eq("hire_group_id", hireGroupId)
    .order("end_date", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? [])
    .map((a) => {
      const env = (a as { esign_envelopes?: { id?: string; status?: string; esign_recipients?: { signed_at?: string | null }[] } | null })
        .esign_envelopes;
      const recipientSigned = Boolean(env?.esign_recipients?.[0]?.signed_at);
      const envelopeCompleted = env?.status === "completed";
      return {
        agreementId: a.id as string,
        contractLengthKind: a.contract_length_kind as ContractLengthKind,
        endDate: a.end_date as string,
        envelopeId: (env?.id ?? a.esign_envelope_id) as string,
        envelopeStatus: (env?.status as string) ?? "draft",
        signed: recipientSigned || envelopeCompleted,
      };
    })
    .filter((a) => Boolean(a.envelopeId));

  return sortHireBundleAgreements(rows);
}

export async function loadHireBundleSigningPayload(
  admin: Admin,
  hireGroupId: string,
): Promise<{ ok: true; payload: HireBundleSigningPayload } | { ok: false; error: string }> {
  const { data: group, error: gErr } = await admin
    .from("vehicle_hire_groups")
    .select(
      "id, parent_company_id, status, signing_bundle_verified_at, signing_bundle_sent_at, signing_bundle_expires_at, driver_user_id, vehicles(vrm)",
    )
    .eq("id", hireGroupId)
    .maybeSingle();
  if (gErr || !group?.id) return { ok: false, error: gErr?.message ?? "Hire not found." };

  const [{ data: company }, { data: driver }, agreements] = await Promise.all([
    admin.from("companies").select("name").eq("id", group.parent_company_id).maybeSingle(),
    admin.from("driver_profiles").select("first_name, last_name, account_email").eq("user_id", group.driver_user_id).maybeSingle(),
    loadBundleAgreements(admin, hireGroupId),
  ]);

  if (!driver?.account_email?.trim()) {
    return { ok: false, error: "Driver email is missing." };
  }
  if (!agreements.length) {
    return { ok: false, error: "No agreements are ready for signing." };
  }

  const vrm = ((group as { vehicles?: { vrm?: string } | null }).vehicles?.vrm ?? "Vehicle") as string;
  const hirerName =
    [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.account_email;

  const now = Date.now();
  const bundleExpired = Boolean(
    group.signing_bundle_expires_at && new Date(group.signing_bundle_expires_at as string).getTime() < now,
  );

  const payload: HireBundleSigningPayload = {
    hireGroupId: group.id as string,
    companyName: (company?.name as string) ?? "Rental company",
    vehicleVrm: vrm,
    hirerEmail: driver.account_email.trim(),
    hirerName,
    bundleVerified: Boolean(group.signing_bundle_verified_at),
    bundleSent: Boolean(group.signing_bundle_sent_at),
    bundleExpired,
    allSigned: hireBundleSigningComplete(agreements),
    agreements: agreements.map((a) => ({
      ...a,
      title: `Vehicle hire agreement — ${vrm}`,
      lengthLabel: CONTRACT_LENGTH_LABELS[a.contractLengthKind] ?? a.contractLengthKind,
    })),
  };

  return { ok: true, payload };
}

export async function loadHireBundleSigningPayloadByToken(
  admin: Admin,
  token: string,
): Promise<{ ok: true; payload: HireBundleSigningPayload } | { ok: false; error: string }> {
  const found = await findHireGroupByBundleToken(admin, token);
  if (!found.ok) return found;
  return loadHireBundleSigningPayload(admin, found.group.id);
}

export async function assertBundleAccessToEnvelope(
  admin: Admin,
  bundleToken: string,
  envelopeId: string,
): Promise<{ ok: true; hireGroupId: string } | { ok: false; error: string }> {
  const found = await findHireGroupByBundleToken(admin, bundleToken);
  if (!found.ok) return found;
  const group = found.group;

  if (!group.signing_bundle_verified_at) {
    return { ok: false, error: "Verify the access code first." };
  }
  if (group.signing_bundle_expires_at && new Date(group.signing_bundle_expires_at) < new Date()) {
    return { ok: false, error: "This signing link has expired." };
  }

  const agreements = await loadBundleAgreements(admin, group.id);
  if (!agreements.some((a) => a.envelopeId === envelopeId)) {
    return { ok: false, error: "This agreement is not part of your signing session." };
  }

  return { ok: true, hireGroupId: group.id };
}

export async function verifyHireBundleOtp(
  admin: Admin,
  token: string,
  otp: string,
  opts?: { ip?: string | null; userAgent?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const found = await findHireGroupByBundleToken(admin, token);
  if (!found.ok) return found;
  const group = found.group;

  if (group.signing_bundle_verified_at) return { ok: true };

  const attempts = group.signing_bundle_otp_attempts ?? 0;
  if (attempts >= 8) {
    return { ok: false, error: "Too many attempts. Ask the rental company to resend the signing email." };
  }
  if (
    !group.signing_bundle_otp_hash ||
    !group.signing_bundle_otp_expires_at ||
    new Date(group.signing_bundle_otp_expires_at) < new Date()
  ) {
    await admin
      .from("vehicle_hire_groups")
      .update({ signing_bundle_otp_attempts: attempts + 1 })
      .eq("id", group.id);
    return { ok: false, error: "Code expired. Ask the rental company to resend the signing email." };
  }
  if (!safeEqualHash(group.signing_bundle_otp_hash, hashSecret(otp.trim()))) {
    await admin
      .from("vehicle_hire_groups")
      .update({ signing_bundle_otp_attempts: attempts + 1 })
      .eq("id", group.id);
    return { ok: false, error: "Incorrect code." };
  }

  const now = new Date().toISOString();
  await admin
    .from("vehicle_hire_groups")
    .update({
      signing_bundle_verified_at: now,
      signing_bundle_otp_attempts: 0,
    })
    .eq("id", group.id);

  await markUnsignedHireBundleRecipientsVerified(admin, group.id, now, opts);

  return { ok: true };
}

async function markUnsignedHireBundleRecipientsVerified(
  admin: Admin,
  hireGroupId: string,
  verifiedAt: string,
  opts?: { ip?: string | null; userAgent?: string | null },
): Promise<void> {
  const agreements = await loadBundleAgreements(admin, hireGroupId);
  for (const agreement of agreements) {
    if (agreement.signed) continue;
    const { data: recipients } = await admin
      .from("esign_recipients")
      .select("id")
      .eq("envelope_id", agreement.envelopeId);
    for (const rec of recipients ?? []) {
      await admin
        .from("esign_recipients")
        .update({ verified_at: verifiedAt })
        .eq("id", rec.id as string);
    }
    await admin
      .from("esign_envelopes")
      .update({ status: "viewed" })
      .eq("id", agreement.envelopeId)
      .in("status", ["sent"]);
    await appendEsignAudit(admin, agreement.envelopeId, "otp_verified", {
      ip: opts?.ip,
      userAgent: opts?.userAgent,
      metadata: { hire_bundle: true, hire_group_id: hireGroupId, driver_session: true },
    });
  }
}

/** Logged-in driver opens signing from Hire requests — fresh token, OTP skipped. */
export async function issueHireBundleSigningTokenForDriver(
  admin: Admin,
  hireGroupId: string,
  driverUserId: string,
  opts?: { ip?: string | null; userAgent?: string | null },
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const { data: group, error: gErr } = await admin
    .from("vehicle_hire_groups")
    .select(
      "id, driver_user_id, status, signing_bundle_sent_at, signing_bundle_expires_at, signing_bundle_verified_at",
    )
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (gErr || !group?.id) return { ok: false, error: gErr?.message ?? "Hire not found." };
  if (group.driver_user_id !== driverUserId) {
    return { ok: false, error: "You are not authorised to sign this contract." };
  }
  if (!group.signing_bundle_sent_at) {
    return { ok: false, error: "This contract has not been sent for signature yet." };
  }
  if (
    group.signing_bundle_expires_at &&
    new Date(group.signing_bundle_expires_at as string).getTime() < Date.now()
  ) {
    return {
      ok: false,
      error: "The signing link has expired. Ask the rental company to resend the contract.",
    };
  }

  const agreements = await loadBundleAgreements(admin, hireGroupId);
  if (!agreements.length) {
    return { ok: false, error: "No agreements are ready for signing." };
  }
  if (hireBundleSigningComplete(agreements)) {
    return { ok: false, error: "All agreements are already signed." };
  }

  const token = generateAccessToken();
  const otp = generateOtp();
  const otpExpires = new Date();
  otpExpires.setHours(otpExpires.getHours() + 24);
  const now = new Date().toISOString();

  const { error: upErr } = await admin
    .from("vehicle_hire_groups")
    .update({
      signing_bundle_token_hash: hashSecret(token),
      signing_bundle_otp_hash: hashSecret(otp),
      signing_bundle_otp_expires_at: otpExpires.toISOString(),
      signing_bundle_otp_attempts: 0,
      signing_bundle_verified_at: now,
    })
    .eq("id", hireGroupId);
  if (upErr) return { ok: false, error: upErr.message };

  await markUnsignedHireBundleRecipientsVerified(admin, hireGroupId, now, opts);

  return { ok: true, token };
}

async function loadEnvelopeRowsForBundleSend(admin: Admin, hireGroupId: string) {
  const { data, error } = await admin
    .from("vehicle_hire_agreements")
    .select(
      "id, esign_envelope_id, esign_envelopes(id, status, field_layout, requires_owner_signature, owner_signed_at, esign_recipients(signed_at))",
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

export async function sendHireGroupSigningBundle(
  admin: Admin,
  hireGroupId: string,
  opts?: { actorUserId?: string | null; ip?: string | null; userAgent?: string | null; resend?: boolean },
): Promise<{ ok: true; agreementCount: number; unsignedCount: number } | { ok: false; error: string }> {
  const { data: group, error: gErr } = await admin
    .from("vehicle_hire_groups")
    .select("id, parent_company_id, status, driver_user_id, start_date, rent_amount_gbp, rent_cadence, vehicles(vrm, make, model)")
    .eq("id", hireGroupId)
    .maybeSingle();
  if (gErr || !group?.id) return { ok: false, error: gErr?.message ?? "Hire not found." };
  if (group.status !== "pending_signature") {
    return { ok: false, error: "Hire is not awaiting signature." };
  }

  const envelopeRows = await loadEnvelopeRowsForBundleSend(admin, hireGroupId);
  const ready = validateAllEnvelopesReadyForHireBundleSend(envelopeRows);
  if (!ready.ok) return ready;

  const unsignedCount = countUnsignedHireBundleAgreements(envelopeRows);
  const agreements = await loadBundleAgreements(admin, hireGroupId);

  const [{ data: company }, { data: driver }] = await Promise.all([
    admin.from("companies").select("name").eq("id", group.parent_company_id).maybeSingle(),
    admin.from("driver_profiles").select("first_name, last_name, account_email").eq("user_id", group.driver_user_id).maybeSingle(),
  ]);
  if (!driver?.account_email?.trim()) {
    return { ok: false, error: "Driver email is required." };
  }

  const token = generateAccessToken();
  const otp = generateOtp();
  const otpExpires = new Date();
  otpExpires.setHours(otpExpires.getHours() + 24);
  const bundleExpires = new Date();
  bundleExpires.setDate(bundleExpires.getDate() + 14);
  const now = new Date().toISOString();

  const { error: upGroupErr } = await admin
    .from("vehicle_hire_groups")
    .update({
      signing_bundle_token_hash: hashSecret(token),
      signing_bundle_otp_hash: hashSecret(otp),
      signing_bundle_otp_expires_at: otpExpires.toISOString(),
      signing_bundle_otp_attempts: 0,
      signing_bundle_verified_at: null,
      signing_bundle_sent_at: now,
      signing_bundle_expires_at: bundleExpires.toISOString(),
    })
    .eq("id", hireGroupId);
  if (upGroupErr) return { ok: false, error: upGroupErr.message };

  for (const env of envelopeRows) {
    if (env.signed) continue;
    await admin
      .from("esign_envelopes")
      .update({
        status: "sent",
        sent_at: now,
        expires_at: bundleExpires.toISOString(),
      })
      .eq("id", env.envelopeId)
      .neq("status", "completed");
    await admin
      .from("esign_recipients")
      .update({ verified_at: null, signed_at: null })
      .eq("envelope_id", env.envelopeId);
    await appendEsignAudit(admin, env.envelopeId, opts?.resend ? "envelope_resent" : "envelope_sent", {
      actor: opts?.actorUserId ?? null,
      ip: opts?.ip,
      userAgent: opts?.userAgent,
      metadata: { hire_bundle: true, hire_group_id: hireGroupId },
    });
  }

  const vrm = ((group as { vehicles?: { vrm?: string; make?: string; model?: string } | null }).vehicles?.vrm ?? "vehicle") as string;
  const vehicle = (group as { vehicles?: { vrm?: string; make?: string; model?: string } | null }).vehicles;
  const vehicleLabel = vehicle ? [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim() || "Vehicle" : "Vehicle";
  const companyName = (company?.name as string) ?? "Rental company";
  const driverName =
    [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.account_email.trim();
  const rentLabel =
    formatRentLabel(group.rent_amount_gbp, group.rent_cadence) ?? "—";
  const link = `${getPublicSiteUrl()}/sign/hire/${token}`;
  const unsignedAgreements = agreements.filter((a) => !a.signed);

  const mail = await sendHireSigningBundleEmail({
    to: driver.account_email.trim(),
    driverName,
    companyName,
    vehicleLabel,
    vrm,
    startDate: group.start_date as string,
    rentLabel,
    agreements: unsignedAgreements.map((a) => ({
      lengthLabel: CONTRACT_LENGTH_LABELS[a.contractLengthKind] ?? a.contractLengthKind,
      endDate: a.endDate,
    })),
    unsignedCount,
    signingUrl: link,
    otp,
  });
  if (!mail.ok) return mail;

  await logHireGroupEvent(admin, {
    hireGroupId,
    eventType: opts?.resend ? "hire_signing_bundle_resent" : "hire_signing_bundle_sent",
    summary:
      unsignedCount === 1
        ? "Hire agreement sent to hirer for signature."
        : `${unsignedCount} hire agreements sent to hirer in one signing session.`,
    actorRole: "company_staff",
    actorUserId: opts?.actorUserId ?? null,
    metadata: { agreement_count: agreements.length, unsigned_count: unsignedCount },
  });

  return { ok: true, agreementCount: agreements.length, unsignedCount };
}

export async function completeHireBundleAgreementSigning(
  admin: Admin,
  bundleToken: string,
  envelopeId: string,
  values: FieldValueMap,
  opts?: { ip?: string | null; userAgent?: string | null },
): Promise<{ ok: true; allSigned: boolean } | { ok: false; error: string }> {
  const access = await assertBundleAccessToEnvelope(admin, bundleToken, envelopeId);
  if (!access.ok) return access;

  const { data: rec } = await admin
    .from("esign_recipients")
    .select("id, verified_at, signed_at, email")
    .eq("envelope_id", envelopeId)
    .maybeSingle();
  if (!rec?.id) return { ok: false, error: "Recipient not found." };
  if (!rec.verified_at) return { ok: false, error: "Verify the access code first." };
  if (rec.signed_at) return { ok: false, error: "This agreement is already signed." };

  const res = await completeSigning(
    admin,
    {
      envelopeId,
      recipientId: rec.id as string,
      values,
      ip: opts?.ip,
      userAgent: opts?.userAgent,
    },
    dispatchEnvelopeCompleted,
  );
  if (!res.ok) return res;

  const agreements = await loadBundleAgreements(admin, access.hireGroupId);
  return { ok: true, allSigned: hireBundleSigningComplete(agreements) };
}

export async function clearHireGroupSigningBundle(admin: Admin, hireGroupId: string): Promise<void> {
  await admin
    .from("vehicle_hire_groups")
    .update({
      signing_bundle_token_hash: null,
      signing_bundle_otp_hash: null,
      signing_bundle_otp_expires_at: null,
      signing_bundle_otp_attempts: 0,
      signing_bundle_verified_at: null,
      signing_bundle_sent_at: null,
      signing_bundle_expires_at: null,
    })
    .eq("id", hireGroupId);
}

export function bundleFieldsForEnvelope(
  layout: EsignFieldLayoutItem[],
): EsignFieldLayoutItem[] {
  return fieldsForRole(layout, ESIGN_RECIPIENT_ROLE);
}
