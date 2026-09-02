import { formatGbp } from "@/lib/fleet/maintenance";
import { roundGbp } from "@/lib/fleet/hire-money";

export type HireEndedBalanceCase = "pending_review" | "open_balance" | "settled";

export type HireEndedPendingChargeReview = {
  id: string;
  kind: "damage" | "fuel" | "accessory" | "deposit";
  label: string;
  detail: string | null;
  proposedGbp: number | null;
  evidenceHref: string | null;
};

export type HireEndedPendingReviewsSummary = {
  depositPending: boolean;
  depositHeldGbp: number;
  charges: HireEndedPendingChargeReview[];
};

export type HireEndedBalanceLifecycleStepId =
  | "hire_ended"
  | "checked_in"
  | "final_account"
  | "fully_settled";

export type HireEndedBalanceLifecycleStep = {
  id: HireEndedBalanceLifecycleStepId;
  label: string;
  detail: string;
  status: "done" | "active" | "upcoming";
};

export function countHireEndedPendingReviews(
  summary: HireEndedPendingReviewsSummary | null | undefined,
): number {
  if (!summary) return 0;
  return (summary.depositPending ? 1 : 0) + summary.charges.length;
}

export function resolveHireEndedBalanceCase(input: {
  settled: boolean;
  openBalanceGbp: number;
  pendingReviews: HireEndedPendingReviewsSummary | null | undefined;
}): HireEndedBalanceCase {
  const pendingCount = countHireEndedPendingReviews(input.pendingReviews);
  if (pendingCount > 0) return "pending_review";
  if (input.settled || Math.abs(input.openBalanceGbp) <= 0.005) return "settled";
  return "open_balance";
}

export function buildHireEndedBalanceLifecycle(input: {
  balanceCase: HireEndedBalanceCase;
  openBalanceGbp: number;
  pendingReviewCount: number;
}): HireEndedBalanceLifecycleStep[] {
  const { balanceCase, openBalanceGbp, pendingReviewCount } = input;
  const waitingGbp = formatGbp(Math.max(0, roundGbp(openBalanceGbp)));

  const finalAccountDetail =
    balanceCase === "pending_review"
      ? pendingReviewCount === 1
        ? "Review required"
        : `${pendingReviewCount} reviews required`
      : balanceCase === "open_balance"
        ? "Balance outstanding"
        : "Complete";

  const settledDetail =
    balanceCase === "settled" ? "Nothing owed" : `Waiting for ${waitingGbp}`;

  return [
    {
      id: "hire_ended",
      label: "Hire ended",
      detail: "Rent stopped",
      status: "done",
    },
    {
      id: "checked_in",
      label: "Vehicle checked in",
      detail: "Return recorded",
      status: "done",
    },
    {
      id: "final_account",
      label: "Final account open",
      detail: finalAccountDetail,
      status: balanceCase === "settled" ? "done" : "active",
    },
    {
      id: "fully_settled",
      label: "Fully settled",
      detail: settledDetail,
      status: balanceCase === "settled" ? "done" : "upcoming",
    },
  ];
}

export function hireEndedConfirmedPositionLabel(input: {
  direction: "driver_owes_company" | "company_owes_driver" | "settled" | null | undefined;
  amountGbp: number;
}): string {
  const amount = Math.max(0, roundGbp(input.amountGbp));
  if (input.direction === "settled" || amount <= 0.005) return formatGbp(0);
  if (input.direction === "company_owes_driver") {
    return `Refund due ${formatGbp(amount)}`;
  }
  return `Driver owes ${formatGbp(amount)}`;
}
