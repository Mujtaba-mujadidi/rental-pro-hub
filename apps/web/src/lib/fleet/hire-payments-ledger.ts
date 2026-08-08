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

/** Net cash movement for display — staff ledger vs driver-facing summary. */
export function hireSettlementLedgerNetGbp(
  summary: HireSettlementLedgerSummary,
  audience: "staff" | "driver" = "staff",
): number {
  if (audience === "driver") {
    return roundGbp(summary.totalPaidGbp - summary.totalReceivedGbp);
  }
  return summary.netCashGbp;
}

export function hireSettlementLedgerNetLabel(audience: "staff" | "driver" = "staff"): string {
  return audience === "driver" ? "Net for you" : "Net for this hire";
}

export function hireLedgerPaymentTypeLabel(input: {
  direction: "received_from_driver" | "paid_to_driver";
  paymentCategory?: string | null;
  notes?: string | null;
  audience?: "staff" | "driver";
}): string {
  const audience = input.audience ?? "staff";
  const category = String(input.paymentCategory ?? "settlement").trim();
  if (category === "driver_charge") {
    return input.direction === "received_from_driver" ? "Damage charge" : "Damage refund";
  }
  if (input.notes?.toLowerCase().includes("deposit")) {
    if (audience === "driver") {
      return input.direction === "received_from_driver" ? "Deposit paid" : "Deposit returned to you";
    }
    return input.direction === "received_from_driver" ? "Deposit received" : "Deposit returned";
  }
  if (audience === "driver") {
    return input.direction === "received_from_driver" ? "You paid" : "Paid to you";
  }
  return input.direction === "received_from_driver" ? "Received from driver" : "Paid to driver";
}
