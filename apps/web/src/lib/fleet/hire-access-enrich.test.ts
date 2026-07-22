import { describe, expect, it } from "vitest";
import { hireAccessSnapshotIsSparse } from "@/lib/fleet/hire-access-enrich";

describe("hireAccessSnapshotIsSparse", () => {
  it("treats empty snapshots as sparse", () => {
    expect(hireAccessSnapshotIsSparse({})).toBe(true);
  });

  it("detects a populated hire snapshot", () => {
    expect(
      hireAccessSnapshotIsSparse({
        start_date: "2026-08-01",
        rent_amount_gbp: 250,
        vehicles: { vrm: "AB12CDE" },
        companies: { name: "Acme Rentals" },
      }),
    ).toBe(false);
  });
});
