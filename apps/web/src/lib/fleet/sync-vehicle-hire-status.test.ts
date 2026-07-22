import { describe, expect, it } from "vitest";
import { vehicleIdsBlockedByInProgressHires } from "@/lib/fleet/sync-vehicle-hire-status";

describe("vehicleIdsBlockedByInProgressHires", () => {
  it("collects vehicle ids from blocking hires", () => {
    const blocked = vehicleIdsBlockedByInProgressHires([
      { id: "hire-1", vehicle_id: "veh-a" },
      { id: "hire-2", vehicle_id: "veh-b" },
      { id: "hire-3", vehicle_id: null },
    ]);
    expect(blocked.has("veh-a")).toBe(true);
    expect(blocked.has("veh-b")).toBe(true);
    expect(blocked.size).toBe(2);
  });

  it("excludes the current hire group when editing a draft", () => {
    const blocked = vehicleIdsBlockedByInProgressHires(
      [
        { id: "hire-1", vehicle_id: "veh-a" },
        { id: "hire-2", vehicle_id: "veh-b" },
      ],
      "hire-1",
    );
    expect(blocked.has("veh-a")).toBe(false);
    expect(blocked.has("veh-b")).toBe(true);
  });
});
