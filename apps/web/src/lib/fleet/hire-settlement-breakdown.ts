import type {
  HireTerminationAccountsSummary,
  HireUiAudience,
} from "@/lib/fleet/hire-termination-summary";
import { buildHireAccountPositionFromTerminationSummary } from "@/lib/fleet/hire-account-position";
import { hireDriverChargeTypeLabel } from "@/lib/fleet/hire-driver-charges";
import { roundGbp } from "@/lib/fleet/hire-money";

export type HireSettlementBreakdownSectionId = "rent" | "deposit" | "charges" | "adjustments";

export type HireSettlementBreakdownLine = {
  id?: string;
  label: string;
  amountGbp: number;
  section: HireSettlementBreakdownSectionId;
  /** Positive = increases what the company receives / reduces refund to driver. */
  direction: "neutral" | "driver_pays" | "company_pays";
};

const SECTION_TITLES: Record<HireSettlementBreakdownSectionId, string> = {
  rent: "Rent",
  deposit: "Deposit & closing position",
  charges: "Extra charges",
  adjustments: "Vehicle return charges",
};

export function groupHireSettlementBreakdownLines(
  lines: HireSettlementBreakdownLine[],
): { id: HireSettlementBreakdownSectionId; title: string; lines: HireSettlementBreakdownLine[] }[] {
  const order: HireSettlementBreakdownSectionId[] = ["rent", "deposit", "charges", "adjustments"];
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
  pendingPaymentsGbp?: number;
};

export type HireSettlementExtraChargeInput = {
  id: string;
  chargeType: string;
  chargeTypeLabel?: string;
  description: string | null;
  amountGbp: number;
  resolution: string;
};

export function hireExtraChargeBreakdownLabel(
  item: Pick<HireSettlementExtraChargeInput, "chargeType" | "chargeTypeLabel" | "description">,
): string {
  const type = item.chargeTypeLabel?.trim() || hireDriverChargeTypeLabel(item.chargeType);
  const detail = item.description?.trim();
  if (!detail || detail.toLowerCase() === type.toLowerCase()) return type;
  return `${type} · ${detail}`;
}

function extraChargeBreakdownLines(
  charges: readonly HireSettlementExtraChargeInput[] | undefined,
  section: HireSettlementBreakdownSectionId,
): HireSettlementBreakdownLine[] {
  if (!charges?.length) return [];
  const lines: HireSettlementBreakdownLine[] = [];
  for (const item of charges) {
    if (item.resolution === "waived" || item.resolution === "voided") continue;
    const amountGbp = roundGbp(item.amountGbp);
    if (amountGbp <= 0.005) continue;
    lines.push({
      id: `charge:${item.id}`,
      label: hireExtraChargeBreakdownLabel(item),
      amountGbp,
      section,
      direction: "driver_pays",
    });
  }
  return lines;
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
  extraCharges?: readonly HireSettlementExtraChargeInput[];
  settlementPaymentsToDriverGbp?: number;
  settlementPaymentsFromDriverGbp?: number;
  depositDisposition?: string | null;
  depositReceivedGbp?: number;
  audience?: HireUiAudience;
}): HireSettlementBreakdown | null {
  const audience = input.audience ?? "staff";
  const summary = input.terminationSummary;
  if (!summary) return null;

  const account = buildHireAccountPositionFromTerminationSummary(summary, {
    depositDisposition: input.depositDisposition ?? "hold_pending",
    depositReceivedGbp: input.depositReceivedGbp ?? 0,
    lifecycle: "ended",
  });

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

  if (account.depositAppliedToRentGbp > 0.005) {
    lines.push({
      label: "Deposit used to pay rent",
      amountGbp: account.depositAppliedToRentGbp,
      section: "rent",
      direction: "company_pays",
    });
  }

  if (account.refundCalculatedGbp > 0.005) {
    lines.push({
      label:
        audience === "driver"
          ? "Deposit refund due to you at contract end"
          : "Deposit refund due at contract end",
      amountGbp: account.refundCalculatedGbp,
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

  const extraChargeLines = extraChargeBreakdownLines(input.extraCharges, "charges");
  if (extraChargeLines.length) {
    lines.push(...extraChargeLines);
  } else {
    const driverChargesGbp = roundGbp(input.driverChargesGbp ?? 0);
    if (driverChargesGbp > 0.005) {
      lines.push({
        label: audience === "driver" ? "Charges (e.g. damage)" : "Driver charges (e.g. damage)",
        amountGbp: driverChargesGbp,
        section: "adjustments",
        direction: "driver_pays",
      });
    }
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

/**
 * Active hire balance sheet: rent to date, extra charges and money already received.
 * Pending submissions are listed for visibility and do not change `openBalanceGbp`.
 */
export function buildActiveHireSettlementBreakdown(input: {
  rentDueGbp: number;
  rentDiscountGbp: number;
  rentPaidGbp: number;
  extraChargesGbp: number;
  extraCharges?: readonly HireSettlementExtraChargeInput[];
  extraChargesPaidGbp: number;
  openBalanceGbp: number;
  openDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  pendingPaymentsGbp?: number;
}): HireSettlementBreakdown {
  const rentDueGbp = roundGbp(Math.max(0, input.rentDueGbp));
  const rentDiscountGbp = roundGbp(Math.max(0, input.rentDiscountGbp));
  const rentPaidGbp = roundGbp(Math.max(0, input.rentPaidGbp));
  const extraChargesGbp = roundGbp(Math.max(0, input.extraChargesGbp));
  const extraChargesPaidGbp = roundGbp(Math.max(0, input.extraChargesPaidGbp));
  const pendingPaymentsGbp = roundGbp(Math.max(0, input.pendingPaymentsGbp ?? 0));

  const lines: HireSettlementBreakdownLine[] = [];
  lines.push({
    label: "Rent due to date",
    amountGbp: rentDueGbp,
    section: "rent",
    direction: "driver_pays",
  });
  if (rentDiscountGbp > 0.005) {
    lines.push({
      label: "Discount applied",
      amountGbp: rentDiscountGbp,
      section: "rent",
      direction: "company_pays",
    });
  }
  if (rentPaidGbp > 0.005) {
    lines.push({
      label: "Rent paid",
      amountGbp: rentPaidGbp,
      section: "rent",
      direction: "company_pays",
    });
  }

  const extraChargeLines = extraChargeBreakdownLines(input.extraCharges, "charges");
  if (extraChargeLines.length) {
    lines.push(...extraChargeLines);
  } else if (extraChargesGbp > 0.005) {
    lines.push({
      label: "Extra charges",
      amountGbp: extraChargesGbp,
      section: "charges",
      direction: "driver_pays",
    });
  }
  if (extraChargesPaidGbp > 0.005) {
    lines.push({
      id: "extra-charges-paid",
      label: "Extra charges paid",
      amountGbp: extraChargesPaidGbp,
      section: "charges",
      direction: "company_pays",
    });
  }

  return {
    lines,
    openBalanceGbp: roundGbp(input.openBalanceGbp),
    openDirection: input.openDirection,
    pendingPaymentsGbp: pendingPaymentsGbp > 0.005 ? pendingPaymentsGbp : 0,
  };
}
