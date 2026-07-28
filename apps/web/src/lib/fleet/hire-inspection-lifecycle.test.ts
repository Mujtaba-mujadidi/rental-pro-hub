import { describe, expect, it } from "vitest";
import {
  buildHireInspectionDiff,
  canCompleteHireCheckin,
  canCompleteHireCheckout,
} from "@/lib/fleet/hire-inspection-lifecycle";

const checkoutDamage = {
  id: "c1",
  panelId: "front_bumper",
  damageType: "scratch" as const,
  severity: "minor" as const,
  notes: null,
  checkoutDamageId: null,
  diagramView: null,
  pinX: null,
  pinY: null,
};

describe("buildHireInspectionDiff", () => {
  it("flags linked damages as pre-existing", () => {
    const diff = buildHireInspectionDiff([checkoutDamage], [
      {
        id: "n1",
        panelId: "front_bumper",
        damageType: "scratch",
        severity: "minor",
        notes: null,
        checkoutDamageId: "c1",
        diagramView: null,
        pinX: null,
        pinY: null,
      },
      {
        id: "n2",
        panelId: "front_bonnet",
        damageType: "dent",
        severity: "major",
        notes: "New dent",
        checkoutDamageId: null,
        diagramView: "top",
        pinX: 537,
        pinY: 540,
      },
    ]);
    expect(diff.preExistingDamages).toHaveLength(1);
    expect(diff.newDamages).toHaveLength(1);
    expect(diff.newDamages[0]?.panelId).toBe("front_bonnet");
  });
});

describe("canCompleteHireCheckout", () => {
  it("requires reserved, active, or terminated status and photos", () => {
    expect(canCompleteHireCheckout({ hireStatus: "completed", mediaCount: 2 })).toEqual({
      ok: false,
      error: "Checkout is not available for this hire.",
    });
    expect(canCompleteHireCheckout({ hireStatus: "reserved", mediaCount: 0 })).toEqual({
      ok: false,
      error: "Add at least one vehicle photo before completing checkout.",
    });
    expect(canCompleteHireCheckout({ hireStatus: "reserved", mediaCount: 1 })).toEqual({ ok: true });
    expect(canCompleteHireCheckout({ hireStatus: "active", mediaCount: 1 })).toEqual({ ok: true });
    expect(canCompleteHireCheckout({ hireStatus: "terminated", mediaCount: 1 })).toEqual({ ok: true });
  });
});

describe("canCompleteHireCheckin", () => {
  it("requires active hire, checkout done, and photos", () => {
    expect(
      canCompleteHireCheckin({
        hireStatus: "reserved",
        checkoutCompleted: true,
        mediaCount: 2,
      }),
    ).toEqual({ ok: false, error: "Check-in is only available after the contract has ended." });
    expect(
      canCompleteHireCheckin({
        hireStatus: "terminated",
        checkoutCompleted: false,
        mediaCount: 2,
      }),
    ).toEqual({ ok: false, error: "Checkout must be completed before check-in." });
    expect(
      canCompleteHireCheckin({
        hireStatus: "terminated",
        checkoutCompleted: true,
        mediaCount: 1,
      }),
    ).toEqual({ ok: true });
  });
});
