import { agreementHasIssuedPdf } from "@/lib/rental/subcompany-hire-document-impact";

export const VEHICLE_TRANSFER_FLEET_DOC_KINDS = [
  "logbook",
  "phv_taxi_licence_paper",
  "insurance",
  "mot",
] as const;

export type VehicleTransferFleetDocKind = (typeof VEHICLE_TRANSFER_FLEET_DOC_KINDS)[number];

export const VEHICLE_TRANSFER_HIRE_DOC_KINDS = [
  "hire_agreement",
  "permission_letter",
  "inspection_checkout",
  "inspection_checkin",
] as const;

export type VehicleTransferHireDocKind = (typeof VEHICLE_TRANSFER_HIRE_DOC_KINDS)[number];

export type VehicleTransferDocumentKind = VehicleTransferFleetDocKind | VehicleTransferHireDocKind;

export const VEHICLE_TRANSFER_DOCUMENT_KIND_LABELS: Record<VehicleTransferDocumentKind, string> = {
  logbook: "Logbook (V5C)",
  phv_taxi_licence_paper: "PHV/Taxi licence paper",
  insurance: "Insurance certificate",
  mot: "MOT certificate",
  hire_agreement: "Hire agreement",
  permission_letter: "Permission letter",
  inspection_checkout: "Checkout inspection report",
  inspection_checkin: "Check-in inspection report",
};

/** Default fleet docs staff usually re-issue after a subcompany transfer. */
export const DEFAULT_VEHICLE_TRANSFER_FLEET_DOC_KINDS: readonly VehicleTransferFleetDocKind[] = [
  "logbook",
  "phv_taxi_licence_paper",
];

export type VehicleTransferDocumentOption = {
  key: string;
  documentKind: VehicleTransferDocumentKind;
  label: string;
  hireGroupId?: string | null;
  agreementId?: string | null;
  inspectionId?: string | null;
  defaultSelected: boolean;
};

type HireAgreementRow = {
  id: string;
  hire_group_id: string;
  contract_length_kind: string;
  status: string;
  signed_at?: string | null;
  signed_storage_path?: string | null;
  esign_envelope_id?: string | null;
};

type HireInspectionRow = {
  id: string;
  hire_group_id: string;
  kind: "checkout" | "checkin";
  status: string;
};

export function vehicleTransferDocumentKey(input: {
  documentKind: VehicleTransferDocumentKind;
  hireGroupId?: string | null;
  agreementId?: string | null;
  inspectionId?: string | null;
}): string {
  return [
    input.documentKind,
    input.hireGroupId ?? "",
    input.agreementId ?? "",
    input.inspectionId ?? "",
  ].join(":");
}

export function buildVehicleTransferDocumentOptions(input: {
  hireGroupId: string | null;
  agreements: HireAgreementRow[];
  inspections: HireInspectionRow[];
}): VehicleTransferDocumentOption[] {
  const options: VehicleTransferDocumentOption[] = [];

  for (const kind of DEFAULT_VEHICLE_TRANSFER_FLEET_DOC_KINDS) {
    options.push({
      key: vehicleTransferDocumentKey({ documentKind: kind }),
      documentKind: kind,
      label: VEHICLE_TRANSFER_DOCUMENT_KIND_LABELS[kind],
      defaultSelected: true,
    });
  }

  options.push({
    key: vehicleTransferDocumentKey({ documentKind: "insurance" }),
    documentKind: "insurance",
    label: VEHICLE_TRANSFER_DOCUMENT_KIND_LABELS.insurance,
    defaultSelected: false,
  });

  if (!input.hireGroupId) return options;

  for (const agreement of input.agreements) {
    if (!agreementHasIssuedPdf(agreement)) continue;
    options.push({
      key: vehicleTransferDocumentKey({
        documentKind: "hire_agreement",
        hireGroupId: input.hireGroupId,
        agreementId: agreement.id,
      }),
      documentKind: "hire_agreement",
      label: `${VEHICLE_TRANSFER_DOCUMENT_KIND_LABELS.hire_agreement} (${agreement.contract_length_kind.replace(/_/g, " ")})`,
      hireGroupId: input.hireGroupId,
      agreementId: agreement.id,
      defaultSelected: true,
    });
  }

  const checkout = input.inspections.find((row) => row.kind === "checkout" && row.status === "completed");
  if (checkout) {
    options.push({
      key: vehicleTransferDocumentKey({
        documentKind: "inspection_checkout",
        hireGroupId: input.hireGroupId,
        inspectionId: checkout.id,
      }),
      documentKind: "inspection_checkout",
      label: VEHICLE_TRANSFER_DOCUMENT_KIND_LABELS.inspection_checkout,
      hireGroupId: input.hireGroupId,
      inspectionId: checkout.id,
      defaultSelected: true,
    });
  }

  const checkin = input.inspections.find((row) => row.kind === "checkin" && row.status === "completed");
  if (checkin) {
    options.push({
      key: vehicleTransferDocumentKey({
        documentKind: "inspection_checkin",
        hireGroupId: input.hireGroupId,
        inspectionId: checkin.id,
      }),
      documentKind: "inspection_checkin",
      label: VEHICLE_TRANSFER_DOCUMENT_KIND_LABELS.inspection_checkin,
      hireGroupId: input.hireGroupId,
      inspectionId: checkin.id,
      defaultSelected: true,
    });
  }

  return options;
}
