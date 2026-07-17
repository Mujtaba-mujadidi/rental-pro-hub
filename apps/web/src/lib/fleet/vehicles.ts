/** Shared vehicle fleet types and helpers (client + server safe). */

export const VEHICLE_STATUSES = [
  "available",
  "on_rent",
  "reserved",
  "repair",
  "accident_claim",
] as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  available: "Available",
  on_rent: "On rent",
  reserved: "Reserved",
  repair: "Repair",
  accident_claim: "Accident claim",
};

export const VEHICLE_DOC_TYPES = [
  "mot",
  "phv_licence",
  "logbook",
  "insurance",
  "permission_letter",
  "photo",
  "other",
] as const;

export type VehicleDocType = (typeof VEHICLE_DOC_TYPES)[number];

export const VEHICLE_DOC_TYPE_LABELS: Record<VehicleDocType, string> = {
  mot: "MOT",
  phv_licence: "PHV licence",
  logbook: "Logbook (V5C)",
  insurance: "Insurance",
  permission_letter: "Permission letter",
  photo: "Vehicle photo",
  other: "Other",
};

/** Document types shown on the compliance Documents step (not photos). */
export const VEHICLE_COMPLIANCE_DOC_TYPES = VEHICLE_DOC_TYPES.filter((t) => t !== "photo");

/** Uppercase VRM with spaces/hyphens removed. */
export function normalizeVrm(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function isVehicleStatus(v: string): v is VehicleStatus {
  return (VEHICLE_STATUSES as readonly string[]).includes(v);
}

export function isVehicleDocType(v: string): v is VehicleDocType {
  return (VEHICLE_DOC_TYPES as readonly string[]).includes(v);
}

export type VehicleRow = {
  id: string;
  parent_company_id: string;
  subcompany_id: string;
  vrm: string;
  make: string;
  model: string;
  colour: string | null;
  first_reg_date: string | null;
  first_reg_uk_date: string | null;
  fuel_type: string | null;
  seats: number | null;
  cc: number | null;
  mot_expiry: string | null;
  tax_expiry: string | null;
  phv_licence_no: string | null;
  phv_licence_expiry: string | null;
  licensing_authority_name: string | null;
  status: VehicleStatus;
  vehicle_age_limit_years: number | null;
  service_due_at: string | null;
  current_mileage: number | null;
  next_service_mileage: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  subcompany_name?: string | null;
};

export type VehicleDocumentRow = {
  id: string;
  vehicle_id: string;
  doc_type: VehicleDocType;
  file_path: string;
  file_name: string | null;
  content_type: string | null;
  expiry_date: string | null;
  issued_date: string | null;
  notes: string | null;
  created_at: string;
};

export type VehicleTransferRow = {
  id: string;
  vehicle_id: string;
  from_subcompany_id: string;
  to_subcompany_id: string;
  transferred_at: string;
  notes: string | null;
  from_name?: string | null;
  to_name?: string | null;
};
