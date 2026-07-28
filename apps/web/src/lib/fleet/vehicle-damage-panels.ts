/** Exterior panel zones for hire checkout / check-in damage marking. */

import {
  getHireInspectionPanel,
  getHireInspectionPanelPin,
  HIRE_INSPECTION_DIAGRAM_VIEWBOX,
  HIRE_INSPECTION_PANELS,
  isValidHireInspectionPanelId,
  type HireInspectionPanel,
} from "@/lib/fleet/hire-inspection-diagram";

export const VEHICLE_DAMAGE_DIAGRAM_VIEWBOX = HIRE_INSPECTION_DIAGRAM_VIEWBOX;

export const HIRE_DAMAGE_TYPES = ["scratch", "dent", "chip", "crack", "scuff", "other"] as const;
export type HireDamageType = (typeof HIRE_DAMAGE_TYPES)[number];

export const HIRE_DAMAGE_SEVERITIES = ["minor", "moderate", "major"] as const;
export type HireDamageSeverity = (typeof HIRE_DAMAGE_SEVERITIES)[number];

export const HIRE_INSPECTION_KINDS = ["checkout", "checkin"] as const;
export type HireInspectionKind = (typeof HIRE_INSPECTION_KINDS)[number];

export type VehicleDamagePanel = HireInspectionPanel;

export const VEHICLE_DAMAGE_PANELS: readonly VehicleDamagePanel[] = HIRE_INSPECTION_PANELS;

export function getVehicleDamagePanel(panelId: string): VehicleDamagePanel | null {
  return getHireInspectionPanel(panelId);
}

export function isValidVehicleDamagePanelId(panelId: string): boolean {
  return isValidHireInspectionPanelId(panelId);
}

export function getPanelPinPosition(
  panelId: string,
  viewId?: string | null,
): { pinX: number; pinY: number } | null {
  return getHireInspectionPanelPin(panelId, viewId);
}

export function hireDamageTypeLabel(type: HireDamageType): string {
  const labels: Record<HireDamageType, string> = {
    scratch: "Scratch",
    dent: "Dent",
    chip: "Chip",
    crack: "Crack",
    scuff: "Scuff",
    other: "Other",
  };
  return labels[type];
}

export function hireDamageSeverityLabel(severity: HireDamageSeverity): string {
  const labels: Record<HireDamageSeverity, string> = {
    minor: "Minor",
    moderate: "Moderate",
    major: "Major",
  };
  return labels[severity];
}

export function hireDamageSeverityPinClass(severity: HireDamageSeverity): string {
  if (severity === "minor") return "fill-amber-500 stroke-amber-700";
  if (severity === "moderate") return "fill-orange-500 stroke-orange-700";
  return "fill-red-500 stroke-red-700";
}

export function hireDamageSeverityTextClass(severity: HireDamageSeverity): string {
  if (severity === "minor") return "text-amber-700 dark:text-amber-300";
  if (severity === "moderate") return "text-orange-700 dark:text-orange-300";
  return "text-red-700 dark:text-red-300";
}

export function panelPinOffset(indexOnPanel: number): { dx: number; dy: number } {
  const offsets = [
    { dx: 0, dy: 0 },
    { dx: 8, dy: -6 },
    { dx: -8, dy: 6 },
    { dx: 10, dy: 8 },
    { dx: -10, dy: -8 },
  ];
  return offsets[indexOnPanel % offsets.length]!;
}
