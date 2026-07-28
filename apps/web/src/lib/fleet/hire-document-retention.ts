import { calendarDaysInclusive } from "@/lib/fleet/hire-payment-analytics";

/** Industry-typical UK hire operator retention for licence/ID copies (hire duration + 12 months). */
export const HIRE_DRIVER_DOCUMENT_RETENTION_MONTHS = 12;

/** HMRC invoice/payment records are typically kept 6 years — handled separately from ID copies. */
export const HIRE_FINANCIAL_RECORD_RETENTION_YEARS = 6;

function parseYmd(ymd: string): Date | null {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Retain driver ID/licence copies until this date (inclusive). */
export function driverDocumentsRetainUntilYmd(fromYmd: string, months = HIRE_DRIVER_DOCUMENT_RETENTION_MONTHS): string {
  const date = parseYmd(fromYmd);
  if (!date) return fromYmd;
  date.setUTCMonth(date.getUTCMonth() + months);
  return formatYmd(date);
}

export function canCompanyAccessHireDriverDocuments(
  retainUntilYmd: string | null | undefined,
  todayYmd: string,
): boolean {
  if (!retainUntilYmd) return true;
  return todayYmd <= retainUntilYmd;
}

export function driverDocumentsRetentionWarning(
  retainUntilYmd: string,
  todayYmd: string,
): { level: "warning" | "expired"; message: string } | null {
  if (todayYmd > retainUntilYmd) {
    return {
      level: "expired",
      message:
        "Driver document access for this hire has expired. Download any files you still need before they are removed from RMS.",
    };
  }

  const daysLeft = calendarDaysInclusive(todayYmd, retainUntilYmd);
  if (daysLeft > 30) return null;

  return {
    level: "warning",
    message: `Driver document access expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Download copies if you need to retain them beyond RMS.`,
  };
}
