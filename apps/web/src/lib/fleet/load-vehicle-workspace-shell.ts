import { cache } from "react";
import { loadUserAccessibleSubcompanyIds } from "@/lib/auth/rental-subcompany-access";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canDeleteFleet, canManageFleet } from "@/lib/auth/rental-permissions";
import {
  type VehicleDocumentRow,
  type VehicleRow,
  type VehicleTransferRow,
} from "@/lib/fleet/vehicles";
import {
  canManageVehicleWorkspace,
  isHistoricVehicleWorkspaceAccess,
  resolveVehicleWorkspaceAccess,
  shouldShowCurrentVehicleDocuments,
  shouldShowTransferDocumentRequirements,
  type VehicleWorkspaceAccess,
} from "@/lib/fleet/vehicle-historic-access";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";
import type { VehicleTransferOpenRequirement } from "@/lib/fleet/vehicle-transfer-document-requirements";
import { getCachedVehicleWorkspaceShellData } from "@/lib/fleet/vehicle-workspace-cache";

export type VehicleWorkspaceShell = {
  vehicle: VehicleRow;
  documents: VehicleDocumentRow[];
  documentHistory: VehicleDocumentRow[];
  transfers: VehicleTransferRow[];
  transferDocumentRequirements: VehicleTransferOpenRequirement[];
  subcompanies: { id: string; name: string | null; is_primary: boolean }[];
  notifySettings: CompanyNotificationSettings;
  access: VehicleWorkspaceAccess;
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

  const [shell, accessibleSubcompanyIds] = await Promise.all([
    getCachedVehicleWorkspaceShellData(id, parentCompanyId),
    loadUserAccessibleSubcompanyIds(profile),
  ]);
  if (!shell) return { ok: false, error: "Vehicle not found." };

  const access = resolveVehicleWorkspaceAccess({
    vehicleSubcompanyId: shell.vehicle.subcompany_id,
    transfers: shell.transfers,
    subcompanyScope: profile.subcompany_scope,
    accessibleSubcompanyIds,
  });
  if (access.kind === "denied") return { ok: false, error: "Vehicle not found." };

  const documents = shouldShowCurrentVehicleDocuments(access) ? shell.documents : [];
  const documentHistory = shell.documentHistory;
  const transferDocumentRequirements = shouldShowTransferDocumentRequirements(access)
    ? shell.transferDocumentRequirements
    : [];

  const canManageBase = canManageFleet(profile) && canManageVehicleWorkspace(access);
  const canDeleteBase = canDeleteFleet(profile) && canManageVehicleWorkspace(access);

  return {
    ok: true,
    vehicle: shell.vehicle,
    documents,
    documentHistory,
    transfers: shell.transfers,
    transferDocumentRequirements,
    subcompanies: shell.subcompanies,
    notifySettings: shell.notifySettings,
    access,
    canManage: canManageBase,
    canDelete: canDeleteBase,
  };
}

export { isHistoricVehicleWorkspaceAccess };

/** Deduped per server request (layout + any server child calling the same vehicle). */
export const getVehicleWorkspaceShell = cache(fetchVehicleWorkspaceShell);
