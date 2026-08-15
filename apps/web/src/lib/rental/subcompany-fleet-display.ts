import { formatUkDateText } from "@/lib/datetime/uk";
import type { VehicleRow } from "@/lib/fleet/vehicles";

type ComplianceCandidate = {
  label: string;
  date: string;
};

/** Soonest MOT / tax / PHV date for fleet list “Next compliance” column. */
export function vehicleNextComplianceLabel(vehicle: Pick<
  VehicleRow,
  "mot_expiry" | "tax_expiry" | "phv_licence_expiry"
>): string {
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
