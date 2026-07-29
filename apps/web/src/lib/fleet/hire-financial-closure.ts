import type { HireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import { isDepositDispositionPending } from "@/lib/fleet/hire-deposit-resolution";

export type HireFinancialClosureState = {
  rentSettlementSettled: boolean;
  depositPendingReview: boolean;
  depositGbp: number;
  financiallyClosed: boolean;
};

export function isRentSettlementSettled(
  settlementBalance: Pick<HireWorkspaceSettlementBalance, "settled"> | null | undefined,
): boolean {
  return settlementBalance?.settled === true;
}

export function summarizeHireFinancialClosure(input: {
  settlementBalance: Pick<HireWorkspaceSettlementBalance, "settled"> | null | undefined;
  depositDisposition: string | null | undefined;
  depositGbp: number | null | undefined;
}): HireFinancialClosureState {
  const depositPendingReview = isDepositDispositionPending(input.depositDisposition);
  const depositGbp =
    depositPendingReview && input.depositGbp != null && Number.isFinite(input.depositGbp)
      ? Math.round(input.depositGbp * 100) / 100
      : 0;
  const rentSettlementSettled = isRentSettlementSettled(input.settlementBalance);

  return {
    rentSettlementSettled,
    depositPendingReview,
    depositGbp,
    financiallyClosed: rentSettlementSettled && !depositPendingReview,
  };
}

export function hireRentSettlementStatusLabel(
  closure: Pick<HireFinancialClosureState, "rentSettlementSettled">,
  audience: "staff" | "driver" = "staff",
): string {
  if (closure.rentSettlementSettled) {
    return audience === "driver" ? "Final balance cleared" : "Final balance cleared";
  }
  return audience === "driver" ? "Final balance still owed" : "Final balance still owed";
}

export function hireDepositStatusLabel(input: {
  depositPendingReview: boolean;
  depositGbp: number;
  depositDispositionLabel: string | null;
  scheduleDepositPaidLabel: string;
}): string {
  if (input.depositPendingReview && input.depositGbp > 0.005) {
    return `Pending review — ${formatDepositGbp(input.depositGbp)} held`;
  }
  if (input.depositDispositionLabel) return input.depositDispositionLabel;
  return input.scheduleDepositPaidLabel;
}

function formatDepositGbp(amountGbp: number): string {
  return `£${amountGbp.toFixed(2)}`;
}
