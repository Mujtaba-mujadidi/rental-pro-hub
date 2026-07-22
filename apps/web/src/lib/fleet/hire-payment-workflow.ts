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
  if (from === to) return false;

  if (actor === "driver") {
    if (from === "not_received" && to === "pending_approval") return true;
    if (from === "rejected" && to === "pending_approval") return true;
    return false;
  }

  // company_staff
  if (from === "pending_approval" && to === "approved") return true;
  if (from === "pending_approval" && to === "rejected") {
    return Boolean(comment?.trim());
  }
  if (from === "approved" && to === "approved") {
    return Boolean(comment?.trim());
  }
  if (from === "not_received" && to === "approved") return true;
  return false;
}

export function requiresAmendmentReason(from: HirePaymentStatus, to: HirePaymentStatus): boolean {
  return from === "approved" && to === "approved";
}
