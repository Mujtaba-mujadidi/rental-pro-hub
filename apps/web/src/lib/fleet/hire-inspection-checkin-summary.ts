import {
  HIRE_INSPECTION_ACCESSORY_KEYS,
  formatAccessoryPresence,
  hireInspectionAccessoryLabel,
  type HireInspectionAccessories,
} from "@/lib/fleet/hire-inspection-accessories";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";

export type HireInspectionVehicleComparisonRow = {
  id: string;
  label: string;
  checkoutDisplay: string;
  checkinDisplay: string;
  changed: boolean;
};

function roundMiles(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatInspectionOdometerDisplay(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "Not recorded";
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") return "Not recorded";
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(n) || n < 0) return "Not recorded";
  return `${roundMiles(n)} mi`;
}

function parseOdometerMiles(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") return null;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMiles(n);
}

function normalizeNotes(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function summarizeCheckinVehicleChanges(input: {
  checkoutOdometer: number | null;
  checkoutFuelLevel: number | null;
  checkoutAccessories: HireInspectionAccessories;
  checkoutNotes: string | null;
  checkoutMediaCount: number;
  checkinOdometer: string;
  checkinFuelLevel: number | null;
  checkinAccessories: HireInspectionAccessories;
  checkinNotes: string;
  checkinMediaCount: number;
}): {
  rows: HireInspectionVehicleComparisonRow[];
  accessoryChanges: HireInspectionVehicleComparisonRow[];
  odometerDeltaMiles: number | null;
  hasAnyChange: boolean;
} {
  const checkoutOdometerDisplay = formatInspectionOdometerDisplay(input.checkoutOdometer);
  const checkinOdometerDisplay = formatInspectionOdometerDisplay(input.checkinOdometer);
  const checkoutFuelDisplay =
    input.checkoutFuelLevel != null
      ? formatHireFuelLevelPercent(input.checkoutFuelLevel)
      : "Not recorded";
  const checkinFuelDisplay =
    input.checkinFuelLevel != null
      ? formatHireFuelLevelPercent(input.checkinFuelLevel)
      : "Not recorded";
  const checkoutNotesDisplay = normalizeNotes(input.checkoutNotes) || "None";
  const checkinNotesDisplay = normalizeNotes(input.checkinNotes) || "None";

  const checkoutOdometerMiles = parseOdometerMiles(input.checkoutOdometer);
  const checkinOdometerMiles = parseOdometerMiles(input.checkinOdometer);
  const odometerDeltaMiles =
    checkoutOdometerMiles != null && checkinOdometerMiles != null
      ? roundMiles(checkinOdometerMiles - checkoutOdometerMiles)
      : null;

  const rows: HireInspectionVehicleComparisonRow[] = [
    {
      id: "odometer",
      label: "Odometer",
      checkoutDisplay: checkoutOdometerDisplay,
      checkinDisplay: checkinOdometerDisplay,
      changed: checkoutOdometerDisplay !== checkinOdometerDisplay,
    },
    {
      id: "fuel",
      label: "Fuel level",
      checkoutDisplay: checkoutFuelDisplay,
      checkinDisplay: checkinFuelDisplay,
      changed: checkoutFuelDisplay !== checkinFuelDisplay,
    },
    {
      id: "photos",
      label: "Photos",
      checkoutDisplay: `${input.checkoutMediaCount}`,
      checkinDisplay: `${input.checkinMediaCount}`,
      changed: input.checkoutMediaCount !== input.checkinMediaCount,
    },
    {
      id: "notes",
      label: "Notes",
      checkoutDisplay: checkoutNotesDisplay,
      checkinDisplay: checkinNotesDisplay,
      changed: checkoutNotesDisplay !== checkinNotesDisplay,
    },
  ];

  const accessoryChanges: HireInspectionVehicleComparisonRow[] = [];
  for (const key of HIRE_INSPECTION_ACCESSORY_KEYS) {
    const checkoutValue = input.checkoutAccessories[key];
    const checkinValue = input.checkinAccessories[key];
    const checkoutDisplay = formatAccessoryPresence(checkoutValue);
    const checkinDisplay = formatAccessoryPresence(checkinValue);
    if (checkoutDisplay === checkinDisplay) continue;
    accessoryChanges.push({
      id: key,
      label: hireInspectionAccessoryLabel(key),
      checkoutDisplay,
      checkinDisplay,
      changed: true,
    });
  }

  const hasAnyChange =
    rows.some((row) => row.changed) || accessoryChanges.length > 0;

  return {
    rows,
    accessoryChanges,
    odometerDeltaMiles,
    hasAnyChange,
  };
}
