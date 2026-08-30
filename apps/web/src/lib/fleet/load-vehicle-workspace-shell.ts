import { cache } from "react";
import { loadUserAccessibleSubcompanyIds } from "@/lib/auth/rental-subcompany-access";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canDeleteFleet, canManageFleet } from "@/lib/auth/rental-permissions";
import {
  canManageVehicleWorkspace,
  resolveVehicleWorkspaceAccess,
  shouldShowCurrentVehicleDocuments,
  shouldShowTransferDocumentRequirements,
} from "@/lib/fleet/vehicle-historic-access";
import { getCachedVehicleWorkspaceShellData } from "@/lib/fleet/vehicle-workspace-cache";
import type { VehicleWorkspaceShellResult } from "@/lib/fleet/vehicle-workspace-shell-types";

export type {
  VehicleWorkspaceShell,
  VehicleWorkspaceShellResult,
} from "@/lib/fleet/vehicle-workspace-shell-types";

async function fetchVehicleWorkspaceShell(vehicleId: string): Promise<VehicleWorkspaceShellResult> {
  const { profile } = await requireRentalCompanyArea();
  const parentCompanyId = profile.company_id?.trim();
  if (!parentCompanyId) return { ok: false, error: "No active company." };

  const id = vehicleId.trim();
  if (!id) return { ok: false, error: "Missing vehicle." };

  let shell;
  try {
    shell = await getCachedVehicleWorkspaceShellData(id, parentCompanyId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load vehicle workspace.";
    console.error("vehicle workspace shell load failed", id, message);
    return { ok: false, error: message };
  }

  const accessibleSubcompanyIds = await loadUserAccessibleSubcompanyIds(profile);
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
    currentOpenHire: shell.currentOpenHire,
    access,
    canManage: canManageBase,
    canDelete: canDeleteBase,
  };
}

/** Deduped per server request (layout + any server child calling the same vehicle). */
export const getVehicleWorkspaceShell = cache(fetchVehicleWorkspaceShell);
