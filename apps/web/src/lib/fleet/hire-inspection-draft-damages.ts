import type { HireInspectionDamageRow } from "@/lib/fleet/hire-inspection-lifecycle";
import type { HireInspectionDamageChargeResolution } from "@/lib/fleet/hire-inspection-damage-charges";

export type HireInspectionDraftDamage = HireInspectionDamageRow & {
  chargeGbp: number | null;
  chargeResolution: HireInspectionDamageChargeResolution | null;
};

export function newLocalDamageId(): string {
  return `local:${crypto.randomUUID()}`;
}

export function isLocalDamageId(id: string): boolean {
  return id.startsWith("local:");
}

export function mapInspectionDamagesToDraft(
  damages: Array<{
    id: string;
    panelId: string;
    damageType: HireInspectionDraftDamage["damageType"];
    severity: HireInspectionDraftDamage["severity"];
    notes: string | null;
    checkoutDamageId: string | null;
    diagramView: HireInspectionDraftDamage["diagramView"];
    pinX: number | null;
    pinY: number | null;
    chargeGbp?: number | null;
    chargeResolution?: HireInspectionDamageChargeResolution | null;
  }>,
): HireInspectionDraftDamage[] {
  return damages.map((damage) => ({
    id: damage.id,
    panelId: damage.panelId,
    damageType: damage.damageType,
    severity: damage.severity,
    notes: damage.notes,
    checkoutDamageId: damage.checkoutDamageId,
    diagramView: damage.diagramView,
    pinX: damage.pinX,
    pinY: damage.pinY,
    chargeGbp: damage.chargeGbp ?? null,
    chargeResolution: damage.chargeResolution ?? null,
  }));
}

/** Carry checkout damages into an empty or partial check-in draft as pre-existing rows. */
export function seedCheckinDamagesFromCheckout(
  checkinDamages: HireInspectionDraftDamage[],
  checkoutDamages: Array<{
    id: string;
    panelId: string;
    damageType: HireInspectionDraftDamage["damageType"];
    severity: HireInspectionDraftDamage["severity"];
    notes: string | null;
    diagramView: HireInspectionDraftDamage["diagramView"];
    pinX: number | null;
    pinY: number | null;
  }>,
): HireInspectionDraftDamage[] {
  if (!checkoutDamages.length) return checkinDamages;

  const representedCheckoutIds = new Set(
    checkinDamages.map((damage) => damage.checkoutDamageId).filter(Boolean) as string[],
  );
  const seeded = [...checkinDamages];

  for (const checkout of checkoutDamages) {
    if (representedCheckoutIds.has(checkout.id)) continue;
    seeded.push({
      id: newLocalDamageId(),
      panelId: checkout.panelId,
      damageType: checkout.damageType,
      severity: checkout.severity,
      notes: checkout.notes,
      checkoutDamageId: checkout.id,
      diagramView: checkout.diagramView,
      pinX: checkout.pinX,
      pinY: checkout.pinY,
      chargeGbp: null,
      chargeResolution: null,
    });
  }

  return seeded;
}

export function draftDamageToSaveInput(damage: HireInspectionDraftDamage) {
  return {
    id: isLocalDamageId(damage.id) ? null : damage.id,
    panelId: damage.panelId,
    damageType: damage.damageType,
    severity: damage.severity,
    notes: damage.notes,
    checkoutDamageId: damage.checkoutDamageId,
    diagramView: damage.diagramView,
    pinX: damage.pinX,
    pinY: damage.pinY,
    chargeGbp: damage.chargeGbp,
    chargeResolution: damage.chargeResolution,
  };
}
