import type { RentCadence } from "@/lib/fleet/hire-types";
import { hireDaysOnHire } from "@/lib/fleet/hire-payment-analytics";

const CADENCE_UNIT: Record<RentCadence, string> = {
  daily: "Day",
  weekly: "Week",
  monthly: "Month",
};

/** How many rent periods have started by referenceYmd (from schedule rows). */
export function hireFrequencyPeriodNumberFromRows(
  rows: readonly { rowKind: string; periodStart: string }[],
  referenceYmd: string,
): number {
  const ref = referenceYmd.trim();
  if (!ref) return 0;
  return rows.filter((row) => row.rowKind === "rent" && row.periodStart <= ref).length;
}

/** Fallback when schedule rows are not loaded yet. */
export function hireFrequencyPeriodNumberFromDates(
  cadence: RentCadence,
  startDateYmd: string,
  referenceYmd: string,
): number {
  const start = startDateYmd.trim();
  const ref = referenceYmd.trim();
  if (!start || !ref || ref < start) return 0;

  if (cadence === "daily") {
    return hireDaysOnHire(start, ref);
  }
  if (cadence === "weekly") {
    const days = hireDaysOnHire(start, ref);
    return Math.floor((days - 1) / 7) + 1;
  }
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ry, rm, rd] = ref.split("-").map(Number);
  if (!sy || !sm || !ry || !rm) return 0;
  let months = (ry - sy) * 12 + (rm - sm);
  if (rd < sd) months -= 1;
  return Math.max(1, months + 1);
}

export function hireFrequencyPositionLabel(cadence: RentCadence, periodNumber: number): string {
  if (periodNumber <= 0) return "—";
  const unit = CADENCE_UNIT[cadence] ?? "Period";
  return `${unit} ${periodNumber}`;
}

export function hireFrequencyPosition(
  input: {
    cadence: RentCadence;
    startDateYmd: string;
    referenceYmd: string;
    scheduleRows?: readonly { rowKind: string; periodStart: string }[];
  },
): string {
  const periodNumber =
    input.scheduleRows && input.scheduleRows.length > 0
      ? hireFrequencyPeriodNumberFromRows(input.scheduleRows, input.referenceYmd)
      : hireFrequencyPeriodNumberFromDates(input.cadence, input.startDateYmd, input.referenceYmd);
  return hireFrequencyPositionLabel(input.cadence, periodNumber);
}
