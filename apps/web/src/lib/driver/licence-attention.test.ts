import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverOnboardingRow } from "@/lib/driver/licence-check";
import {
  addressOnlyLicenceReview,
  driverLicenceReviewReasons,
  driverLicenceReviewRequired,
  driverLicenceReviewSummaryLines,
  licenceReviewReasonMessage,
  LICENCE_EXPIRING_SOON_MAX_DAYS,
} from "@/lib/driver/licence-attention";

function baseRow(overrides: Partial<NonNullable<DriverOnboardingRow>> = {}): NonNullable<DriverOnboardingRow> {
  return {
    driving_licence_number: "X",
    driving_licence_expiry: "2027-01-01",
    phv_licence_number: "Y",
    phv_licensing_authority: "TfL",
    phv_licence_expiry: "2027-01-01",
    driving_licence_front_path: "a",
    driving_licence_back_path: "b",
    phv_licence_card_path: "c",
    driving_address_confirmed_at: null,
    phv_address_confirmed_at: null,
    pending_address_line1: null,
    pending_address_line2: null,
    pending_address_town: null,
    pending_address_county: null,
    pending_address_postcode: null,
    pending_address_submitted_at: null,
    licence_revalidation_due_at: null,
    ...overrides,
  };
}

describe("driverLicenceReviewReasons", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false / empty for null row", () => {
    expect(driverLicenceReviewRequired(null)).toBe(false);
    expect(driverLicenceReviewSummaryLines(null)).toEqual([]);
  });

  it("flags expired and expiring driving/phv licences", () => {
    const reasons = driverLicenceReviewReasons(
      baseRow({
        driving_licence_expiry: "2026-07-01",
        phv_licence_expiry: "2026-07-25",
      }),
    );
    expect(reasons.some((r) => r.code === "driving_expired")).toBe(true);
    expect(reasons.some((r) => r.code === "phv_expiring")).toBe(true);
    const phv = reasons.find((r) => r.code === "phv_expiring");
    expect(phv?.daysUntilExpiry).toBe(5);
    expect(5).toBeLessThanOrEqual(LICENCE_EXPIRING_SOON_MAX_DAYS);
  });

  it("flags address_changed when revalidation due", () => {
    const reasons = driverLicenceReviewReasons(
      baseRow({ licence_revalidation_due_at: "2026-07-20T00:00:00Z" }),
    );
    expect(reasons.some((r) => r.code === "address_changed")).toBe(true);
  });

  it("flags phv_after_address_update when driving confirmed after phv", () => {
    const reasons = driverLicenceReviewReasons(
      baseRow({
        driving_address_confirmed_at: "2026-07-20T10:00:00Z",
        phv_address_confirmed_at: "2026-07-19T10:00:00Z",
        licence_revalidation_due_at: null,
      }),
    );
    expect(reasons.some((r) => r.code === "phv_after_address_update")).toBe(true);
  });

  it("does not double-add phv catch-up when revalidation is already due", () => {
    const reasons = driverLicenceReviewReasons(
      baseRow({
        driving_address_confirmed_at: "2026-07-20T10:00:00Z",
        phv_address_confirmed_at: null,
        licence_revalidation_due_at: "2026-07-20T00:00:00Z",
      }),
    );
    expect(reasons.some((r) => r.code === "address_changed")).toBe(true);
    expect(reasons.some((r) => r.code === "phv_after_address_update")).toBe(false);
  });
});

describe("licenceReviewReasonMessage", () => {
  it("covers every reason code branch", () => {
    expect(licenceReviewReasonMessage({ code: "driving_expired" })).toMatch(/driving licence has expired/i);
    expect(licenceReviewReasonMessage({ code: "driving_expiring", daysUntilExpiry: 0 })).toMatch(/less than a day/);
    expect(licenceReviewReasonMessage({ code: "driving_expiring", daysUntilExpiry: 1 })).toMatch(/1 day/);
    expect(licenceReviewReasonMessage({ code: "driving_expiring", daysUntilExpiry: 3 })).toMatch(/3 days/);
    expect(licenceReviewReasonMessage({ code: "phv_expired" })).toMatch(/PHV/);
    expect(licenceReviewReasonMessage({ code: "phv_expiring", daysUntilExpiry: 2 })).toMatch(/2 days/);
    expect(licenceReviewReasonMessage({ code: "address_changed" })).toMatch(/address/i);
    expect(licenceReviewReasonMessage({ code: "phv_after_address_update" })).toMatch(/PHV/);
  });
});

describe("summary helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("driverLicenceReviewSummaryLines maps messages", () => {
    const lines = driverLicenceReviewSummaryLines(baseRow({ driving_licence_expiry: "2026-07-01" }));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/expired/i);
  });

  it("addressOnlyLicenceReview is true only for address codes", () => {
    expect(addressOnlyLicenceReview(null)).toBe(false);
    expect(
      addressOnlyLicenceReview(baseRow({ licence_revalidation_due_at: "2026-07-20T00:00:00Z" })),
    ).toBe(true);
    expect(addressOnlyLicenceReview(baseRow({ driving_licence_expiry: "2026-07-01" }))).toBe(false);
  });
});
