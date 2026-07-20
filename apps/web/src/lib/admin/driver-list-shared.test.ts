import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driverIsBlocked } from "@/lib/admin/driver-list-shared";

describe("driverIsBlocked", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is false when no ban or ban already ended", () => {
    expect(driverIsBlocked({ bannedUntil: null })).toBe(false);
    expect(driverIsBlocked({ bannedUntil: "2026-07-19T00:00:00.000Z" })).toBe(false);
    expect(driverIsBlocked({ bannedUntil: "not-a-date" })).toBe(false);
  });

  it("is true when ban is in the future", () => {
    expect(driverIsBlocked({ bannedUntil: "2026-07-21T00:00:00.000Z" })).toBe(true);
  });
});
