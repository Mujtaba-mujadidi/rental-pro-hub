import type { RentCadence } from "@/lib/fleet/hire-types";

export type TimesheetRowInput = {
  periodStart: string;
  periodEnd: string;
  baseAmountGbp: number;
  rowKind: "rent" | "deposit";
  sortOrder: number;
};

function parseUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addCadence(d: Date, cadence: RentCadence): Date {
  const next = new Date(d.getTime());
  if (cadence === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
  } else if (cadence === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

/** Generate rent period rows from start through end (inclusive periods). */
export function generateRentScheduleRows(input: {
  startDate: string;
  endDate: string;
  cadence: RentCadence;
  rentAmountGbp: number;
}): TimesheetRowInput[] {
  const { startDate, endDate, cadence, rentAmountGbp } = input;
  if (!startDate || !endDate || endDate < startDate || rentAmountGbp < 0) return [];

  const rows: TimesheetRowInput[] = [];
  let cursor = parseUtcDate(startDate);
  const end = parseUtcDate(endDate);
  let sortOrder = 0;

  while (cursor <= end) {
    const periodStart = formatUtcDate(cursor);
    const next = addCadence(cursor, cadence);
    const periodEndRaw = new Date(next.getTime());
    periodEndRaw.setUTCDate(periodEndRaw.getUTCDate() - 1);
    const periodEnd = formatUtcDate(periodEndRaw > end ? end : periodEndRaw);

    rows.push({
      periodStart,
      periodEnd,
      baseAmountGbp: rentAmountGbp,
      rowKind: "rent",
      sortOrder: sortOrder++,
    });

    cursor = next;
    if (cursor > end) break;
  }

  return rows;
}

/** Prepend a deposit row when deposit amount is set. */
export function withDepositRow(
  rows: TimesheetRowInput[],
  depositGbp: number | null | undefined,
  startDate: string,
): TimesheetRowInput[] {
  if (depositGbp == null || depositGbp <= 0) return rows;
  const deposit: TimesheetRowInput = {
    periodStart: startDate,
    periodEnd: startDate,
    baseAmountGbp: depositGbp,
    rowKind: "deposit",
    sortOrder: -1,
  };
  const shifted = rows.map((r) => ({ ...r, sortOrder: r.sortOrder + 1 }));
  return [deposit, ...shifted];
}

/** Net amount due on a row after discounts. */
export function netRowAmountGbp(baseAmountGbp: number, discountTotalGbp: number): number {
  return Math.max(0, Math.round((baseAmountGbp - discountTotalGbp) * 100) / 100);
}
