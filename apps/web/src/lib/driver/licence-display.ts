import { formatUkDateLong } from "@/lib/datetime/uk";

/** Display YYYY-MM-DD (date column) as a UK-style long date (UTC calendar day). */
export function formatLicenceDate(iso: string | null | undefined): string {
  return formatUkDateLong(iso);
}
