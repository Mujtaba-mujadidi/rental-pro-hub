import {
  HIRE_INSPECTION_ACCESSORY_KEYS,
  formatAccessoryPresence,
  hireInspectionAccessoryLabel,
  type HireInspectionAccessories,
} from "@/lib/fleet/hire-inspection-accessories";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";
import {
  hireDamageSeverityLabel,
  hireDamageTypeLabel,
  type HireInspectionKind,
} from "@/lib/fleet/vehicle-damage-panels";
import { formatUkDateTime } from "@/lib/datetime/uk";

export type HireInspectionReportDamage = {
  panelLabel: string;
  damageType: string;
  severity: string;
  notes?: string | null;
};

export type HireInspectionReportInput = {
  kind: HireInspectionKind;
  vehicleLabel: string;
  completedAt: string | null;
  odometerReading: number | null;
  fuelLevel: number | null;
  accessories: HireInspectionAccessories;
  generalNotes: string | null;
  damages: HireInspectionReportDamage[];
  photoCount: number;
};

export function hireInspectionReportTitle(kind: HireInspectionKind): string {
  return kind === "checkout" ? "Vehicle checkout report" : "Vehicle check-in report";
}

export function hireInspectionReportFileName(kind: HireInspectionKind, vehicleLabel: string): string {
  const safe = vehicleLabel.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "vehicle";
  return `${kind}-${safe}.pdf`;
}

/** Vehicle odometer, fuel, and photo count — rendered on a dedicated PDF page. */
export function buildHireInspectionReportReadingsSection(input: HireInspectionReportInput): string[] {
  return [
    "Vehicle readings",
    `Odometer: ${input.odometerReading != null ? `${input.odometerReading} mi` : "Not recorded"}`,
    `Fuel: ${formatHireFuelLevelPercent(input.fuelLevel)}`,
    `Photos: ${input.photoCount}`,
  ];
}

/** Vehicle kit checklist. */
export function buildHireInspectionReportKitSection(input: HireInspectionReportInput): string[] {
  return [
    "Vehicle kit",
    ...HIRE_INSPECTION_ACCESSORY_KEYS.map(
      (key) => `${hireInspectionAccessoryLabel(key)}: ${formatAccessoryPresence(input.accessories[key])}`,
    ),
  ];
}

/** Numbered damage lines for the diagram page. */
export function buildHireInspectionReportDamageSection(input: HireInspectionReportInput): string[] {
  if (input.damages.length) {
    return [
      "Damage",
      ...input.damages.map((d, i) => {
        const line = `#${i + 1} ${d.panelLabel} · ${hireDamageTypeLabel(d.damageType as never)} · ${hireDamageSeverityLabel(d.severity as never)}`;
        return d.notes?.trim() ? `${line} — ${d.notes.trim()}` : line;
      }),
    ];
  }
  return ["Damage", "No damage recorded."];
}

export function buildHireInspectionReportNotesSection(input: HireInspectionReportInput): string[] | null {
  if (!input.generalNotes?.trim()) return null;
  return ["Notes", input.generalNotes.trim()];
}

/** Kit and notes — rendered on the readings page (damage is on the diagram page). */
export function buildHireInspectionReportFindingsSections(input: HireInspectionReportInput): string[][] {
  const sections: string[][] = [buildHireInspectionReportKitSection(input)];
  const notes = buildHireInspectionReportNotesSection(input);
  if (notes) sections.push(notes);
  return sections;
}

/** Inspection findings sections (readings, kit, damage, notes) — no title or hire header. */
export function buildHireInspectionReportContentSections(input: HireInspectionReportInput): string[][] {
  const sections: string[][] = [
    buildHireInspectionReportReadingsSection(input),
    buildHireInspectionReportKitSection(input),
    buildHireInspectionReportDamageSection(input),
  ];
  const notes = buildHireInspectionReportNotesSection(input);
  if (notes) sections.push(notes);
  return sections;
}

/** Plain-text sections for PDF export (and unit tests). */
export function buildHireInspectionReportSections(input: HireInspectionReportInput): string[][] {
  const title = hireInspectionReportTitle(input.kind);
  const completed = input.completedAt ? [`Completed: ${formatUkDateTime(input.completedAt)}`] : [];
  return [
    [title, input.vehicleLabel],
    ...(completed.length ? [completed] : []),
    ...buildHireInspectionReportContentSections(input),
  ].filter((section) => section.length > 0);
}
