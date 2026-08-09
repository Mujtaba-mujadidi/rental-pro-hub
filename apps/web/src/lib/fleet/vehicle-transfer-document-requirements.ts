import {
  VEHICLE_TRANSFER_DOCUMENT_KIND_LABELS,
  VEHICLE_TRANSFER_FLEET_DOC_KINDS,
  type VehicleTransferDocumentKind,
  type VehicleTransferFleetDocKind,
} from "@/lib/fleet/vehicle-transfer-document-impact";
import { isPhvTaxiLicencePaperDocType, type VehicleDocType } from "@/lib/fleet/vehicles";

export type VehicleTransferRequirementRow = {
  id: string;
  document_kind: string;
  vehicle_transfer_id: string | null;
  hire_group_id: string | null;
  agreement_id: string | null;
  inspection_id: string | null;
};

export type VehicleTransferOpenRequirement = {
  id: string;
  documentKind: VehicleTransferDocumentKind;
  label: string;
  vehicleTransferId: string | null;
  hireGroupId: string | null;
  agreementId: string | null;
  inspectionId: string | null;
  /** Fleet doc type when the requirement is fulfilled by a vehicle document upload. */
  vehicleDocType: VehicleDocType | null;
  /** Link for hire-scoped documents (agreements, inspections). */
  href: string | null;
};

const FLEET_DOC_KIND_SET = new Set<string>(VEHICLE_TRANSFER_FLEET_DOC_KINDS);

export function isVehicleTransferFleetDocKind(value: string): value is VehicleTransferFleetDocKind {
  return FLEET_DOC_KIND_SET.has(value);
}

export function vehicleTransferFleetDocKindForVehicleDocType(
  docType: string,
): VehicleTransferFleetDocKind | null {
  if (docType === "logbook") return "logbook";
  if (docType === "mot") return "mot";
  if (docType === "insurance") return "insurance";
  if (isPhvTaxiLicencePaperDocType(docType)) return "phv_taxi_licence_paper";
  return null;
}

export function vehicleDocTypeForTransferFleetDocKind(
  kind: VehicleTransferFleetDocKind,
): VehicleDocType {
  if (kind === "phv_taxi_licence_paper") return "phv_taxi_licence_paper";
  return kind;
}

function hireRequirementHref(input: {
  documentKind: VehicleTransferDocumentKind;
  hireGroupId: string;
}): string {
  const base = `/rental/hires/${input.hireGroupId}`;
  if (input.documentKind === "inspection_checkout") return `${base}/checkout`;
  if (input.documentKind === "inspection_checkin") return `${base}/checkin`;
  return base;
}

export function mapVehicleTransferOpenRequirements(
  rows: VehicleTransferRequirementRow[],
): VehicleTransferOpenRequirement[] {
  const items: VehicleTransferOpenRequirement[] = [];

  for (const row of rows) {
    const kind = row.document_kind;
    if (!(kind in VEHICLE_TRANSFER_DOCUMENT_KIND_LABELS)) continue;

    const documentKind = kind as VehicleTransferDocumentKind;
    const fleetKind = isVehicleTransferFleetDocKind(kind) ? kind : null;
    const hireGroupId = row.hire_group_id?.trim() || null;

    items.push({
      id: row.id,
      documentKind,
      label: VEHICLE_TRANSFER_DOCUMENT_KIND_LABELS[documentKind],
      vehicleTransferId: row.vehicle_transfer_id,
      hireGroupId,
      agreementId: row.agreement_id,
      inspectionId: row.inspection_id,
      vehicleDocType: fleetKind ? vehicleDocTypeForTransferFleetDocKind(fleetKind) : null,
      href: hireGroupId && !fleetKind ? hireRequirementHref({ documentKind, hireGroupId }) : null,
    });
  }

  return items;
}

export function openTransferRequirementForVehicleDocType(
  requirements: VehicleTransferOpenRequirement[],
  docType: string,
): VehicleTransferOpenRequirement | undefined {
  const fleetKind = vehicleTransferFleetDocKindForVehicleDocType(docType);
  if (!fleetKind) return undefined;
  return requirements.find((req) => req.documentKind === fleetKind);
}
