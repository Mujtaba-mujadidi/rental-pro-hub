import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const HIRE_GROUP_EVENT_TYPES = [
  "draft_created",
  "draft_step_saved",
  "driver_access_requested",
  "driver_access_email_sent",
  "driver_access_approved",
  "driver_access_rejected",
  "driver_profile_confirmed",
  "hire_contract_amended",
  "contracts_finalized",
  "vehicle_status_synced",
  "esign_prepared",
  "esign_completed",
  "hire_status_changed",
  "hire_cancelled",
  "hire_reprepared_for_signature",
  "hire_pdfs_refreshed",
  "hire_signing_bundle_sent",
  "hire_signing_bundle_resent",
  "checkout_started",
  "checkout_completed",
  "checkin_started",
  "checkin_completed",
  "hire_terminated",
  "deposit_disposition_resolved",
  "deposit_refund_recorded",
  "settlement_refund_recorded",
  "settlement_discount_recorded",
  "driver_charge_added",
  "driver_charge_amended",
  "driver_charge_voided",
  "driver_charge_removed",
  "driver_charge_payment_submitted",
  "driver_charge_payment_approved",
  "driver_charge_payment_rejected",
] as const;

export type HireGroupEventType = (typeof HIRE_GROUP_EVENT_TYPES)[number];
export type HireAuditActorRole = "company_staff" | "driver" | "system";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type HireGroupAuditRow = {
  id: string;
  event_type: HireGroupEventType;
  actor_user_id: string | null;
  actor_role: HireAuditActorRole;
  /** Resolved display name for the actor (staff audit views only). */
  actor_display_name?: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const GENERIC_ACTOR_NAMES = new Set(["company user", "user", "company staff", "staff"]);

/** Prefer a real person name over invite placeholders like "Company user". */
export function pickAuditActorDisplayName(input: {
  profileDisplayName?: string | null;
  metadataFullName?: string | null;
  metadataFirstName?: string | null;
  metadataLastName?: string | null;
  email?: string | null;
}): string | null {
  const usable = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim() || "";
    if (!trimmed) return null;
    if (GENERIC_ACTOR_NAMES.has(trimmed.toLowerCase())) return null;
    return trimmed;
  };

  const fromParts = [input.metadataFirstName, input.metadataLastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const email = input.email?.trim() || "";
  const emailLocal = email.includes("@") ? email.slice(0, email.indexOf("@")).replace(/[._]+/g, " ").trim() : "";

  return (
    usable(input.profileDisplayName) ||
    usable(input.metadataFullName) ||
    usable(fromParts) ||
    usable(emailLocal) ||
    usable(email)
  );
}

export function hireAuditActorRoleLabel(role: HireAuditActorRole | string | null | undefined): string {
  if (role === "company_staff") return "Company staff";
  if (role === "driver") return "Driver";
  if (role === "system") return "System";
  if (!role) return "Unknown";
  return String(role).replace(/_/g, " ");
}

/** Staff name first, with role as a suffix when the name is known. */
export function formatAuditActorLabel(
  displayName: string | null | undefined,
  role?: HireAuditActorRole | string | null,
): string {
  const roleLabel = hireAuditActorRoleLabel(role);
  const name = displayName?.trim() || null;
  if (name && role && role !== "system") return `${name} · ${roleLabel}`;
  if (name) return name;
  return roleLabel;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

/** Load profile display names for hire audit actors (after authorisation). */
export async function loadHireAuditActorDisplayNames(
  admin: Admin,
  userIds: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return {};
  const names: Record<string, string> = {};

  const { data } = await admin.from("profiles").select("id, display_name").in("id", ids);
  for (const row of data ?? []) {
    const name = pickAuditActorDisplayName({
      profileDisplayName: (row.display_name as string | null) ?? null,
    });
    if (name) names[row.id as string] = name;
  }

  const missingAfterProfiles = ids.filter((id) => !names[id]);
  await Promise.all(
    missingAfterProfiles.map(async (id) => {
      const { data: authRes, error } = await admin.auth.admin.getUserById(id);
      if (error || !authRes.user) return;
      const metadata = (authRes.user.user_metadata ?? {}) as Record<string, unknown>;
      const name = pickAuditActorDisplayName({
        metadataFullName: metadataString(metadata, "full_name"),
        metadataFirstName: metadataString(metadata, "first_name"),
        metadataLastName: metadataString(metadata, "last_name"),
        email: authRes.user.email ?? null,
      });
      if (name) names[id] = name;
    }),
  );

  const missingAfterAuth = ids.filter((id) => !names[id]);
  if (missingAfterAuth.length) {
    const { data: drivers } = await admin
      .from("driver_profiles")
      .select("user_id, first_name, last_name, account_email")
      .in("user_id", missingAfterAuth);
    for (const row of drivers ?? []) {
      const name = pickAuditActorDisplayName({
        metadataFirstName: (row.first_name as string | null) ?? null,
        metadataLastName: (row.last_name as string | null) ?? null,
        email: (row.account_email as string | null) ?? null,
      });
      if (name) names[row.user_id as string] = name;
    }
  }

  return names;
}

export async function logHireGroupEvent(
  admin: Admin,
  input: {
    hireGroupId: string;
    eventType: HireGroupEventType;
    summary: string;
    actorRole: HireAuditActorRole;
    actorUserId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.from("vehicle_hire_group_events").insert({
    hire_group_id: input.hireGroupId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId ?? null,
    actor_role: input.actorRole,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.error("logHireGroupEvent failed", input.eventType, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function hireAccessApproveConfirmCopy(companyName: string): string {
  return [
    `You are about to approve access for ${companyName}.`,
    "",
    "If you approve, this rental company will be able to access your driver profile to create and manage this hire agreement. That includes your personal information and documents on file (for example licence details and related uploads).",
    "",
    "Only approve if you are happy for them to use this information for this contract.",
  ].join("\n");
}

export function hireAccessRejectConfirmCopy(companyName: string): string {
  return [
    `You are about to reject the hire access request from ${companyName}.`,
    "",
    "If you reject, they will not be able to use your driver profile for this contract and the hire draft will not proceed.",
    "",
    "Only reject if you do not want this rental company to access your profile for this hire.",
  ].join("\n");
}

export function hireCancelConfirmCopy(vehicleVrm?: string | null): string {
  const vehicle = vehicleVrm?.trim() ? ` for ${vehicleVrm.trim()}` : "";
  return [
    `Cancel this hire contract${vehicle}?`,
    "",
    "The vehicle will be released and any open e-sign envelopes will be voided. This cannot be undone.",
  ].join("\n");
}

export function hireRegenerateContractsConfirmCopy(sentToHirer: boolean): string {
  const lines = [
    "Discard the saved signature layout and regenerate all contract PDFs?",
    "",
    "Current e-sign envelopes will be voided and replaced with new ones built from the latest hire data. You will need to configure signature fields again in the e-sign designer.",
  ];
  if (sentToHirer) {
    lines.push("", "Any signing links already emailed to the hirer will stop working.");
  }
  return lines.join("\n");
}

export function hireAmendContractConfirmCopy(): string {
  return [
    "Amend this hire contract?",
    "",
    "You will be able to change vehicle, rental terms, and driver details again.",
    "",
    "Driver profile access for this contract will be withdrawn. You must send a new access request and the driver must approve again before you can continue to review and e-sign.",
  ].join("\n");
}
