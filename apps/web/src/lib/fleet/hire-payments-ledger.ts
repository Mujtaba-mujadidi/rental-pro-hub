export type HireLedgerPaymentInput = {
  amountGbp: number;
  direction: "received_from_driver" | "paid_to_driver";
  paymentCategory?: string | null;
};

export type HireSettlementLedgerSummary = {
  settlementReceivedGbp: number;
  settlementPaidGbp: number;
  driverChargeReceivedGbp: number;
  totalReceivedGbp: number;
  totalPaidGbp: number;
  netCashGbp: number;
};

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Summarise post–contract-end balance ledger payments for display. */
export function summarizeHireSettlementLedger(
  payments: readonly HireLedgerPaymentInput[],
): HireSettlementLedgerSummary {
  let settlementReceivedGbp = 0;
  let settlementPaidGbp = 0;
  let driverChargeReceivedGbp = 0;

  for (const payment of payments) {
    const amount = Number(payment.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const category = String(payment.paymentCategory ?? "settlement").trim();
    if (payment.direction === "received_from_driver") {
      if (category === "driver_charge") {
        driverChargeReceivedGbp += amount;
      } else {
        settlementReceivedGbp += amount;
      }
    } else {
      settlementPaidGbp += amount;
    }
  }

  settlementReceivedGbp = roundGbp(settlementReceivedGbp);
  settlementPaidGbp = roundGbp(settlementPaidGbp);
  driverChargeReceivedGbp = roundGbp(driverChargeReceivedGbp);
  const totalReceivedGbp = roundGbp(settlementReceivedGbp + driverChargeReceivedGbp);

  return {
    settlementReceivedGbp,
    settlementPaidGbp,
    driverChargeReceivedGbp,
    totalReceivedGbp,
    totalPaidGbp: settlementPaidGbp,
    netCashGbp: roundGbp(totalReceivedGbp - settlementPaidGbp),
  };
}

export function hireLedgerPaymentTypeLabel(input: {
  direction: "received_from_driver" | "paid_to_driver";
  paymentCategory?: string | null;
  notes?: string | null;
}): string {
  const category = String(input.paymentCategory ?? "settlement").trim();
  if (category === "driver_charge") {
    return input.direction === "received_from_driver" ? "Damage charge" : "Damage refund";
  }
  if (input.notes?.toLowerCase().includes("deposit")) {
    return input.direction === "received_from_driver" ? "Deposit received" : "Deposit returned";
  }
  return input.direction === "received_from_driver" ? "Received from driver" : "Paid to driver";
}
