import type { HireGroupStatus } from "@/lib/fleet/hire-types";
import type { VehicleStatus } from "@/lib/fleet/vehicles";

/** Compute contract end date from start and length kind. */
export function computeContractEndDate(
  startDate: string,
  kind: "annual" | "six_months" | "custom",
  customEndDate?: string | null,
): string | null {
  if (kind === "custom") {
    const end = customEndDate?.trim();
    return end && end >= startDate ? end : null;
  }
  const [y, m, d] = startDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(Date.UTC(y, m - 1, d));
  if (kind === "annual") {
    start.setUTCFullYear(start.getUTCFullYear() + 1);
  } else {
    start.setUTCMonth(start.getUTCMonth() + 6);
  }
  // Inclusive period: e.g. 15 Jan 2026 → 14 Jan 2027 (exactly one year, not +1 day).
  start.setUTCDate(start.getUTCDate() - 1);
  return start.toISOString().slice(0, 10);
}

/** Longest end date across agreements in a hire group. */
export function longestAgreementEndDate(endDates: string[]): string | null {
  if (!endDates.length) return null;
  return endDates.reduce((max, d) => (d > max ? d : max), endDates[0]!);
}

/** All agreements must be signed before group can leave draft/pending. */
export function allAgreementsSigned(signedFlags: boolean[]): boolean {
  return signedFlags.length > 0 && signedFlags.every(Boolean);
}

/** Map hire group status to vehicle status when hire drives fleet state. */
export function vehicleStatusForHireGroup(status: HireGroupStatus): VehicleStatus | null {
  if (status === "draft" || status === "pending_signature" || status === "reserved") return "reserved";
  if (status === "active") return "on_rent";
  if (status === "completed" || status === "terminated" || status === "cancelled") return "available";
  return null;
}

/** Whether start date is in the future (UTC date compare). */
export function isStartDateInFuture(startDate: string, todayIso: string): boolean {
  return startDate > todayIso;
}

/** Resolve group status after all contracts signed. */
export function hireGroupStatusAfterAllSigned(
  startDate: string,
  todayIso: string,
): "reserved" | "active" {
  return isStartDateInFuture(startDate, todayIso) ? "reserved" : "active";
}
