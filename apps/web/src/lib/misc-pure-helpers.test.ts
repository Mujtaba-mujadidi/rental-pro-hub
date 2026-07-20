import { describe, expect, it } from "vitest";
import { formatLicenceDate } from "@/lib/driver/licence-display";
import { clearDraft, formDraftStorageKey, loadDraft, saveDraft, stableSerialize } from "@/lib/forms/form-draft";
import { collectionItemDraftKey } from "@/lib/forms/form-draft-collection";
import { clampNotifyDays, defaultNotificationSettings } from "@/lib/settings/notification-settings";
import { accStatusLabel, weeklyMileageWindowUnix } from "@/lib/fleet-tracking/smartcar-tracker-client";

describe("formatLicenceDate", () => {
  it("formats or returns empty", () => {
    expect(formatLicenceDate("2026-07-17")).toBe("17 July 2026");
    expect(formatLicenceDate(null)).toBe("—");
  });
});

describe("form-draft pure helpers", () => {
  it("builds storage keys and serializes", () => {
    expect(formDraftStorageKey("add-vehicle")).toBe("rph:form-draft:add-vehicle");
    expect(stableSerialize({ a: 1 })).toBe('{"a":1}');
    expect(collectionItemDraftKey("companies", "d1")).toBe("companies:d1");
  });

  it("no-ops localStorage APIs in node", () => {
    expect(loadDraft("x")).toBeNull();
    expect(saveDraft("x", { a: 1 }).data).toEqual({ a: 1 });
    expect(() => clearDraft("x")).not.toThrow();
  });
});

describe("notification-settings", () => {
  it("defaults and clamps", () => {
    expect(defaultNotificationSettings().notify_mot_days_before).toBe(5);
    expect(clampNotifyDays(400)).toBe(365);
    expect(clampNotifyDays(Number.NaN)).toBe(0);
  });
});

describe("SmartCar Tracker status / window helpers", () => {
  it("labels ignition and builds weekly window", () => {
    expect(accStatusLabel(1)).toBe("Ignition on");
    expect(accStatusLabel(0)).toBe("Ignition off");
    expect(accStatusLabel(undefined)).toBe("Ignition unknown");
    const { beginUnix, endUnix } = weeklyMileageWindowUnix(new Date("2026-07-20T12:17:00.000Z"));
    expect(endUnix).toBeGreaterThan(beginUnix);
    expect(endUnix - beginUnix).toBeLessThanOrEqual(7 * 24 * 3600);
    expect(endUnix - beginUnix).toBeGreaterThanOrEqual(6 * 24 * 3600);
  });
});
