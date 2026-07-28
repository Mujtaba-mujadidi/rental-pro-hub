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

export type HirePaymentWorkflowContext = {
  periodStartYmd?: string;
  todayYmd?: string;
};

function isFutureHirePaymentPeriod(periodStartYmd: string | undefined, todayYmd: string | undefined): boolean {
  return Boolean(periodStartYmd && todayYmd && periodStartYmd > todayYmd);
}

/** Rejected early submissions stay in the event log until the rent period starts. */
function workflowRejectedForPeriod(
  storedStatus: HirePaymentStatus,
  context?: HirePaymentWorkflowContext,
): HirePaymentStatus {
  if (!isFutureHirePaymentPeriod(context?.periodStartYmd, context?.todayYmd)) return "rejected";
  return storedStatus === "approved" ? "approved" : "not_received";
}

/** Merge DB status with the latest status-change event when the row is out of sync. */
export function resolveHirePaymentWorkflowStatus(
  storedStatus: HirePaymentStatus,
  latestStatusChangeTo: string | null | undefined,
  context?: HirePaymentWorkflowContext,
): HirePaymentStatus {
  if (storedStatus === "approved") return "approved";
  if (latestStatusChangeTo === "rejected") return workflowRejectedForPeriod(storedStatus, context);
  if (latestStatusChangeTo === "pending_approval") return "pending_approval";
  if (latestStatusChangeTo === "approved") return "approved";
  if (storedStatus === "rejected") return workflowRejectedForPeriod(storedStatus, context);
  return storedStatus;
}

export function driverCanSubmitPayment(workflowStatus: HirePaymentStatus): boolean {
  return (
    workflowStatus === "not_received" ||
    workflowStatus === "rejected" ||
    workflowStatus === "approved"
  );
}

export type PaymentRowEventState = {
  latestToStatus: string | null;
  pendingSubmittedGbp: number | null;
};

/** Latest status-change event per schedule row (events newest-first). */
export function buildPaymentRowEventStateMap(
  events: readonly {
    schedule_row_id: string;
    to_status: string | null;
    amendment_payload: unknown;
  }[],
): Map<string, PaymentRowEventState> {
  const map = new Map<string, PaymentRowEventState>();
  const seen = new Set<string>();

  for (const event of events) {
    const rowId = event.schedule_row_id;
    if (seen.has(rowId)) continue;
    seen.add(rowId);

    const toStatus = event.to_status ?? null;
    let pendingSubmittedGbp: number | null = null;
    if (toStatus === "pending_approval") {
      const payload = (event.amendment_payload ?? {}) as { submittedAmountGbp?: number };
      const amount = Number(payload.submittedAmountGbp);
      if (Number.isFinite(amount) && amount > 0) pendingSubmittedGbp = amount;
    }

    map.set(rowId, { latestToStatus: toStatus, pendingSubmittedGbp });
  }

  return map;
}
