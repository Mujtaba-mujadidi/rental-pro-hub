import type { VehicleWorkspaceAccess } from "@/lib/fleet/vehicle-historic-access";
import type { VehicleTransferOpenRequirement } from "@/lib/fleet/vehicle-transfer-document-requirements";
import type {
  VehicleDocumentRow,
  VehicleRow,
  VehicleTransferRow,
} from "@/lib/fleet/vehicles";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";

/** Client-safe shell shape shared by server loaders and vehicle workspace UI. */
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
