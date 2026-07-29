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

/** Plain-text sections for PDF export (and unit tests). */
export function buildHireInspectionReportSections(input: HireInspectionReportInput): string[][] {
  const title = hireInspectionReportTitle(input.kind);
  const sections: string[][] = [
    [title, input.vehicleLabel],
    input.completedAt ? [`Completed: ${formatUkDateTime(input.completedAt)}`] : [],
    [
      "Vehicle readings",
      `Odometer: ${input.odometerReading != null ? `${input.odometerReading} mi` : "Not recorded"}`,
      `Fuel: ${formatHireFuelLevelPercent(input.fuelLevel)}`,
      `Photos: ${input.photoCount}`,
    ],
    [
      "Vehicle kit",
      ...HIRE_INSPECTION_ACCESSORY_KEYS.map(
        (key) => `${hireInspectionAccessoryLabel(key)}: ${formatAccessoryPresence(input.accessories[key])}`,
      ),
    ],
  ];

  if (input.damages.length) {
    sections.push([
      "Damage",
      ...input.damages.map((d, i) => {
        const line = `#${i + 1} ${d.panelLabel} · ${hireDamageTypeLabel(d.damageType as never)} · ${hireDamageSeverityLabel(d.severity as never)}`;
        return d.notes?.trim() ? `${line} — ${d.notes.trim()}` : line;
      }),
    ]);
  } else {
    sections.push(["Damage", "No damage recorded."]);
  }

  if (input.generalNotes?.trim()) {
    sections.push(["Notes", input.generalNotes.trim()]);
  }

  return sections.filter((section) => section.length > 0);
}
