export type HireWorkspaceSettlementBalance = {
  settlementDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  openBalanceGbp: number;
  settled: boolean;
};

type BalancePaymentInput = {
  amountGbp: number;
  direction: "received_from_driver" | "paid_to_driver";
};

/**
 * Open balance for hire workspace UI.
 * `vehicle_hire_groups.settlement_balance_*` is kept current when payments and charges are recorded;
 * balance payment rows are an audit ledger only — do not subtract them again here.
 */
export function computeHireWorkspaceSettlementBalance(input: {
  settlementBalanceDirection: string | null;
  settlementBalanceGbp: number | null;
  balancePayments?: readonly BalancePaymentInput[];
}): HireWorkspaceSettlementBalance | null {
  void input.balancePayments;

  const direction = input.settlementBalanceDirection as
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null;
  if (!direction) return null;

  if (direction === "settled") {
    return {
      settlementDirection: "settled",
      openBalanceGbp: 0,
      settled: true,
    };
  }

  const openBalanceGbp = Math.round(Math.abs(Number(input.settlementBalanceGbp ?? 0)) * 100) / 100;

  return {
    settlementDirection: direction,
    openBalanceGbp,
    settled: openBalanceGbp <= 0.005,
  };
}
