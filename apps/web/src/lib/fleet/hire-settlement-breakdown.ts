import type {
  HireTerminationAccountsSummary,
  HireUiAudience,
} from "@/lib/fleet/hire-termination-summary";

export type HireSettlementBreakdownSectionId = "rent" | "deposit" | "adjustments";

export type HireSettlementBreakdownLine = {
  label: string;
  amountGbp: number;
  section: HireSettlementBreakdownSectionId;
  /** Positive = increases what the company receives / reduces refund to driver. */
  direction: "neutral" | "driver_pays" | "company_pays";
};

const SECTION_TITLES: Record<HireSettlementBreakdownSectionId, string> = {
  rent: "Rent",
  deposit: "Deposit & closing position",
  adjustments: "Since contract end",
};

export function groupHireSettlementBreakdownLines(
  lines: HireSettlementBreakdownLine[],
): { id: HireSettlementBreakdownSectionId; title: string; lines: HireSettlementBreakdownLine[] }[] {
  const order: HireSettlementBreakdownSectionId[] = ["rent", "deposit", "adjustments"];
  return order
    .map((id) => ({
      id,
      title: SECTION_TITLES[id],
      lines: lines.filter((line) => line.section === id),
    }))
    .filter((section) => section.lines.length > 0);
}

export type HireSettlementBreakdown = {
  lines: HireSettlementBreakdownLine[];
  openBalanceGbp: number;
  openDirection: "driver_owes_company" | "company_owes_driver" | "settled";
};

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Human-readable settlement ledger for staff UI.
 * `openBalanceGbp` is the current amount on the hire group (already net of recorded payments).
 */
export function buildHireSettlementBreakdown(input: {
  terminationSummary: HireTerminationAccountsSummary | null;
  openBalanceGbp: number;
  openDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  driverChargesGbp?: number;
  settlementPaymentsToDriverGbp?: number;
  settlementPaymentsFromDriverGbp?: number;
  audience?: HireUiAudience;
}): HireSettlementBreakdown | null {
  const audience = input.audience ?? "staff";
  const summary = input.terminationSummary;
  if (!summary) return null;

  const lines: HireSettlementBreakdownLine[] = [];
  lines.push({
    label: "Rent due for time on hire",
    amountGbp: summary.accruedRentDueGbp,
    section: "rent",
    direction: "driver_pays",
  });

  if (summary.accruedRentPaidGbp > 0.005) {
    lines.push({
      label: "Rent paid on schedule",
      amountGbp: summary.accruedRentPaidGbp,
      section: "rent",
      direction: "company_pays",
    });
  }

  const depositAppliedGbp = roundGbp(
    Math.max(0, summary.depositGbp - Math.max(0, -summary.netSettlementGbp)),
  );
  if (summary.depositGbp > 0.005 && depositAppliedGbp > 0.005) {
    lines.push({
      label: "Deposit used to pay rent",
      amountGbp: depositAppliedGbp,
      section: "rent",
      direction: "company_pays",
    });
  }

  const depositRefundDueGbp = roundGbp(Math.max(0, -summary.netSettlementGbp));
  if (depositRefundDueGbp > 0.005) {
    lines.push({
      label:
        audience === "driver"
          ? "Deposit refund due to you at contract end"
          : "Deposit refund due at contract end",
      amountGbp: depositRefundDueGbp,
      section: "deposit",
      direction: "company_pays",
    });
  } else if (summary.netSettlementGbp > 0.005) {
    lines.push({
      label:
        audience === "driver"
          ? "You owed at contract end"
          : "Amount driver owed at contract end",
      amountGbp: summary.netSettlementGbp,
      section: "deposit",
      direction: "driver_pays",
    });
  }

  const driverChargesGbp = roundGbp(input.driverChargesGbp ?? 0);
  if (driverChargesGbp > 0.005) {
    lines.push({
      label: audience === "driver" ? "Charges (e.g. damage)" : "Driver charges (e.g. damage)",
      amountGbp: driverChargesGbp,
      section: "adjustments",
      direction: "driver_pays",
    });
  }

  const paidToDriverGbp = roundGbp(input.settlementPaymentsToDriverGbp ?? 0);
  if (paidToDriverGbp > 0.005) {
    lines.push({
      label: audience === "driver" ? "Payments to you" : "Settlement payments to driver",
      amountGbp: paidToDriverGbp,
      section: "adjustments",
      direction: "company_pays",
    });
  }

  const fromDriverGbp = roundGbp(input.settlementPaymentsFromDriverGbp ?? 0);
  if (fromDriverGbp > 0.005) {
    lines.push({
      label: audience === "driver" ? "Payments from you" : "Settlement payments from driver",
      amountGbp: fromDriverGbp,
      section: "adjustments",
      direction: "driver_pays",
    });
  }

  return {
    lines,
    openBalanceGbp: roundGbp(input.openBalanceGbp),
    openDirection: input.openDirection,
  };
}
