import { describe, expect, it } from "vitest";
import { clampNotifyDays, defaultNotificationSettings } from "@/lib/settings/notification-settings";
import { phvLicenceNeedsAddressCatchUp, driverOnboardingComplete } from "@/lib/driver/licence-check";

describe("clampNotifyDays", () => {
  it("clamps to 0..365 and rounds", () => {
    expect(clampNotifyDays(Number.NaN)).toBe(0);
    expect(clampNotifyDays(-5)).toBe(0);
    expect(clampNotifyDays(10.4)).toBe(10);
    expect(clampNotifyDays(10.6)).toBe(11);
    expect(clampNotifyDays(400)).toBe(365);
  });
});

describe("defaultNotificationSettings", () => {
  it("returns expected defaults", () => {
    expect(defaultNotificationSettings()).toEqual({
      notify_mot_days_before: 5,
      notify_tax_days_before: 5,
      notify_phv_licence_days_before: 28,
    });
  });
});

describe("phvLicenceNeedsAddressCatchUp", () => {
  it("is false when driving not confirmed", () => {
    expect(phvLicenceNeedsAddressCatchUp({})).toBe(false);
    expect(phvLicenceNeedsAddressCatchUp({ driving_address_confirmed_at: null })).toBe(false);
  });

  it("is true when phv missing or older than driving", () => {
    expect(
      phvLicenceNeedsAddressCatchUp({
        driving_address_confirmed_at: "2026-07-20T10:00:00Z",
        phv_address_confirmed_at: null,
      }),
    ).toBe(true);
    expect(
      phvLicenceNeedsAddressCatchUp({
        driving_address_confirmed_at: "2026-07-20T10:00:00Z",
        phv_address_confirmed_at: "2026-07-19T10:00:00Z",
      }),
    ).toBe(true);
  });

  it("is false when phv confirmed at/after driving", () => {
    expect(
      phvLicenceNeedsAddressCatchUp({
        driving_address_confirmed_at: "2026-07-20T10:00:00Z",
        phv_address_confirmed_at: "2026-07-20T10:00:00Z",
      }),
    ).toBe(false);
    expect(
      phvLicenceNeedsAddressCatchUp({
        driving_address_confirmed_at: "2026-07-20T10:00:00Z",
        phv_address_confirmed_at: "2026-07-21T10:00:00Z",
      }),
    ).toBe(false);
  });
});

describe("driverOnboardingComplete", () => {
  it("is false for null", () => {
    expect(driverOnboardingComplete(null)).toBe(false);
  });

  it("requires driving + phv fields and docs", () => {
    expect(
      driverOnboardingComplete({
        driving_licence_number: "A",
        driving_licence_expiry: "2027-01-01",
        phv_licence_number: "B",
        phv_licensing_authority: "TfL",
        phv_licence_expiry: "2027-01-01",
        driving_licence_front_path: "f",
        driving_licence_back_path: "b",
        phv_licence_card_path: "p",
        driving_address_confirmed_at: null,
        phv_address_confirmed_at: null,
        pending_address_line1: null,
        pending_address_line2: null,
        pending_address_town: null,
        pending_address_county: null,
        pending_address_postcode: null,
        pending_address_submitted_at: null,
        licence_revalidation_due_at: null,
      }),
    ).toBe(true);

    expect(
      driverOnboardingComplete({
        driving_licence_number: "A",
        driving_licence_expiry: "2027-01-01",
        phv_licence_number: null,
        phv_licensing_authority: "TfL",
        phv_licence_expiry: "2027-01-01",
        driving_licence_front_path: "f",
        driving_licence_back_path: "b",
        phv_licence_card_path: "p",
        driving_address_confirmed_at: null,
        phv_address_confirmed_at: null,
        pending_address_line1: null,
        pending_address_line2: null,
        pending_address_town: null,
        pending_address_county: null,
        pending_address_postcode: null,
        pending_address_submitted_at: null,
        licence_revalidation_due_at: null,
      }),
    ).toBe(false);
  });
});
