/** Shared vehicle fleet types and helpers (client + server safe). */

export const VEHICLE_STATUSES = [
  "available",
  "on_rent",
  "reserved",
  "repair",
  "accident_claim",
  "sold",
] as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  available: "Available",
  on_rent: "On rent",
  reserved: "Reserved",
  repair: "Repair",
  accident_claim: "Accident claim",
  sold: "Sold",
};

export const OWNERSHIP_EVENT_TYPES = ["purchase", "sale"] as const;
export type OwnershipEventType = (typeof OWNERSHIP_EVENT_TYPES)[number];

export const OWNERSHIP_EVENT_LABELS: Record<OwnershipEventType, string> = {
  purchase: "Purchase",
  sale: "Sale",
};

export function isOwnershipEventType(v: string): v is OwnershipEventType {
  return (OWNERSHIP_EVENT_TYPES as readonly string[]).includes(v);
}

export type VehicleOwnershipEventRow = {
  id: string;
  vehicle_id: string;
  parent_company_id: string;
  subcompany_id: string;
  event_type: OwnershipEventType;
  occurred_on: string;
  amount_gbp: number;
  counterparty: string;
  payment_method_id: string | null;
  payment_account_id: string | null;
  payment_reference: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
  payment_method_name?: string | null;
  payment_account_name?: string | null;
};

export const VEHICLE_DOC_TYPES = [
  "mot",
  "logbook",
  "phv_taxi_licence_paper",
  /** @deprecated Prefer phv_taxi_licence_paper — kept for reading legacy rows. */
  "pco_paper",
  "phv_licence",
  "insurance",
  "permission_letter",
  "photo",
  "other",
] as const;

export type VehicleDocType = (typeof VEHICLE_DOC_TYPES)[number];

export const VEHICLE_DOC_TYPE_LABELS: Record<VehicleDocType, string> = {
  mot: "MOT",
  logbook: "Logbook (V5C)",
  phv_taxi_licence_paper: "PHV/Taxi licence paper",
  pco_paper: "PHV/Taxi licence paper",
  phv_licence: "PHV/Taxi licence",
  insurance: "Insurance",
  permission_letter: "Permission letter",
  photo: "Vehicle photo",
  other: "Other",
};

/** Required compliance pack for every fleet vehicle. */
export const REQUIRED_VEHICLE_DOC_TYPES = ["mot", "logbook", "phv_taxi_licence_paper"] as const;
export type RequiredVehicleDocType = (typeof REQUIRED_VEHICLE_DOC_TYPES)[number];

/** Document types shown on the compliance Documents step. */
export const VEHICLE_COMPLIANCE_DOC_TYPES = REQUIRED_VEHICLE_DOC_TYPES;

/** Legacy rows that still count as the PHV/Taxi licence paper slot. */
const PHV_TAXI_PAPER_ALIASES = new Set(["phv_taxi_licence_paper", "pco_paper", "phv_licence"]);

export function isPhvTaxiLicencePaperDocType(docType: string): boolean {
  return PHV_TAXI_PAPER_ALIASES.has(docType.toLowerCase());
}

export function missingRequiredDocTypes(presentTypes: Iterable<string>): RequiredVehicleDocType[] {
  const have = new Set([...presentTypes].map((t) => t.toLowerCase()));
  if ([...have].some((t) => isPhvTaxiLicencePaperDocType(t))) {
    have.add("phv_taxi_licence_paper");
  }
  return REQUIRED_VEHICLE_DOC_TYPES.filter((t) => !have.has(t));
}

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
  gps_primary_imei: string | null;
  gps_secondary_imei: string | null;
  /** Set when MOT maintenance logged; cleared on MOT doc upload or confirm. */
  mot_doc_attention_at: string | null;
  /** Set when PHV maintenance logged; cleared on PHV paper upload or confirm. */
  phv_doc_attention_at: string | null;
  created_at: string;
  updated_at: string;
  subcompany_name?: string | null;
  /** Required doc types still missing (MOT / logbook / PHV/Taxi licence paper). */
  missing_docs?: RequiredVehicleDocType[];
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
