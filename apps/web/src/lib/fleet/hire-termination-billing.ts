import { calendarDaysInclusive } from "@/lib/fleet/hire-payment-analytics";
import type { HirePaymentRowComputed } from "@/lib/fleet/hire-payment-summary";
import type { RentCadence } from "@/lib/fleet/hire-types";

export const HIRE_TERMINATION_RENT_BILLING_MODES = ["actual", "end_of_period"] as const;

export type HireTerminationRentBillingMode = (typeof HIRE_TERMINATION_RENT_BILLING_MODES)[number];

export type HireTerminationBillingPeriodBreakdown = {
  periodStart: string;
  periodEnd: string;
  daysUsed: number;
  daysInPeriod: number;
  actualDueGbp: number;
  endOfPeriodDueGbp: number;
};

function roundGbp(value: number): number {
  return Math.round(value * 100) / 100;
}

export function supportsEndOfPeriodBilling(cadence: RentCadence): boolean {
  return cadence === "weekly" || cadence === "monthly";
}

export function hireTerminationRentBillingLabel(
  mode: HireTerminationRentBillingMode,
  cadence: RentCadence,
): string {
  if (mode === "actual") return "Charge for actual days (pro-rata current period)";
  if (cadence === "weekly") return "Charge until end of week";
  if (cadence === "monthly") return "Charge until end of month";
  return "Charge until end of period";
}

export function hireTerminationRentBillingDetail(
  mode: HireTerminationRentBillingMode,
  cadence: RentCadence,
  breakdown: HireTerminationBillingPeriodBreakdown | null,
): string | null {
  if (!breakdown || !supportsEndOfPeriodBilling(cadence)) return null;
  const { daysUsed, daysInPeriod, actualDueGbp, endOfPeriodDueGbp } = breakdown;
  if (mode === "actual") {
    return `${daysUsed} of ${daysInPeriod} days in this billing period · £${actualDueGbp.toFixed(2)} (pro-rata)`;
  }
  return `Full ${cadence === "weekly" ? "week" : "month"} (${daysInPeriod} days) · £${endOfPeriodDueGbp.toFixed(2)} instead of £${actualDueGbp.toFixed(2)} pro-rata`;
}

export function findRentPeriodAtTermination(
  rows: HirePaymentRowComputed[],
  terminatedYmd: string,
): HirePaymentRowComputed | null {
  for (const row of rows) {
    if (row.rowKind !== "rent") continue;
    if (row.periodStart <= terminatedYmd && terminatedYmd <= row.periodEnd) {
      return row;
    }
  }
  return null;
}

export function isPartialRentPeriodAtTermination(
  row: HirePaymentRowComputed,
  terminatedYmd: string,
): boolean {
  return row.periodStart <= terminatedYmd && terminatedYmd < row.periodEnd;
}

/** Rent due for one schedule row at termination, respecting billing mode. */
export function terminationRentDueForRow(
  row: HirePaymentRowComputed,
  terminatedYmd: string,
  billingMode: HireTerminationRentBillingMode,
  cadence: RentCadence,
): number {
  if (row.rowKind !== "rent") return 0;
  if (terminatedYmd < row.periodStart) return 0;
  if (terminatedYmd > row.periodEnd) return row.netDueGbp;

  if (cadence === "daily" || billingMode === "end_of_period") {
    return row.netDueGbp;
  }

  const periodDays = calendarDaysInclusive(row.periodStart, row.periodEnd);
  const usedDays = calendarDaysInclusive(row.periodStart, terminatedYmd);
  if (periodDays <= 0) return row.netDueGbp;
  return roundGbp((row.netDueGbp * usedDays) / periodDays);
}

export function buildTerminationBillingPeriodBreakdown(
  rows: HirePaymentRowComputed[],
  terminatedYmd: string,
  cadence: RentCadence,
): HireTerminationBillingPeriodBreakdown | null {
  if (!supportsEndOfPeriodBilling(cadence)) return null;
  const current = findRentPeriodAtTermination(rows, terminatedYmd);
  if (!current || !isPartialRentPeriodAtTermination(current, terminatedYmd)) return null;

  const daysInPeriod = calendarDaysInclusive(current.periodStart, current.periodEnd);
  const daysUsed = calendarDaysInclusive(current.periodStart, terminatedYmd);
  const actualDueGbp = terminationRentDueForRow(current, terminatedYmd, "actual", cadence);
  const endOfPeriodDueGbp = terminationRentDueForRow(current, terminatedYmd, "end_of_period", cadence);

  return {
    periodStart: current.periodStart,
    periodEnd: current.periodEnd,
    daysUsed,
    daysInPeriod,
    actualDueGbp,
    endOfPeriodDueGbp,
  };
}
