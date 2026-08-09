import type { VehicleTransferRow } from "@/lib/fleet/vehicles";

export type VehicleWorkspaceAccess =
  | { kind: "current" }
  | {
      kind: "historic";
      historicSubcompanyId: string;
      transfer: VehicleTransferRow;
    }
  | { kind: "denied" };

export type TransferredOutVehicleSummary = {
  vehicleId: string;
  vrm: string;
  make: string;
  model: string;
  transferredAt: string;
  transferredToSubcompanyId: string;
  transferredToSubcompanyName: string | null;
};

export function userHasAllSubcompanyScope(
  subcompanyScope: "all" | "explicit" | null,
): boolean {
  return subcompanyScope === "all";
}

/** Most recent transfer that moved the vehicle away from `subcompanyId`. */
export function findTransferOutFromSubcompany(
  transfers: VehicleTransferRow[],
  subcompanyId: string,
  vehicleCurrentSubcompanyId: string,
): VehicleTransferRow | null {
  const fromId = subcompanyId.trim();
  if (!fromId) return null;
  if (vehicleCurrentSubcompanyId === fromId) return null;

  for (const transfer of transfers) {
    if (transfer.from_subcompany_id === fromId) return transfer;
  }
  return null;
}

export function resolveVehicleWorkspaceAccess(input: {
  vehicleSubcompanyId: string;
  transfers: VehicleTransferRow[];
  subcompanyScope: "all" | "explicit" | null;
  accessibleSubcompanyIds: string[] | "all";
}): VehicleWorkspaceAccess {
  const vehicleSubcompanyId = input.vehicleSubcompanyId.trim();
  if (!vehicleSubcompanyId) return { kind: "denied" };

  if (
    input.accessibleSubcompanyIds === "all" ||
    userHasAllSubcompanyScope(input.subcompanyScope) ||
    input.accessibleSubcompanyIds.includes(vehicleSubcompanyId)
  ) {
    return { kind: "current" };
  }

  for (const subcompanyId of input.accessibleSubcompanyIds) {
    const transfer = findTransferOutFromSubcompany(
      input.transfers,
      subcompanyId,
      vehicleSubcompanyId,
    );
    if (transfer) {
      return {
        kind: "historic",
        historicSubcompanyId: subcompanyId,
        transfer,
      };
    }
  }

  return { kind: "denied" };
}

export function isHistoricVehicleWorkspaceAccess(
  access: VehicleWorkspaceAccess,
): access is Extract<VehicleWorkspaceAccess, { kind: "historic" }> {
  return access.kind === "historic";
}

export function shouldShowCurrentVehicleDocuments(access: VehicleWorkspaceAccess): boolean {
  return access.kind === "current";
}

export function shouldShowTransferDocumentRequirements(access: VehicleWorkspaceAccess): boolean {
  return access.kind === "current";
}

export function canManageVehicleWorkspace(access: VehicleWorkspaceAccess): boolean {
  return access.kind === "current";
}

/** Label for a superseded document row using transfer metadata when present. */
export function vehicleDocumentHistoryLabel(input: {
  versionStatus?: "current" | "superseded";
  createdAt: string;
  transferFromName?: string | null;
  transferToName?: string | null;
  transferredAt?: string | null;
}): string {
  if (input.versionStatus !== "superseded") return "Current";
  if (input.transferFromName && input.transferToName) {
    return `Superseded (${input.transferFromName} → ${input.transferToName})`;
  }
  return "Superseded";
}
