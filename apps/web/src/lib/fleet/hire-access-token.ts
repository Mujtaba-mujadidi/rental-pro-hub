import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateAccessToken, generateOtp, hashSecret, safeEqualHash } from "@/lib/esign/crypto";
import { syncVehicleStatusForHireGroup } from "@/lib/fleet/sync-vehicle-hire-status";
import { logHireGroupEvent } from "@/lib/fleet/hire-audit";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export const HIRE_ACCESS_RESPONSE_TTL_MS = 30 * 60 * 1000;
export const HIRE_ACCESS_OTP_MAX_ATTEMPTS = 3;

export function hireAccessOtpAttemptsExhausted(req: { response_otp_attempts?: number | null }): boolean {
  return (req.response_otp_attempts ?? 0) >= HIRE_ACCESS_OTP_MAX_ATTEMPTS;
}

export function hireAccessOtpAttemptsRemaining(req: { response_otp_attempts?: number | null }): number {
  return Math.max(0, HIRE_ACCESS_OTP_MAX_ATTEMPTS - (req.response_otp_attempts ?? 0));
}

export type DriverAccessResendReason = "otp_exhausted" | "time_expired";

export function driverAccessResendReasonCopy(reason: DriverAccessResendReason | null | undefined): string | null {
  if (reason === "otp_exhausted") {
    return "The driver entered the wrong access code three times, so the previous email link was locked. Send a new request to issue a fresh link and access code.";
  }
  if (reason === "time_expired") {
    return "The previous email link expired after 30 minutes without a response. Send a new request to issue a fresh link and access code.";
  }
  return null;
}

/** Why staff must send a new driver access email (latest expired request on this hire draft). */
export async function loadDriverAccessResendReason(
  admin: Admin,
  hireGroupId: string,
  driverAccessStatus: string,
): Promise<DriverAccessResendReason | null> {
  if (driverAccessStatus !== "not_requested") return null;

  const { data: req } = await admin
    .from("company_driver_access_requests")
    .select("status, response_otp_attempts")
    .eq("hire_group_id", hireGroupId)
    .eq("status", "expired")
    .order("resolved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!req) return null;
  if (hireAccessOtpAttemptsExhausted(req)) return "otp_exhausted";
  return "time_expired";
}

export type HireAccessRequestRow = {
  id: string;
  status: string;
  parent_company_id: string;
  hire_group_id: string | null;
  driver_user_id: string | null;
  response_token_hash: string | null;
  response_otp_hash: string | null;
  response_otp_attempts: number | null;
  response_verified_at: string | null;
  response_expires_at: string | null;
  hire_snapshot: Record<string, unknown> | null;
};

export function hireAccessExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + HIRE_ACCESS_RESPONSE_TTL_MS);
}

export function issueHireAccessResponseCredentials(from = new Date()) {
  const token = generateAccessToken();
  const otp = generateOtp();
  return {
    token,
    otp,
    tokenHash: hashSecret(token),
    otpHash: hashSecret(otp),
    expiresAt: hireAccessExpiresAt(from),
  };
}

export function hireAccessRequestExpired(req: {
  status: string;
  response_expires_at?: string | null;
}): boolean {
  if (req.status === "expired") return true;
  if (req.status !== "pending") return false;
  const expires = req.response_expires_at?.trim();
  if (!expires) return false;
  return new Date(expires).getTime() < Date.now();
}

export function hireAccessRequestUnlocked(
  req: { response_verified_at?: string | null },
  driverUserId?: string | null,
): boolean {
  if (req.response_verified_at) return true;
  return Boolean(driverUserId);
}

export async function findHireAccessRequestByToken(
  admin: Admin,
  token: string,
): Promise<{ ok: true; request: HireAccessRequestRow } | { ok: false; error: string }> {
  const tokenHash = hashSecret(token.trim());
  const { data, error } = await admin
    .from("company_driver_access_requests")
    .select(
      "id, status, parent_company_id, hire_group_id, driver_user_id, response_token_hash, response_otp_hash, response_otp_attempts, response_verified_at, response_expires_at, hire_snapshot",
    )
    .eq("response_token_hash", tokenHash)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Link invalid or expired." };
  return { ok: true, request: data as HireAccessRequestRow };
}

async function finalizeHireAccessRequestAsExpired(
  admin: Admin,
  request: HireAccessRequestRow,
  reason: "time_expired" | "otp_exhausted",
): Promise<HireAccessRequestRow> {
  if (request.status !== "pending") return request;

  const now = new Date().toISOString();
  await admin
    .from("company_driver_access_requests")
    .update({ status: "expired", resolved_at: now })
    .eq("id", request.id)
    .eq("status", "pending");

  if (request.hire_group_id) {
    await admin
      .from("vehicle_hire_groups")
      .update({ driver_access_status: "not_requested" })
      .eq("id", request.hire_group_id)
      .eq("driver_access_status", "pending");
    await syncVehicleStatusForHireGroup(admin, request.hire_group_id);
    await logHireGroupEvent(admin, {
      hireGroupId: request.hire_group_id,
      eventType: "driver_access_rejected",
      summary:
        reason === "otp_exhausted"
          ? "Driver hire access request locked after too many incorrect access codes."
          : "Driver hire access request expired before a response.",
      actorRole: "system",
      metadata: { access_request_id: request.id, via: reason },
    });
  }

  return { ...request, status: "expired" };
}

export async function lockHireAccessRequestIfOtpExhausted(
  admin: Admin,
  request: HireAccessRequestRow,
): Promise<HireAccessRequestRow> {
  if (request.status !== "pending" || !hireAccessOtpAttemptsExhausted(request)) return request;
  return finalizeHireAccessRequestAsExpired(admin, request, "otp_exhausted");
}

export async function expireHireAccessRequestIfNeeded(
  admin: Admin,
  request: HireAccessRequestRow,
): Promise<HireAccessRequestRow> {
  const locked = await lockHireAccessRequestIfOtpExhausted(admin, request);
  if (locked.status === "expired") return locked;

  if (!hireAccessRequestExpired(request)) return request;
  return finalizeHireAccessRequestAsExpired(admin, request, "time_expired");
}

export async function verifyHireAccessOtp(
  admin: Admin,
  token: string,
  otp: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const found = await findHireAccessRequestByToken(admin, token);
  if (!found.ok) return found;

  let request = await expireHireAccessRequestIfNeeded(admin, found.request);
  if (request.status !== "pending") {
    return {
      ok: false,
      error:
        request.status === "expired" && hireAccessOtpAttemptsExhausted(found.request)
          ? "Too many incorrect access codes. This link is no longer valid. Ask the rental company to send a new access request."
          : "This request has expired or already been answered.",
    };
  }
  if (request.response_verified_at) return { ok: true };

  const attempts = request.response_otp_attempts ?? 0;

  if (
    !request.response_otp_hash ||
    !request.response_expires_at ||
    new Date(request.response_expires_at) < new Date()
  ) {
    const nextAttempts = attempts + 1;
    await admin
      .from("company_driver_access_requests")
      .update({ response_otp_attempts: nextAttempts })
      .eq("id", request.id);
    if (nextAttempts >= HIRE_ACCESS_OTP_MAX_ATTEMPTS) {
      await finalizeHireAccessRequestAsExpired(
        admin,
        { ...request, response_otp_attempts: nextAttempts },
        "otp_exhausted",
      );
      return {
        ok: false,
        error:
          "Too many incorrect access codes. This link is no longer valid. Ask the rental company to send a new access request.",
      };
    }
    return { ok: false, error: "This link has expired. Ask the rental company to send a new access request." };
  }

  if (!safeEqualHash(request.response_otp_hash, hashSecret(otp.trim()))) {
    const nextAttempts = attempts + 1;
    await admin
      .from("company_driver_access_requests")
      .update({ response_otp_attempts: nextAttempts })
      .eq("id", request.id);
    if (nextAttempts >= HIRE_ACCESS_OTP_MAX_ATTEMPTS) {
      await finalizeHireAccessRequestAsExpired(
        admin,
        { ...request, response_otp_attempts: nextAttempts },
        "otp_exhausted",
      );
      return {
        ok: false,
        error:
          "Too many incorrect access codes. This link is no longer valid. Ask the rental company to send a new access request.",
      };
    }
    const remaining = HIRE_ACCESS_OTP_MAX_ATTEMPTS - nextAttempts;
    return {
      ok: false,
      error: `Incorrect access code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
    };
  }

  const now = new Date().toISOString();
  await admin
    .from("company_driver_access_requests")
    .update({
      response_verified_at: now,
      response_otp_attempts: 0,
    })
    .eq("id", request.id);

  return { ok: true };
}

export async function approveHireAccessViaToken(
  admin: Admin,
  requestId: string,
  options?: { resolvedByUserId?: string | null; via?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: req } = await admin
    .from("company_driver_access_requests")
    .select(
      "id, status, driver_user_id, hire_group_id, parent_company_id, response_verified_at, response_expires_at",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.status !== "pending") {
    return { ok: false, error: "Request not found." };
  }
  if (hireAccessRequestExpired(req)) {
    return { ok: false, error: "This request has expired. Ask the rental company to send a new access request." };
  }

  const driverUserId = (req.driver_user_id as string | null) ?? null;
  if (!driverUserId) {
    return { ok: false, error: "Driver account not found for this request." };
  }

  const sessionUserId = options?.resolvedByUserId ?? null;
  if (sessionUserId) {
    if (sessionUserId !== driverUserId) {
      return { ok: false, error: "Sign in with the driver account this hire request was sent to." };
    }
  } else if (!req.response_verified_at) {
    return { ok: false, error: "Enter the access code from your email to continue." };
  }

  const now = new Date().toISOString();
  const { error: reqErr } = await admin
    .from("company_driver_access_requests")
    .update({
      status: "approved",
      resolved_at: now,
      resolved_by_user_id: sessionUserId,
    })
    .eq("id", requestId)
    .eq("status", "pending");
  if (reqErr) return { ok: false, error: reqErr.message };

  if (req.hire_group_id) {
    const { error: groupErr } = await admin
      .from("vehicle_hire_groups")
      .update({ driver_access_status: "approved" })
      .eq("id", req.hire_group_id);
    if (groupErr) return { ok: false, error: groupErr.message };
  }

  const { error: linkErr } = await admin.from("company_driver_links").upsert(
    {
      parent_company_id: req.parent_company_id,
      driver_user_id: driverUserId,
      status: "active",
      linked_at: now,
      linked_by_user_id: sessionUserId ?? driverUserId,
    },
    { onConflict: "parent_company_id,driver_user_id" },
  );
  if (linkErr) return { ok: false, error: linkErr.message };

  if (req.hire_group_id) {
    await logHireGroupEvent(admin, {
      hireGroupId: req.hire_group_id as string,
      eventType: "driver_access_approved",
      summary: sessionUserId
        ? "Driver approved profile access for this hire."
        : "Driver approved profile access via email link (access code verified).",
      actorRole: "driver",
      actorUserId: sessionUserId,
      metadata: { access_request_id: requestId, via: options?.via ?? "email_token" },
    });
    await syncVehicleStatusForHireGroup(admin, req.hire_group_id as string);
  }

  return { ok: true };
}

export async function rejectHireAccessViaToken(
  admin: Admin,
  requestId: string,
  options?: { resolvedByUserId?: string | null; via?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: req } = await admin
    .from("company_driver_access_requests")
    .select("id, status, hire_group_id, parent_company_id, response_verified_at, response_expires_at")
    .eq("id", requestId)
    .maybeSingle();
  if (!req || req.status !== "pending") {
    return { ok: false, error: "Request not found." };
  }
  if (hireAccessRequestExpired(req)) {
    return { ok: false, error: "This request has expired. Ask the rental company to send a new access request." };
  }

  const sessionUserId = options?.resolvedByUserId ?? null;
  if (!sessionUserId && !req.response_verified_at) {
    return { ok: false, error: "Enter the access code from your email to continue." };
  }

  const now = new Date().toISOString();
  const { error: reqErr } = await admin
    .from("company_driver_access_requests")
    .update({
      status: "rejected",
      resolved_at: now,
      resolved_by_user_id: sessionUserId,
    })
    .eq("id", requestId)
    .eq("status", "pending");
  if (reqErr) return { ok: false, error: reqErr.message };

  if (req.hire_group_id) {
    const { error: groupErr } = await admin
      .from("vehicle_hire_groups")
      .update({ driver_access_status: "rejected" })
      .eq("id", req.hire_group_id);
    if (groupErr) return { ok: false, error: groupErr.message };

    await logHireGroupEvent(admin, {
      hireGroupId: req.hire_group_id as string,
      eventType: "driver_access_rejected",
      summary: sessionUserId
        ? "Driver rejected profile access for this hire."
        : "Driver rejected profile access via email link (access code verified).",
      actorRole: "driver",
      actorUserId: sessionUserId,
      metadata: { access_request_id: requestId, via: options?.via ?? "email_token" },
    });
    await syncVehicleStatusForHireGroup(admin, req.hire_group_id as string);
  }

  return { ok: true };
}
