import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessVehicleExpiries,
  vehicleExpiryAttentionItems,
  vehicleHasExpiryAttention,
  worstVehicleExpiryTone,
  vehicleExpiryPillClass,
  vehicleExpiryTextClass,
} from "@/lib/fleet/vehicle-expiry-attention";

describe("assessVehicleExpiries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const settings = {
    notify_mot_days_before: 5,
    notify_tax_days_before: 5,
    notify_phv_licence_days_before: 28,
    notify_contract_expiry_days_before: 28,
  };

  it("marks missing dates as ok with not-set message", () => {
    const items = assessVehicleExpiries({}, settings);
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.tone === "ok")).toBe(true);
    expect(items[0]!.message).toContain("not set");
  });

  it("marks expired, expiring, and ok branches", () => {
    const items = assessVehicleExpiries(
      {
        mot_expiry: "2026-07-10", // expired
        tax_expiry: "2026-07-22", // within 5 days
        phv_licence_expiry: "2027-01-01", // ok
      },
      settings,
    );
    expect(items.find((i) => i.kind === "mot")!.tone).toBe("expired");
    expect(items.find((i) => i.kind === "tax")!.tone).toBe("expiring");
    expect(items.find((i) => i.kind === "phv")!.tone).toBe("ok");
    expect(items.find((i) => i.kind === "phv")!.message).toContain("within date");
  });

  it("treats expiry today as expiring when lead covers today", () => {
    const items = assessVehicleExpiries({ mot_expiry: "2026-07-20" }, settings);
    expect(items[0]!.tone).toBe("expiring");
    expect(items[0]!.shortStatus).toBe("Expires today");
  });

  it("vehicleExpiryAttentionItems filters ok", () => {
    const attention = vehicleExpiryAttentionItems(
      {
        mot_expiry: "2026-07-10",
        tax_expiry: "2027-01-01",
        phv_licence_expiry: "2027-01-01",
      },
      settings,
    );
    expect(attention).toHaveLength(1);
    expect(attention[0]!.kind).toBe("mot");
  });

  it("vehicleHasExpiryAttention is true when any attention", () => {
    expect(vehicleHasExpiryAttention({ mot_expiry: "2026-07-10" }, settings)).toBe(true);
    expect(vehicleHasExpiryAttention({ mot_expiry: "2027-01-01" }, settings)).toBe(false);
  });
});

describe("worstVehicleExpiryTone", () => {
  it("prefers expired over expiring over ok", () => {
    expect(worstVehicleExpiryTone([])).toBe("ok");
    expect(
      worstVehicleExpiryTone([
        { tone: "ok" } as never,
        { tone: "expiring" } as never,
      ]),
    ).toBe("expiring");
    expect(
      worstVehicleExpiryTone([
        { tone: "expiring" } as never,
        { tone: "expired" } as never,
      ]),
    ).toBe("expired");
  });
});

describe("tone class helpers", () => {
  it("returns distinct classes per tone", () => {
    expect(vehicleExpiryPillClass("expired")).toContain("red");
    expect(vehicleExpiryPillClass("expiring")).toContain("amber");
    expect(vehicleExpiryPillClass("ok")).toContain("emerald");
    expect(vehicleExpiryTextClass("expired")).toContain("red");
    expect(vehicleExpiryTextClass("expiring")).toContain("amber");
    expect(vehicleExpiryTextClass("ok")).toContain("rph-fg-secondary");
  });
});
