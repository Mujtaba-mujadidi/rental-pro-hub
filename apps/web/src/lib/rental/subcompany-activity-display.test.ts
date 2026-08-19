import { describe, expect, it } from "vitest";
import {
  filterSubcompanyActivityItems,
  groupSubcompanyActivityByDay,
  mapSubcompanyActivityItem,
  mapSubcompanyActivityItems,
  subcompanyActivityTone,
} from "@/lib/rental/subcompany-activity-display";
import type { SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";

function event(
  partial: Partial<SubcompanyAuditRow> & Pick<SubcompanyAuditRow, "id" | "summary" | "created_at">,
): SubcompanyAuditRow {
  return {
    event_type: "updated",
    actor_user_id: null,
    actor_role: "company_staff",
    metadata: {},
    ...partial,
  };
}

describe("subcompanyActivityTone", () => {
  it("marks completions as ok, reminders as warn, and assignments as neutral", () => {
    expect(subcompanyActivityTone("updated", "Hire agreement completed")).toBe("ok");
    expect(subcompanyActivityTone("updated", "Compliance reminder created")).toBe("warn");
    expect(subcompanyActivityTone("updated", "Driver access enabled")).toBe("info");
    expect(subcompanyActivityTone("updated", "Vehicle assigned")).toBe("neutral");
  });
});

describe("mapSubcompanyActivityItem", () => {
  it("splits summary, formats time, and includes actor name", () => {
    const item = mapSubcompanyActivityItem(
      event({
        id: "1",
        summary: "Vehicle assigned · KE18 FSX moved into Oxus Cars Ltd",
        created_at: "2026-08-09T15:42:00.000Z",
        actor_display_name: "Riddhi Joshi",
      }),
    );
    expect(item.title).toBe("Vehicle assigned");
    expect(item.detail).toBe("KE18 FSX moved into Oxus Cars Ltd");
    expect(item.timeLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(item.actorLabel).toBe("Riddhi Joshi · Company staff");
    expect(item.tone).toBe("neutral");
  });
});

describe("groupSubcompanyActivityByDay", () => {
  it("groups newest-first events under day headers", () => {
    const items = mapSubcompanyActivityItems([
      event({
        id: "a",
        summary: "First",
        created_at: "2026-08-10T00:23:00.000Z",
      }),
      event({
        id: "b",
        summary: "Second",
        created_at: "2026-08-10T00:20:00.000Z",
      }),
      event({
        id: "c",
        summary: "Third",
        created_at: "2026-08-09T15:42:00.000Z",
      }),
    ]);
    const groups = groupSubcompanyActivityByDay(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[1]?.items).toHaveLength(1);
  });
});

describe("filterSubcompanyActivityItems", () => {
  it("filters by event type", () => {
    const items = mapSubcompanyActivityItems([
      event({ id: "1", summary: "Created", created_at: "2026-08-10T12:00:00.000Z", event_type: "created" }),
      event({ id: "2", summary: "Updated", created_at: "2026-08-10T12:00:00.000Z", event_type: "updated" }),
    ]);
    expect(filterSubcompanyActivityItems(items, "all")).toHaveLength(2);
    expect(filterSubcompanyActivityItems(items, "created")).toHaveLength(1);
    expect(filterSubcompanyActivityItems(items, "created")[0]?.id).toBe("1");
  });
});
