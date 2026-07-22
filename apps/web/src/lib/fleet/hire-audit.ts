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
] as const;

export type HireGroupEventType = (typeof HIRE_GROUP_EVENT_TYPES)[number];
export type HireAuditActorRole = "company_staff" | "driver" | "system";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type HireGroupAuditRow = {
  id: string;
  event_type: HireGroupEventType;
  actor_user_id: string | null;
  actor_role: HireAuditActorRole;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

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
): Promise<void> {
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
  }
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
  return `Reject the hire access request from ${companyName}? They will not be able to use your driver profile for this contract.`;
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
