import { describe, expect, it } from "vitest";
import { buildHireWorkspaceHeroMetrics } from "./hire-workspace-hero-display";

describe("buildHireWorkspaceHeroMetrics", () => {
  it("shows contract start and activation separately", () => {
    const metrics = buildHireWorkspaceHeroMetrics({
      startDate: "2026-08-10",
      startTime: "09:00",
      endTime: "09:00",
      activatedAt: "2026-08-10T00:23:00.000Z",
      status: "active",
      rentAmountGbp: 10,
      agreementEndDates: ["2027-08-09"],
    });

    expect(metrics.contractStartLabel).toBe("10 Aug 2026, 09:00");
    expect(metrics.activeSinceLabel).toMatch(/10 Aug 2026, \d{2}:\d{2}/);
    expect(metrics.contractEndLabel).toBe("9 Aug 2027, 09:00");
    expect(metrics.dailyRentLabel).toBe("£10.00");
  });

  it("keeps contract start when not yet activated", () => {
    const metrics = buildHireWorkspaceHeroMetrics({
      startDate: "2026-08-12",
      startTime: "10:00",
      status: "ready",
      rentAmountGbp: 20,
    });

    expect(metrics.contractStartLabel).toBe("12 Aug 2026, 10:00");
    expect(metrics.activeSinceLabel).toBe("Not yet activated");
  });
});
