import { formatUkDateText } from "@/lib/datetime/uk";
import {
  vehicleExpiryAttentionItems,
  type VehicleExpiryItem,
  type VehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";
import type { VehicleRow } from "@/lib/fleet/vehicles";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";

type ComplianceCandidate = {
  label: string;
  date: string;
};

type ComplianceFields = Pick<VehicleRow, "mot_expiry" | "tax_expiry" | "phv_licence_expiry">;

/** Soonest MOT / tax / PHV date for fleet list “Next compliance” column. */
export function vehicleNextComplianceLabel(vehicle: ComplianceFields): string {
  const candidates: ComplianceCandidate[] = [];
  if (vehicle.mot_expiry?.trim()) {
    candidates.push({ label: "MOT", date: vehicle.mot_expiry.trim().slice(0, 10) });
  }
  if (vehicle.tax_expiry?.trim()) {
    candidates.push({ label: "Tax", date: vehicle.tax_expiry.trim().slice(0, 10) });
  }
  if (vehicle.phv_licence_expiry?.trim()) {
    candidates.push({ label: "PHV", date: vehicle.phv_licence_expiry.trim().slice(0, 10) });
  }
  if (!candidates.length) return "—";
  candidates.sort((a, b) => a.date.localeCompare(b.date));
  const next = candidates[0]!;
  return `${next.label} ${formatUkDateText(next.date)}`;
}

/** Prefer expired items, then soonest-to-expire. */
export function mostUrgentVehicleExpiryItem(
  items: VehicleExpiryItem[],
): VehicleExpiryItem | null {
  if (!items.length) return null;
  return [...items].sort((a, b) => {
    if (a.tone !== b.tone) {
      if (a.tone === "expired") return -1;
      if (b.tone === "expired") return 1;
    }
    const ad = a.daysUntil ?? Number.POSITIVE_INFINITY;
    const bd = b.daysUntil ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  })[0]!;
}

/**
 * Fleet list “Next expiry” cell: attention message when overdue/soon,
 * otherwise soonest compliance date (e.g. “MOT 30 Mar 2027”).
 */
export function vehicleListNextExpiryDisplay(
  vehicle: ComplianceFields,
  settings: CompanyNotificationSettings,
): { label: string; tone: VehicleExpiryTone } {
  const urgent = mostUrgentVehicleExpiryItem(vehicleExpiryAttentionItems(vehicle, settings));
  if (urgent) {
    return { label: urgent.message, tone: urgent.tone };
  }
  return { label: vehicleNextComplianceLabel(vehicle), tone: "ok" };
}
