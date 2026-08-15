import { describe, expect, it } from "vitest";
import {
  mapSubcompanyOverviewActivity,
  subcompanyOverviewComplianceLabel,
  subcompanyOverviewHealth,
  subcompanyOverviewHealthLabel,
} from "@/lib/rental/subcompany-overview-display";

describe("subcompanyOverviewHealth", () => {
  it("is healthy when nothing needs attention", () => {
    expect(subcompanyOverviewHealth({ openRequirementCount: 0, vehicleAttentionCount: 0 })).toBe(
      "healthy",
    );
    expect(subcompanyOverviewComplianceLabel("healthy")).toBe("Current");
    expect(subcompanyOverviewHealthLabel("healthy")).toBe("Healthy");
  });

  it("needs attention when requirements or vehicle flags exist", () => {
    expect(subcompanyOverviewHealth({ openRequirementCount: 1, vehicleAttentionCount: 0 })).toBe(
      "attention",
    );
    expect(subcompanyOverviewHealth({ openRequirementCount: 0, vehicleAttentionCount: 2 })).toBe(
      "attention",
    );
    expect(subcompanyOverviewComplianceLabel("attention")).toBe("Needs attention");
  });
});

describe("mapSubcompanyOverviewActivity", () => {
  it("splits summary and formats long UK date detail", () => {
    const items = mapSubcompanyOverviewActivity(
      [
        {
          id: "1",
          event_type: "updated",
          actor_user_id: null,
          actor_role: null,
          summary: "Vehicle assigned · KE18 FSX",
          metadata: {},
          created_at: "2026-08-09T12:00:00.000Z",
        },
        {
          id: "2",
          event_type: "updated",
          actor_user_id: null,
          actor_role: null,
          summary: "Hire agreement completed · All signatures received",
          metadata: {},
          created_at: "2026-08-10T12:00:00.000Z",
        },
        {
          id: "3",
          event_type: "updated",
          actor_user_id: null,
          actor_role: null,
          summary: "Extra event.",
          metadata: {},
          created_at: "2026-08-11T12:00:00.000Z",
        },
        {
          id: "4",
          event_type: "updated",
          actor_user_id: null,
          actor_role: null,
          summary: "Four",
          metadata: {},
          created_at: "2026-08-12T12:00:00.000Z",
        },
        {
          id: "5",
          event_type: "updated",
          actor_user_id: null,
          actor_role: null,
          summary: "Five",
          metadata: {},
          created_at: "2026-08-13T12:00:00.000Z",
        },
        {
          id: "6",
          event_type: "updated",
          actor_user_id: null,
          actor_role: null,
          summary: "Six should be truncated",
          metadata: {},
          created_at: "2026-08-14T12:00:00.000Z",
        },
      ],
      5,
    );
    expect(items).toHaveLength(5);
    expect(items[0]?.title).toBe("Vehicle assigned");
    expect(items[0]?.detail).toBe("KE18 FSX · 9 August 2026");
    expect(items[0]?.tone).toBe("neutral");
    expect(items[1]?.title).toBe("Hire agreement completed");
    expect(items[1]?.tone).toBe("ok");
    expect(items[2]?.title).toBe("Extra event");
    expect(items[2]?.tone).toBe("neutral");
  });
});
