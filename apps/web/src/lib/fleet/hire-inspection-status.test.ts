import { describe, expect, it } from "vitest";
import {
  hireInspectionCompletionFromRows,
  mapHireInspectionCompletionByGroup,
} from "@/lib/fleet/hire-inspection-status";

describe("hire-inspection-status", () => {
  it("detects completed checkout and check-in", () => {
    expect(
      hireInspectionCompletionFromRows([
        { kind: "checkout", status: "completed" },
        { kind: "checkin", status: "draft" },
      ]),
    ).toEqual({ checkoutCompleted: true, checkinCompleted: false });
  });

  it("maps rows by hire group", () => {
    const map = mapHireInspectionCompletionByGroup([
      { hire_group_id: "g1", kind: "checkout", status: "completed" },
      { hire_group_id: "g2", kind: "checkin", status: "completed" },
    ]);
    expect(map.get("g1")).toEqual({ checkoutCompleted: true, checkinCompleted: false });
    expect(map.get("g2")).toEqual({ checkoutCompleted: false, checkinCompleted: true });
  });
});
