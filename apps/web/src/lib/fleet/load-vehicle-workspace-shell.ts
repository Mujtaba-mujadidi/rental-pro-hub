import { cache } from "react";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canDeleteFleet, canManageFleet } from "@/lib/auth/rental-permissions";
import {
  type VehicleDocumentRow,
  type VehicleRow,
  type VehicleTransferRow,
} from "@/lib/fleet/vehicles";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";
import { getCachedVehicleWorkspaceShellData } from "@/lib/fleet/vehicle-workspace-cache";

export type VehicleWorkspaceShell = {
  vehicle: VehicleRow;
  documents: VehicleDocumentRow[];
  transfers: VehicleTransferRow[];
  subcompanies: { id: string; name: string | null; is_primary: boolean }[];
  notifySettings: CompanyNotificationSettings;
  canManage: boolean;
  canDelete: boolean;
};

export type VehicleWorkspaceShellResult =
  | ({ ok: true } & VehicleWorkspaceShell)
  | { ok: false; error: string };

async function fetchVehicleWorkspaceShell(vehicleId: string): Promise<VehicleWorkspaceShellResult> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  const shell = await getCachedVehicleWorkspaceShellData(id, parentCompanyId);
  if (!shell) return { ok: false, error: "Vehicle not found." };

  return {
    ok: true,
    ...shell,
    canManage: canManageFleet(profile),
    canDelete: canDeleteFleet(profile),
  };
}

/** Deduped per server request (layout + any server child calling the same vehicle). */
export const getVehicleWorkspaceShell = cache(fetchVehicleWorkspaceShell);
