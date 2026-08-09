import { describe, expect, it } from "vitest";
import {
  findTransferOutFromSubcompany,
  resolveVehicleWorkspaceAccess,
  shouldShowCurrentVehicleDocuments,
  userHasAllSubcompanyScope,
} from "@/lib/fleet/vehicle-historic-access";
import type { VehicleTransferRow } from "@/lib/fleet/vehicles";

const transfers: VehicleTransferRow[] = [
  {
    id: "t1",
    vehicle_id: "v1",
    from_subcompany_id: "oxus",
    to_subcompany_id: "select",
    transferred_at: "2026-08-09T12:00:00.000Z",
    notes: null,
    from_name: "Oxus Ltd",
    to_name: "Select Me Ltd",
  },
];

describe("userHasAllSubcompanyScope", () => {
  it("returns true only for all scope", () => {
    expect(userHasAllSubcompanyScope("all")).toBe(true);
    expect(userHasAllSubcompanyScope("explicit")).toBe(false);
    expect(userHasAllSubcompanyScope(null)).toBe(false);
  });
});

describe("findTransferOutFromSubcompany", () => {
  it("returns transfer when vehicle left the subcompany", () => {
    expect(findTransferOutFromSubcompany(transfers, "oxus", "select")).toEqual(transfers[0]);
  });

  it("returns null when vehicle is still at the subcompany", () => {
    expect(findTransferOutFromSubcompany(transfers, "oxus", "oxus")).toBeNull();
  });

  it("returns null when no matching transfer", () => {
    expect(findTransferOutFromSubcompany(transfers, "other", "select")).toBeNull();
  });
});

describe("resolveVehicleWorkspaceAccess", () => {
  it("grants current access for all-scope staff", () => {
    expect(
      resolveVehicleWorkspaceAccess({
        vehicleSubcompanyId: "select",
        transfers,
        subcompanyScope: "all",
        accessibleSubcompanyIds: "all",
      }),
    ).toEqual({ kind: "current" });
  });

  it("grants current access when user can access current operator", () => {
    expect(
      resolveVehicleWorkspaceAccess({
        vehicleSubcompanyId: "select",
        transfers,
        subcompanyScope: "explicit",
        accessibleSubcompanyIds: ["select"],
      }),
    ).toEqual({ kind: "current" });
  });

  it("grants historic access for source subcompany staff", () => {
    const access = resolveVehicleWorkspaceAccess({
      vehicleSubcompanyId: "select",
      transfers,
      subcompanyScope: "explicit",
      accessibleSubcompanyIds: ["oxus"],
    });
    expect(access).toEqual({
      kind: "historic",
      historicSubcompanyId: "oxus",
      transfer: transfers[0],
    });
  });

  it("denies access when user has no current or historic link", () => {
    expect(
      resolveVehicleWorkspaceAccess({
        vehicleSubcompanyId: "select",
        transfers,
        subcompanyScope: "explicit",
        accessibleSubcompanyIds: ["unrelated"],
      }),
    ).toEqual({ kind: "denied" });
  });
});

describe("shouldShowCurrentVehicleDocuments", () => {
  it("hides current docs in historic mode", () => {
    expect(shouldShowCurrentVehicleDocuments({ kind: "current" })).toBe(true);
    expect(
      shouldShowCurrentVehicleDocuments({
        kind: "historic",
        historicSubcompanyId: "oxus",
        transfer: transfers[0]!,
      }),
    ).toBe(false);
  });
});
