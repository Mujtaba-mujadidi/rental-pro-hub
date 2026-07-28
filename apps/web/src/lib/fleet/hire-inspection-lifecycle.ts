import type { HireDamageSeverity, HireDamageType } from "@/lib/fleet/vehicle-damage-panels";
import type { HireInspectionDiagramViewId } from "@/lib/fleet/hire-inspection-diagram";

export type HireInspectionDamageRow = {
  id: string;
  panelId: string;
  damageType: HireDamageType;
  severity: HireDamageSeverity;
  notes: string | null;
  checkoutDamageId: string | null;
  diagramView: HireInspectionDiagramViewId | null;
  pinX: number | null;
  pinY: number | null;
};

export type HireInspectionDiffDamage = HireInspectionDamageRow & {
  diffStatus: "new" | "pre_existing";
};

export type HireInspectionDiffResult = {
  checkoutDamages: HireInspectionDamageRow[];
  checkinDamages: HireInspectionDiffDamage[];
  newDamages: HireInspectionDiffDamage[];
  preExistingDamages: HireInspectionDiffDamage[];
};

/** Classify check-in damages against checkout baseline. */
export function buildHireInspectionDiff(
  checkoutDamages: HireInspectionDamageRow[],
  checkinDamages: HireInspectionDamageRow[],
): HireInspectionDiffResult {
  const checkoutIds = new Set(checkoutDamages.map((d) => d.id));

  const classified: HireInspectionDiffDamage[] = checkinDamages.map((damage) => {
    const linked =
      damage.checkoutDamageId != null && checkoutIds.has(damage.checkoutDamageId);
    return {
      ...damage,
      diffStatus: linked ? "pre_existing" : "new",
    };
  });

  return {
    checkoutDamages,
    checkinDamages: classified,
    newDamages: classified.filter((d) => d.diffStatus === "new"),
    preExistingDamages: classified.filter((d) => d.diffStatus === "pre_existing"),
  };
}

export function canCompleteHireCheckout(input: {
  mediaCount: number;
  hireStatus: string;
}): { ok: true } | { ok: false; error: string } {
  if (
    input.hireStatus !== "reserved" &&
    input.hireStatus !== "active" &&
    input.hireStatus !== "terminated"
  ) {
    return { ok: false, error: "Checkout is not available for this hire." };
  }
  if (input.mediaCount < 1) {
    return { ok: false, error: "Add at least one vehicle photo before completing checkout." };
  }
  return { ok: true };
}

export function canCompleteHireCheckin(input: {
  mediaCount: number;
  hireStatus: string;
  checkoutCompleted: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (!input.checkoutCompleted) {
    return { ok: false, error: "Checkout must be completed before check-in." };
  }
  if (input.hireStatus !== "terminated") {
    return { ok: false, error: "Check-in is only available after the contract has ended." };
  }
  if (input.mediaCount < 1) {
    return { ok: false, error: "Add at least one vehicle photo before completing check-in." };
  }
  return { ok: true };
}
