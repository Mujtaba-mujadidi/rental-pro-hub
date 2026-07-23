import type { HirePaymentStatus } from "@/lib/fleet/hire-types";

export type PaymentTransitionActor = "company_staff" | "driver";

export type PaymentTransitionInput = {
  from: HirePaymentStatus;
  to: HirePaymentStatus;
  actor: PaymentTransitionActor;
  comment?: string | null;
};

export function canTransitionPaymentStatus(input: PaymentTransitionInput): boolean {
  const { from, to, actor, comment } = input;

  if (actor === "driver") {
    if (from === to) return false;
    if (from === "not_received" && to === "pending_approval") return true;
    if (from === "rejected" && to === "pending_approval") return true;
    if (from === "approved" && to === "pending_approval") return true;
    return false;
  }

  // company_staff
  if (from === "approved" && to === "approved") {
    return Boolean(comment?.trim());
  }
  if (from === to) return false;

  if (from === "pending_approval" && to === "approved") return true;
  if (from === "pending_approval" && to === "rejected") {
    return Boolean(comment?.trim());
  }
  if (from === "not_received" && to === "approved") return true;
  return false;
}

export function requiresAmendmentReason(from: HirePaymentStatus, to: HirePaymentStatus): boolean {
  return from === "approved" && to === "approved";
}

/** Merge DB status with the latest status-change event when the row is out of sync. */
export function resolveHirePaymentWorkflowStatus(
  storedStatus: HirePaymentStatus,
  latestStatusChangeTo: string | null | undefined,
): HirePaymentStatus {
  if (storedStatus === "approved") return "approved";
  if (latestStatusChangeTo === "rejected") return "rejected";
  if (latestStatusChangeTo === "pending_approval") return "pending_approval";
  if (latestStatusChangeTo === "approved") return "approved";
  return storedStatus;
}

export function driverCanSubmitPayment(workflowStatus: HirePaymentStatus): boolean {
  return (
    workflowStatus === "not_received" ||
    workflowStatus === "rejected" ||
    workflowStatus === "approved"
  );
}
