import { formatUkDate, formatUkDateRange, formatUkDateText, formatUkDateTime, formatUkTime } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";
import { hireDriverChargeTypeLabel } from "@/lib/fleet/hire-driver-charges";
import { hirePaymentMethodLabel } from "@/lib/fleet/hire-settlement-payment-method";
import type { HireSettlementLedgerRow, HireSettlementStatementKpis } from "@/lib/fleet/hire-settlement-statement";

export function compactHireBalanceVrm(vrm: string | null | undefined): string {
  const compact = (vrm ?? "").replace(/\s+/g, "").toUpperCase();
  return compact || "HIRE";
}

export function hireBalanceReference(vrm: string | null | undefined, at: string | null | undefined): string {
  const yearMatch = /^(\d{4})/.exec((at ?? "").trim());
  const yy = yearMatch ? yearMatch[1].slice(-2) : "00";
  return `BAL-${compactHireBalanceVrm(vrm)}-${yy}`;
}

export function hireBalanceStatusLabel(settled: boolean): "Closed" | "Open balance" {
  return settled ? "Closed" : "Open balance";
}

export function hireBalancePeriodLine(input: {
  vehicleVrm: string | null;
  ended: boolean;
  startedAt: string | null;
  terminatedAt: string | null;
  driverLabel?: string | null;
}): string {
  const vrm = input.vehicleVrm?.trim() || "Hire";
  const who = input.driverLabel?.trim() || (input.ended ? "Previous driver" : "Active driver");
  const startYmd = input.startedAt?.slice(0, 10) || null;
  const endYmd = input.terminatedAt?.slice(0, 10) || null;
  const period = input.ended
    ? startYmd && endYmd
      ? formatUkDateRange(startYmd, endYmd)
      : input.terminatedAt
        ? `Ended ${formatUkDateTime(input.terminatedAt)}`
        : "Ended"
    : startYmd
      ? `${formatUkDate(startYmd)} — ongoing`
      : "Ongoing";
  return `${vrm} · ${who} · ${period}`;
}

export function hireBalanceCompanyLine(companyName: string | null | undefined, ended: boolean): string | null {
  const name = companyName?.trim();
  if (!name) return null;
  return ended ? `This hire was with ${name}` : name;
}

export function hireSettlementChargeActivityTitle(chargeType: string): string {
  if (chargeType === "rent") return "Hire rent";
  if (chargeType === "deposit") return "Deposit charge";
  const label = hireDriverChargeTypeLabel(chargeType);
  if (label === "Damage" || label === "Administration") return `${label} charge`;
  if (label === "Other") return "Other charge";
  return label;
}

export function hireSettlementPaymentActivityTitle(paymentMethod: string | null | undefined): string {
  const method = paymentMethod?.trim();
  if (!method) return "Payment";
  return hirePaymentMethodLabel(method);
}

export function hireSettlementPaymentActivityDetail(input: {
  notes?: string | null;
  paymentReference?: string | null;
  paymentCategory?: string | null;
  paymentMethod?: string | null;
}): string | null {
  const parts: string[] = [];
  const method = input.paymentMethod?.trim();
  if (method) parts.push(hirePaymentMethodLabel(method));
  if (input.paymentCategory === "driver_charge") parts.push("Extra charge");
  if (input.paymentCategory === "rent") parts.push("Hire rent");
  const reference = input.paymentReference?.trim();
  if (reference) parts.push(reference);
  const notes = input.notes?.trim();
  if (notes) parts.push(notes);
  return parts.length ? parts.join(" · ") : null;
}

export function hireSettlementOpeningDetail(summary: {
  accruedRentDueGbp: number;
  accruedRentPaidGbp: number;
  depositGbp: number;
} | null | undefined): string | null {
  if (!summary) return null;
  const parts = [
    `Rent due ${formatGbp(summary.accruedRentDueGbp)}`,
    `Rent paid ${formatGbp(summary.accruedRentPaidGbp)}`,
  ];
  if (summary.depositGbp > 0.005) parts.push(`Deposit ${formatGbp(summary.depositGbp)}`);
  return parts.join(" · ");
}

export function newestFirstHireSettlementRows(
  rows: readonly HireSettlementLedgerRow[],
): HireSettlementLedgerRow[] {
  return [...rows].reverse();
}

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Visible statement rows in date order (oldest first) with a running balance
 * that matches only the lines on screen.
 * Charges add what the driver owes; payments reduce it.
 */
export function hireStatementLedgerRowsForDisplay(
  rows: readonly HireSettlementLedgerRow[],
  filter: "all" | "charges" | "payments",
): HireSettlementLedgerRow[] {
  const visible =
    filter === "all"
      ? [...rows]
      : rows.filter((row) => (filter === "charges" ? row.kind === "charge" : row.kind === "payment"));
  let running = 0;
  return visible.map((row) => {
    running = roundGbp(running + row.signedAmountGbp);
    return { ...row, runningBalanceGbp: running };
  });
}

export function formatHireSettlementLedgerDate(row: HireSettlementLedgerRow): string {
  const at = row.occurredAt?.trim() || row.dateYmd;
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) return formatUkDateText(at);
  const date = formatUkDateText(at).replace(/ \d{4}$/, "");
  const time = formatUkTime(at);
  if (time === "—") return date;
  return `${date}, ${time}`;
}

export function formatHireSettlementSignedAmount(signedAmountGbp: number): string {
  const amount = formatGbp(Math.abs(signedAmountGbp));
  if (signedAmountGbp < -0.005) return `−${amount}`;
  if (signedAmountGbp > 0.005) return `+${amount}`;
  return amount;
}

export function hireSettlementKpiHints(kpis: HireSettlementStatementKpis): {
  totalCharges: string;
  approvedPayments: string;
  refundsToDriver: string;
  pendingPayments: string;
  currentBalance: string;
} {
  return {
    totalCharges: "Rent, fees and adjustments the driver was charged",
    approvedPayments: "Money received from the driver",
    refundsToDriver: "Money paid back to the driver",
    pendingPayments:
      kpis.pendingPaymentsGbp > 0.005 ? "Awaiting approval" : "Nothing awaiting review",
    currentBalance:
      kpis.currentDirection === "company_owes_driver"
        ? "Company still owes the driver"
        : kpis.currentDirection === "driver_owes_company"
          ? "Driver still owes the company"
          : "Nothing remaining",
  };
}

export function hireBalanceHeroSubtext(input: {
  settled: boolean;
  approvedPaymentsGbp: number;
  refundsToDriverGbp?: number;
  settlementDirection: "driver_owes_company" | "company_owes_driver" | "settled";
}): string {
  const refunds = input.refundsToDriverGbp ?? 0;
  if (input.settled) {
    if (refunds > 0.005 && refunds >= input.approvedPaymentsGbp) {
      return `Closed after ${formatGbp(refunds)} refunded to the driver`;
    }
    if (input.approvedPaymentsGbp > 0.005) {
      return `Closed after ${formatGbp(input.approvedPaymentsGbp)} received from the driver`;
    }
    return "Nothing remaining on this hire";
  }
  if (input.settlementDirection === "company_owes_driver") {
    return "Due back to the driver for this hire";
  }
  return "Due from the driver for this hire";
}

export function hireBalanceAccountStatementFileName(input: {
  vehicleVrm: string | null;
  balanceReference: string;
}): string {
  const vrm = compactHireBalanceVrm(input.vehicleVrm);
  const ref = input.balanceReference.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "statement";
  return `account-statement-${vrm}-${ref}.pdf`;
}

export function buildHireBalanceAccountStatementContent(input: {
  vehicleVrm: string | null;
  driverLabel: string | null;
  balanceReference: string;
  currentBalanceGbp: number;
  rows: readonly HireSettlementLedgerRow[];
}): {
  fileName: string;
  sections: Array<{ heading: string; lines: string[] }>;
} {
  const lines =
    input.rows.length === 0
      ? ["No posted items yet."]
      : input.rows.map((row) => {
          const detail = row.activityDetail ? ` · ${row.activityDetail}` : "";
          return `${formatHireSettlementLedgerDate(row)} · ${row.activityTitle}${detail} · ${formatHireSettlementSignedAmount(row.signedAmountGbp)} · Balance after ${formatGbp(row.runningBalanceGbp)}`;
        });
  return {
    fileName: hireBalanceAccountStatementFileName(input),
    sections: [
      {
        heading: "Current position",
        lines: [
          `Reference: ${input.balanceReference}`,
          ...(input.vehicleVrm ? [`Vehicle: ${input.vehicleVrm}`] : []),
          ...(input.driverLabel ? [`Driver: ${input.driverLabel}`] : []),
          `Current balance: ${formatGbp(Math.max(0, input.currentBalanceGbp))}`,
        ],
      },
      {
        heading: "Charges & payments",
        lines,
      },
    ],
  };
}
