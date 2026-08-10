/** Lifecycle attention flags for hire checkout, termination, and check-in. */

export type HireLifecycleAttentionKind =
  | "awaiting_checkout"
  | "awaiting_termination"
  | "awaiting_checkin"
  | "awaiting_deposit_resolution"
  | "awaiting_insurance_upload"
  | "insurance_expiring"
  | "insurance_expired"
  | "documents_expiring_during_hire";

export type HireLifecycleAttentionItem = {
  kind: HireLifecycleAttentionKind;
  title: string;
  detail: string;
  href: string;
};

export function isCheckoutDue(input: {
  status: string;
  checkoutCompleted: boolean;
}): boolean {
  return (
    !input.checkoutCompleted &&
    (input.status === "reserved" ||
      input.status === "active" ||
      input.status === "terminated")
  );
}

export function canStartCheckout(input: {
  status: string;
  checkoutCompleted: boolean;
}): boolean {
  return isCheckoutDue(input);
}

export function canTerminateHire(status: string): boolean {
  return status === "active";
}

export function canStartCheckin(input: {
  status: string;
  checkoutCompleted: boolean;
  checkinCompleted: boolean;
}): boolean {
  return input.status === "terminated" && input.checkoutCompleted && !input.checkinCompleted;
}

export function isCheckinDue(input: {
  status: string;
  checkoutCompleted: boolean;
  checkinCompleted: boolean;
}): boolean {
  return canStartCheckin(input);
}

export function lifecycleAttentionLabel(kind: HireLifecycleAttentionKind): string {
  if (kind === "awaiting_checkout") return "Awaiting checkout";
  if (kind === "awaiting_termination") return "End contract";
  if (kind === "awaiting_deposit_resolution") return "Resolve deposit";
  if (kind === "awaiting_insurance_upload") return "Hire insurance";
  if (kind === "insurance_expiring") return "Insurance expiring";
  if (kind === "insurance_expired") return "Insurance expired";
  if (kind === "documents_expiring_during_hire") return "Documents expiring";
  return "Awaiting check-in";
}

export function buildHireLifecycleAttentionItems(input: {
  hireGroupId: string;
  status: string;
  checkoutCompleted: boolean;
  checkinCompleted: boolean;
  audience?: "staff" | "driver";
  depositPendingReview?: boolean;
  depositGbp?: number | null;
}): HireLifecycleAttentionItem[] {
  const base =
    input.audience === "driver"
      ? `/driver/hires/${input.hireGroupId}`
      : `/rental/hires/${input.hireGroupId}`;
  const items: HireLifecycleAttentionItem[] = [];

  if (isCheckoutDue(input)) {
    items.push({
      kind: "awaiting_checkout",
      title: "Vehicle checkout required",
      detail:
        input.status === "terminated"
          ? "The contract has ended but checkout was not recorded. Complete checkout before check-in."
          : input.status === "active"
            ? "This hire is on rent but checkout was not completed. Record vehicle condition before continuing."
            : "All agreements are signed. Complete checkout before the hire becomes active.",
      href: `${base}/checkout`,
    });
  }

  // Staff-only reminder — drivers cannot end the contract themselves.
  if (input.audience !== "driver" && canTerminateHire(input.status)) {
    items.push({
      kind: "awaiting_termination",
      title: "Hire is active",
      detail: "End the contract when the rental period finishes to settle accounts and unlock check-in.",
      href: base,
    });
  }

  if (isCheckinDue(input)) {
    items.push({
      kind: "awaiting_checkin",
      title: input.audience === "driver" ? "Check-in is now available" : "Vehicle check-in required",
      detail:
        input.audience === "driver"
          ? "Your contract has ended. Complete check-in when you return the vehicle."
          : "The contract has ended. Complete check-in when the vehicle is returned.",
      href: `${base}/checkin`,
    });
  }

  if (
    input.audience !== "driver" &&
    input.depositPendingReview &&
    (input.depositGbp ?? 0) > 0.005
  ) {
    items.push({
      kind: "awaiting_deposit_resolution",
      title: "Deposit decision required",
      detail: `The final balance may be cleared, but £${(input.depositGbp ?? 0).toFixed(2)} deposit is still held — decide what to do with it.`,
      href: `${base}/payments`,
    });
  }

  return items;
}
