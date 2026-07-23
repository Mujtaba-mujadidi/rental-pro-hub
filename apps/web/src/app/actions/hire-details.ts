"use server";

import { assertDriverLinkedToCompany } from "@/app/actions/rental-driver-links";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import { loadDriverPreviewBundle } from "@/lib/admin/load-driver-preview";
import { driverCanAccessVehicleDocuments } from "@/lib/fleet/driver-hire-nav";
import { CONTRACT_LENGTH_LABELS } from "@/lib/fleet/hire-access-display";
import type { ContractLengthKind } from "@/lib/fleet/hire-types";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";
import {
  REQUIRED_VEHICLE_DOC_TYPES,
  VEHICLE_DOC_TYPE_LABELS,
  type RequiredVehicleDocType,
} from "@/lib/fleet/vehicles";
import { loadHireGroupSignedDocuments, type HireSignedDocumentRow } from "@/lib/fleet/hire-signed-documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HireDetailsDocumentItem = {
  id: string;
  label: string;
  status: "on_file" | "missing";
  viewUrl: string | null;
  fileName: string | null;
};

export type HireDetailsRentalAgreement = {
  id: string;
  label: string;
  endDateLabel: string;
  statusLabel: string;
  pdfUrl: string | null;
  downloadFileName: string | null;
};

export type HireDetailsRentalCard = {
  companyName: string | null;
  startDateLabel: string;
  activatedAtLabel: string | null;
  endedAtLabel: string | null;
  rentAmountLabel: string;
  rentFrequencyLabel: string;
  depositLabel: string | null;
  agreements: HireDetailsRentalAgreement[];
};

export type HireDetailsVehicleCard = {
  vrm: string;
  make: string;
  model: string;
  colour: string | null;
  fuelType: string | null;
  seats: number | null;
  cc: number | null;
  motExpiryLabel: string;
  taxExpiryLabel: string;
  phvLicenceNo: string | null;
  phvExpiryLabel: string;
};

export type HireDetailsHirerCard = {
  fullName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  drivingLicenceNumber: string | null;
  drivingLicenceExpiryLabel: string | null;
  phvLicenceExpiryLabel: string | null;
};

export type HireDetailsImportantDateRow = {
  label: string;
  value: string;
};

export type HireDetailsImportantDates = {
  vehicle: HireDetailsImportantDateRow[];
  hirer: HireDetailsImportantDateRow[];
};

export type HireDetailsPayload = {
  hireGroupId: string;
  rental: HireDetailsRentalCard;
  vehicle: HireDetailsVehicleCard;
  importantDates: HireDetailsImportantDates;
  vehicleDocuments: HireDetailsDocumentItem[];
  /** False for drivers when the hire is no longer ongoing (vehicle docs withheld). */
  vehicleDocumentsAccessible: boolean;
  hirer: HireDetailsHirerCard | null;
  hirerDocuments: HireDetailsDocumentItem[];
};

function formatAddress(parts: (string | null | undefined)[]): string | null {
  const line = parts.filter(Boolean).join(", ").trim();
  return line || null;
}

async function signVehicleDocUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filePath: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from("vehicle-documents").createSignedUrl(filePath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function signVehicleDocUrlAdmin(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  filePath: string,
): Promise<string | null> {
  const { data, error } = await admin.storage.from("vehicle-documents").createSignedUrl(filePath, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function loadVehicleDocuments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vehicleId: string,
): Promise<HireDetailsDocumentItem[]> {
  const { data: docs } = await supabase
    .from("vehicle_documents")
    .select("id, doc_type, file_name, file_path")
    .eq("vehicle_id", vehicleId);

  const byType = new Map<string, { id: string; file_name: string | null; file_path: string }>();
  for (const doc of docs ?? []) {
    byType.set(doc.doc_type as string, doc as { id: string; file_name: string | null; file_path: string });
  }

  const rows: HireDetailsDocumentItem[] = [];
  for (const docType of REQUIRED_VEHICLE_DOC_TYPES) {
    const onFile = byType.get(docType);
    const viewUrl = onFile?.file_path ? await signVehicleDocUrl(supabase, onFile.file_path) : null;
    rows.push({
      id: onFile?.id ?? docType,
      label: VEHICLE_DOC_TYPE_LABELS[docType as RequiredVehicleDocType],
      status: onFile ? "on_file" : "missing",
      viewUrl,
      fileName: onFile?.file_name ?? null,
    });
  }
  return rows;
}

async function loadVehicleDocumentsForDriver(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  vehicleId: string,
): Promise<HireDetailsDocumentItem[]> {
  const { data: docs } = await admin
    .from("vehicle_documents")
    .select("id, doc_type, file_name, file_path")
    .eq("vehicle_id", vehicleId);

  const byType = new Map<string, { id: string; file_name: string | null; file_path: string }>();
  for (const doc of docs ?? []) {
    byType.set(doc.doc_type as string, doc as { id: string; file_name: string | null; file_path: string });
  }

  const rows: HireDetailsDocumentItem[] = [];
  for (const docType of REQUIRED_VEHICLE_DOC_TYPES) {
    const onFile = byType.get(docType);
    const viewUrl = onFile?.file_path ? await signVehicleDocUrlAdmin(admin, onFile.file_path) : null;
    rows.push({
      id: onFile?.id ?? docType,
      label: VEHICLE_DOC_TYPE_LABELS[docType as RequiredVehicleDocType],
      status: onFile ? "on_file" : "missing",
      viewUrl,
      fileName: onFile?.file_name ?? null,
    });
  }
  return rows;
}

async function loadHirerDocuments(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const bundle = await loadDriverPreviewBundle(userId);
  if (!bundle) return { hirer: null, documents: [] as HireDetailsDocumentItem[] };

  const dp = bundle.dp;
  const address = formatAddress([
    dp.address_line1,
    dp.address_line2,
    dp.address_town,
    dp.address_county,
    dp.address_postcode,
  ]);

  const hirer: HireDetailsHirerCard = {
    fullName: [dp.first_name, dp.last_name].filter(Boolean).join(" ").trim() || "Driver",
    email: bundle.email,
    phone: dp.phone,
    address,
    drivingLicenceNumber: dp.driving_licence_number,
    drivingLicenceExpiryLabel: dp.driving_licence_expiry ? formatUkDate(dp.driving_licence_expiry) : null,
    phvLicenceExpiryLabel: dp.phv_licence_expiry ? formatUkDate(dp.phv_licence_expiry) : null,
  };

  const documents: HireDetailsDocumentItem[] = [
    {
      id: "driving_licence_front",
      label: "Driving licence (front)",
      status: dp.driving_licence_front_path ? "on_file" : "missing",
      viewUrl: bundle.licenceImageUrls.front,
      fileName: null,
    },
    {
      id: "driving_licence_back",
      label: "Driving licence (back)",
      status: dp.driving_licence_back_path ? "on_file" : "missing",
      viewUrl: bundle.licenceImageUrls.back,
      fileName: null,
    },
    {
      id: "phv_licence_card",
      label: "PHV/Taxi licence card",
      status: dp.phv_licence_card_path ? "on_file" : "missing",
      viewUrl: bundle.licenceImageUrls.phv,
      fileName: null,
    },
  ];

  return { hirer, documents };
}

function formatRentFrequency(cadence: unknown): string {
  const c = String(cadence ?? "").trim();
  if (c === "daily") return "Daily";
  if (c === "weekly") return "Weekly";
  if (c === "monthly") return "Monthly";
  return "—";
}

function formatRentAmount(amountGbp: unknown): string {
  const n = typeof amountGbp === "number" ? amountGbp : Number.parseFloat(String(amountGbp ?? ""));
  if (!Number.isFinite(n)) return "—";
  return `£${n.toFixed(2)}`;
}

function agreementStatusLabel(agreement: { status?: string; signed_at?: string | null }): string {
  if (agreement.signed_at) return "Signed";
  const raw = String(agreement.status ?? "").trim();
  if (!raw) return "Draft";
  return raw
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapRentalAgreements(
  agreements: {
    id?: string;
    contract_length_kind?: string;
    end_date?: string | null;
    status?: string;
    signed_at?: string | null;
    esign_envelope_id?: string | null;
  }[] | null,
  signedByEnvelope: Map<string, HireSignedDocumentRow>,
): HireDetailsRentalAgreement[] {
  if (!agreements?.length) return [];
  return agreements.map((agreement) => {
    const kind = agreement.contract_length_kind as ContractLengthKind | undefined;
    const label = kind ? (CONTRACT_LENGTH_LABELS[kind] ?? kind) : "Agreement";
    const envelopeId = agreement.esign_envelope_id?.trim() || null;
    const signed = envelopeId ? signedByEnvelope.get(envelopeId) : undefined;
    const downloadFileName = signed
      ? `${signed.lengthLabel.replace(/\s+/g, "-").toLowerCase()}-hire-agreement.pdf`
      : null;
    return {
      id: (agreement.id as string) ?? label,
      label,
      endDateLabel: formatUkDate(agreement.end_date),
      statusLabel: agreementStatusLabel(agreement),
      pdfUrl: signed?.pdfUrl ?? null,
      downloadFileName,
    };
  });
}

async function loadSignedAgreementsByEnvelope(hireGroupId: string): Promise<Map<string, HireSignedDocumentRow>> {
  try {
    const admin = createSupabaseAdminClient();
    const documents = await loadHireGroupSignedDocuments(admin, hireGroupId);
    return new Map(documents.map((doc) => [doc.envelopeId, doc]));
  } catch {
    return new Map();
  }
}

function buildRentalCard(input: {
  companyName: string | null;
  startDate: string | null | undefined;
  activatedAt: string | null | undefined;
  endedAt: string | null | undefined;
  rentAmountGbp: unknown;
  rentCadence: unknown;
  includeDeposit: boolean;
  depositGbp: unknown;
  agreements: {
    id?: string;
    contract_length_kind?: string;
    end_date?: string | null;
    status?: string;
    signed_at?: string | null;
    esign_envelope_id?: string | null;
  }[] | null;
  signedByEnvelope: Map<string, HireSignedDocumentRow>;
}): HireDetailsRentalCard {
  const depositLabel =
    input.includeDeposit && input.depositGbp != null && input.depositGbp !== ""
      ? formatRentAmount(input.depositGbp)
      : null;

  return {
    companyName: input.companyName,
    startDateLabel: formatUkDate(input.startDate),
    activatedAtLabel: input.activatedAt ? formatUkDateTime(input.activatedAt) : null,
    endedAtLabel: input.endedAt ? formatUkDateTime(input.endedAt) : null,
    rentAmountLabel: formatRentAmount(input.rentAmountGbp),
    rentFrequencyLabel: formatRentFrequency(input.rentCadence),
    depositLabel,
    agreements: mapRentalAgreements(input.agreements, input.signedByEnvelope),
  };
}

type VehicleDetailRow = {
  vrm?: string | null;
  make?: string | null;
  model?: string | null;
  colour?: string | null;
  fuel_type?: string | null;
  seats?: number | null;
  cc?: number | null;
  mot_expiry?: string | null;
  tax_expiry?: string | null;
  phv_licence_no?: string | null;
  phv_licence_expiry?: string | null;
  service_due_at?: string | null;
};

const VEHICLE_DETAIL_SELECT =
  "vrm, make, model, colour, fuel_type, seats, cc, mot_expiry, tax_expiry, phv_licence_no, phv_licence_expiry, service_due_at";

async function loadVehicleDetailForHire(
  vehicleId: string,
  embedded: VehicleDetailRow | null,
  options: {
    forDriver: boolean;
    admin: ReturnType<typeof createSupabaseAdminClient> | null;
    supabase: Awaited<ReturnType<typeof createClient>>;
  },
): Promise<VehicleDetailRow | null> {
  if (embedded) return embedded;
  if (options.forDriver && options.admin) {
    const { data } = await options.admin
      .from("vehicles")
      .select(VEHICLE_DETAIL_SELECT)
      .eq("id", vehicleId)
      .maybeSingle();
    return (data as VehicleDetailRow | null) ?? null;
  }
  const { data } = await options.supabase
    .from("vehicles")
    .select(VEHICLE_DETAIL_SELECT)
    .eq("id", vehicleId)
    .maybeSingle();
  return (data as VehicleDetailRow | null) ?? null;
}

function buildImportantDates(input: {
  vehicle: {
    mot_expiry?: string | null;
    tax_expiry?: string | null;
    phv_licence_expiry?: string | null;
    service_due_at?: string | null;
  };
  hirerLicenceExpiryLabel: string | null;
  hirerPhvExpiryLabel: string | null;
}): HireDetailsImportantDates {
  const vehicle: HireDetailsImportantDateRow[] = [
    { label: "MOT expiry", value: formatUkDate(input.vehicle.mot_expiry) },
    { label: "Tax expiry", value: formatUkDate(input.vehicle.tax_expiry) },
    { label: "PHV expiry", value: formatUkDate(input.vehicle.phv_licence_expiry) },
  ];
  if (input.vehicle.service_due_at) {
    vehicle.push({ label: "Service due", value: formatUkDate(input.vehicle.service_due_at) });
  }

  const hirer: HireDetailsImportantDateRow[] = [];
  if (input.hirerLicenceExpiryLabel) {
    hirer.push({ label: "Licence expiry", value: input.hirerLicenceExpiryLabel });
  }
  if (input.hirerPhvExpiryLabel) {
    hirer.push({ label: "PHV expiry", value: input.hirerPhvExpiryLabel });
  }

  return { vehicle, hirer };
}

async function buildHireDetails(
  hireGroupId: string,
  options: { includeHirer: boolean; driverUserId?: string },
): Promise<{ ok: true; data: HireDetailsPayload } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      `id, status, parent_company_id, driver_user_id, vehicle_id, start_date, activated_at, ended_at, rent_cadence, rent_amount_gbp, deposit_gbp, include_deposit, companies(name), vehicles(vrm, make, model, colour, fuel_type, seats, cc, mot_expiry, tax_expiry, phv_licence_no, phv_licence_expiry, service_due_at), vehicle_hire_agreements(id, contract_length_kind, end_date, status, signed_at, esign_envelope_id)`,
    )
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group) return { ok: false, error: "Hire not found." };

  if (options.driverUserId && group.driver_user_id !== options.driverUserId) {
    return { ok: false, error: "You are not authorised to view this hire." };
  }

  const vehicleId = group.vehicle_id as string | null;
  if (!vehicleId) return { ok: false, error: "Vehicle not found for this hire." };

  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  if (options.driverUserId) {
    try {
      admin = createSupabaseAdminClient();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Server error." };
    }
  }

  const company = group.companies as { name?: string } | null;
  const vehicle = await loadVehicleDetailForHire(
    vehicleId,
    group.vehicles as VehicleDetailRow | null,
    { forDriver: Boolean(options.driverUserId), admin, supabase },
  );
  const agreements = group.vehicle_hire_agreements as
    | {
        id?: string;
        contract_length_kind?: string;
        end_date?: string | null;
        status?: string;
        signed_at?: string | null;
        esign_envelope_id?: string | null;
      }[]
    | null;

  if (!vehicle) return { ok: false, error: "Vehicle not found for this hire." };

  const signedByEnvelope = await loadSignedAgreementsByEnvelope(hireGroupId.trim());
  const hireStatus = String(group.status ?? "");

  let vehicleDocuments: HireDetailsDocumentItem[] = [];
  let vehicleDocumentsAccessible = true;
  let hirer: HireDetailsHirerCard | null = null;
  let hirerDocuments: HireDetailsDocumentItem[] = [];

  if (options.driverUserId) {
    vehicleDocumentsAccessible = driverCanAccessVehicleDocuments(hireStatus);
    if (vehicleDocumentsAccessible && admin) {
      vehicleDocuments = await loadVehicleDocumentsForDriver(admin, vehicleId);
    }
  } else {
    vehicleDocuments = await loadVehicleDocuments(supabase, vehicleId);
  }

  if (options.includeHirer && group.driver_user_id) {
    if (!admin) {
      try {
        admin = createSupabaseAdminClient();
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Server error." };
      }
    }

    const linked = await assertDriverLinkedToCompany(
      admin,
      group.parent_company_id as string,
      group.driver_user_id as string,
    );
    if (!linked.ok) return linked;

    const hirerBundle = await loadHirerDocuments(admin, group.driver_user_id as string);
    hirer = hirerBundle.hirer;
    hirerDocuments = hirerBundle.documents;
  }

  const importantDates = buildImportantDates({
    vehicle,
    hirerLicenceExpiryLabel: hirer?.drivingLicenceExpiryLabel ?? null,
    hirerPhvExpiryLabel: hirer?.phvLicenceExpiryLabel ?? null,
  });

  const rental = buildRentalCard({
    companyName: options.driverUserId ? company?.name?.trim() || null : null,
    startDate: group.start_date as string | undefined,
    activatedAt: group.activated_at as string | null | undefined,
    endedAt: group.ended_at as string | null | undefined,
    rentAmountGbp: group.rent_amount_gbp,
    rentCadence: group.rent_cadence,
    includeDeposit: Boolean(group.include_deposit),
    depositGbp: group.deposit_gbp,
    agreements,
    signedByEnvelope,
  });

  return {
    ok: true,
    data: {
      hireGroupId: group.id as string,
      rental,
      vehicle: {
        vrm: vehicle.vrm?.trim() || "—",
        make: vehicle.make?.trim() || "—",
        model: vehicle.model?.trim() || "—",
        colour: vehicle.colour?.trim() || null,
        fuelType: vehicle.fuel_type?.trim() || null,
        seats: vehicle.seats ?? null,
        cc: vehicle.cc ?? null,
        motExpiryLabel: formatUkDate(vehicle.mot_expiry),
        taxExpiryLabel: formatUkDate(vehicle.tax_expiry),
        phvLicenceNo: vehicle.phv_licence_no?.trim() || null,
        phvExpiryLabel: formatUkDate(vehicle.phv_licence_expiry),
      },
      importantDates,
      vehicleDocuments,
      vehicleDocumentsAccessible,
      hirer,
      hirerDocuments,
    },
  };
}

export async function loadRentalHireDetailsAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HireDetailsPayload } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
  return buildHireDetails(hireGroupId, { includeHirer: true });
}

/** Driver view: company + vehicle + vehicle documents (no hirer PII beyond what they already know). */
export async function loadDriverHireDetailsAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HireDetailsPayload } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };
  return buildHireDetails(hireGroupId, { includeHirer: false, driverUserId: user.id });
}

/** Staff-only vehicle document access for hires where RLS already applies. */
export async function getHireVehicleDocumentUrlAction(
  hireGroupId: string,
  documentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("vehicle_id")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (!group?.vehicle_id) return { ok: false, error: "Hire not found." };

  const { data: doc } = await supabase
    .from("vehicle_documents")
    .select("id, file_path, vehicle_id")
    .eq("id", documentId.trim())
    .maybeSingle();
  if (!doc || doc.vehicle_id !== group.vehicle_id) return { ok: false, error: "Document not found." };

  const url = await signVehicleDocUrl(supabase, doc.file_path as string);
  if (!url) return { ok: false, error: "Could not open document." };
  return { ok: true, url };
}
