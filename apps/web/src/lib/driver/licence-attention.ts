import { parseUkDate } from "@/lib/validation/driver-signup";
import { phvLicenceNeedsAddressCatchUp, type DriverOnboardingRow } from "./licence-check";

export type LicenceReviewReasonCode =
  | "driving_expired"
  | "driving_expiring"
  | "phv_expired"
  | "phv_expiring"
  | "address_changed"
  | "phv_after_address_update";

export type LicenceReviewReason = {
  code: LicenceReviewReasonCode;
  /** Days until expiry when code is *_expiring (0 = expires today). */
  daysUntilExpiry?: number;
};

function utcStartOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Upper bound (inclusive) for days-until-expiry when we treat a licence as expiring soon. */
export const LICENCE_EXPIRING_SOON_MAX_DAYS = 30;

/** Whole calendar days from today (UTC) to expiry date; negative if expired. */
export function daysFromTodayToExpiry(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const exp = parseUkDate(isoDate.slice(0, 10));
  if (!exp) return null;
  const today = new Date();
  const diff = utcStartOfDay(exp) - utcStartOfDay(today);
  return Math.round(diff / 86400000);
}

function pushExpiryReasons(
  iso: string | null | undefined,
  prefix: "driving" | "phv",
  reasons: LicenceReviewReason[],
): void {
  const days = daysFromTodayToExpiry(iso);
  if (days === null) return;
  if (days < 0) {
    reasons.push({ code: prefix === "driving" ? "driving_expired" : "phv_expired" });
    return;
  }
  if (days <= LICENCE_EXPIRING_SOON_MAX_DAYS) {
    reasons.push({
      code: prefix === "driving" ? "driving_expiring" : "phv_expiring",
      daysUntilExpiry: days,
    });
  }
}

/** True when onboarding is complete and licences need review (expiry / address flag). */
export function driverLicenceReviewRequired(row: DriverOnboardingRow): boolean {
  if (!row) return false;
  return driverLicenceReviewReasons(row).length > 0;
}

export function driverLicenceReviewReasons(row: NonNullable<DriverOnboardingRow>): LicenceReviewReason[] {
  const reasons: LicenceReviewReason[] = [];
  pushExpiryReasons(row.driving_licence_expiry, "driving", reasons);
  pushExpiryReasons(row.phv_licence_expiry, "phv", reasons);
  if (row.licence_revalidation_due_at) {
    reasons.push({ code: "address_changed" });
  }
  // Driving already confirmed for new address; PHV must still be saved/confirmed.
  if (phvLicenceNeedsAddressCatchUp(row) && !row.licence_revalidation_due_at) {
    reasons.push({ code: "phv_after_address_update" });
  }
  return reasons;
}

export function licenceReviewReasonMessage(r: LicenceReviewReason): string {
  switch (r.code) {
    case "driving_expired":
      return "Your driving licence has expired — update your details and photos.";
    case "driving_expiring":
      return `Your driving licence expires in ${r.daysUntilExpiry === 0 ? "less than a day" : `${r.daysUntilExpiry} day${r.daysUntilExpiry === 1 ? "" : "s"}`} — please update before it lapses.`;
    case "phv_expired":
      return "Your PHV / taxi licence has expired — update your details and photo.";
    case "phv_expiring":
      return `Your PHV / taxi licence expires in ${r.daysUntilExpiry === 0 ? "less than a day" : `${r.daysUntilExpiry} day${r.daysUntilExpiry === 1 ? "" : "s"}`} — please update before it lapses.`;
    case "address_changed":
      return "Your home address was updated — confirm your licence details and documents match.";
    case "phv_after_address_update":
      return "Your driving licence is updated for your new address — please update and confirm your PHV / taxi licence (details and photo) to match.";
  }
}

export function driverLicenceReviewSummaryLines(row: DriverOnboardingRow): string[] {
  if (!row) return [];
  return driverLicenceReviewReasons(row).map(licenceReviewReasonMessage);
}

/** True when the only review triggers are address-based (no expiry issues). */
export function addressOnlyLicenceReview(row: DriverOnboardingRow): boolean {
  if (!row) return false;
  const reasons = driverLicenceReviewReasons(row);
  return reasons.length > 0 && reasons.every((r) => r.code === "address_changed" || r.code === "phv_after_address_update");
}
