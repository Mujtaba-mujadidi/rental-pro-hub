import type { HireInspectionDamageRow } from "@/lib/fleet/hire-inspection-lifecycle";

export type HireInspectionDraftDamage = HireInspectionDamageRow;

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
  }));
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
  };
}
