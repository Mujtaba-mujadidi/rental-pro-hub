import {
  openBalanceDirection,
  remainingOpenBalanceGbp,
  signedSettlementBalanceGbp,
} from "@/lib/fleet/hire-open-balance";

export type HireWorkspaceSettlementBalance = {
  settlementDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  openBalanceGbp: number;
  settled: boolean;
};

type BalancePaymentInput = {
  amountGbp: number;
  direction: "received_from_driver" | "paid_to_driver";
};

export function computeHireWorkspaceSettlementBalance(input: {
  settlementBalanceDirection: string | null;
  settlementBalanceGbp: number | null;
  balancePayments: readonly BalancePaymentInput[];
}): HireWorkspaceSettlementBalance | null {
  const direction = input.settlementBalanceDirection as
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null;
  if (!direction) return null;

  // Once marked settled in the DB, payments are historical — do not re-apply them on top of zero.
  if (direction === "settled") {
    return {
      settlementDirection: "settled",
      openBalanceGbp: 0,
      settled: true,
    };
  }

  const signed = signedSettlementBalanceGbp(direction, Number(input.settlementBalanceGbp ?? 0));
  const paymentDirection =
    direction === "driver_owes_company" ? "received_from_driver" : "paid_to_driver";
  const remaining = remainingOpenBalanceGbp(
    signed,
    input.balancePayments.map((payment) => ({
      amountGbp: payment.amountGbp,
      direction: payment.direction ?? paymentDirection,
    })),
  );
  const openDirection = openBalanceDirection(remaining);

  return {
    settlementDirection: openDirection,
    openBalanceGbp: Math.abs(remaining),
    settled: openDirection === "settled",
  };
}
