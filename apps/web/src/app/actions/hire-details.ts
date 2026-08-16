"use server";

import { assertDriverLinkedToCompany } from "@/app/actions/rental-driver-links";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadDriverIdentity, canReadRentals } from "@/lib/auth/rental-permissions";
import { loadDriverPreviewBundle } from "@/lib/admin/load-driver-preview";
import { driverCanAccessVehicleDocuments } from "@/lib/fleet/driver-hire-nav";
import { hireAllowsCompanyDriverPackageAccess } from "@/lib/fleet/hire-driver-package-access";
import { driverDocumentsRetentionWarning } from "@/lib/fleet/hire-document-retention";
import {
  formatUkCalendarDateTimeText,
  formatUkDate,
  formatUkDateText,
  formatUkDateTime,
  formatUkDateTimeText,
  ukTodayYmd,
} from "@/lib/datetime/uk";
import { CONTRACT_LENGTH_LABELS } from "@/lib/fleet/hire-access-display";
import {
  formatHireContractEndLabel,
  HIRE_PDF_DEFAULT_END_TIME,
  HIRE_PDF_DEFAULT_START_TIME,
  normalizeHireTime,
} from "@/lib/fleet/hire-pdf-details";
import { resolveHireLessorDisplayName } from "@/lib/fleet/hire-lessor-display";
import type { ContractLengthKind } from "@/lib/fleet/hire-types";
import {
  REQUIRED_VEHICLE_DOC_TYPES,
  VEHICLE_DOC_TYPE_LABELS,
  type RequiredVehicleDocType,
} from "@/lib/fleet/vehicles";
import { loadHireGroupSignedDocuments, type HireSignedDocumentRow } from "@/lib/fleet/hire-signed-documents";
import { mapHireInsuranceSummary } from "@/lib/fleet/hire-insurance";
import { parseCompanyNotificationSettings } from "@/lib/settings/notification-settings";
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
  endDateYmd: string | null;
  statusLabel: string;
  signedAtLabel: string | null;
  pdfUrl: string | null;
  downloadFileName: string | null;
};

export type HireDetailsRentalCard = {
  companyName: string | null;
  startDateLabel: string;
  activatedAtLabel: string | null;
  endedAtLabel: string | null;
  contractEndLabel: string | null;
  contractEndYmd: string | null;
  rentAmountLabel: string;
  rentFrequencyLabel: string;
  rentRateDetailsLabel: string;
  depositLabel: string | null;
  checkoutBeforeScheduledNote: string | null;
  agreements: HireDetailsRentalAgreement[];
};

export type HireDetailsCompanyCard = {
  parentCompanyName: string;
  rentalSubcompanyName: string | null;
  companyName: string;
  legalName: string | null;
  companyNumber: string | null;
  address: string | null;
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
  motExpiryYmd: string | null;
  taxExpiryLabel: string;
  taxExpiryYmd: string | null;
  phvLicenceNo: string | null;
  phvExpiryLabel: string;
  phvExpiryYmd: string | null;
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

export type HireInsuranceDetailsSummary = ReturnType<typeof mapHireInsuranceSummary>;

export type HireSupersessionLink = {
  hireGroupId: string;
  direction: "supersedes" | "superseded_by";
  lessorLabel: string;
};

export type HireDetailsPayload = {
  hireGroupId: string;
  hireReferenceLabel: string;
  hireReferenceKicker: string;
  company: HireDetailsCompanyCard;
  rental: HireDetailsRentalCard;
  vehicle: HireDetailsVehicleCard;
  importantDates: HireDetailsImportantDates;
  vehicleDocuments: HireDetailsDocumentItem[];
  /** False for drivers when the hire is no longer ongoing (vehicle docs withheld). */
  vehicleDocumentsAccessible: boolean;
  hirer: HireDetailsHirerCard | null;
  hirerDocuments: HireDetailsDocumentItem[];
  /** False when driver document retention has expired for ended hires. */
  hirerDocumentsAccessible: boolean;
  driverDocumentsRetentionWarning: string | null;
  driverDocumentsRetainUntilLabel: string | null;
  hireInsurance: HireInsuranceDetailsSummary;
  hireSupersession: HireSupersessionLink | null;
  hireStatus: string;
};

function formatAddress(parts: (string | null | undefined)[]): string | null {
  const line = parts.filter(Boolean).join(", ").trim();
  return line || null;
}

async function loadHireSupersessionLink(
  supabase: Awaited<ReturnType<typeof createClient>>,
  group: {
    supersedes_hire_group_id?: string | null;
    superseded_by_hire_group_id?: string | null;
  },
): Promise<HireSupersessionLink | null> {
  const supersededById = group.superseded_by_hire_group_id?.trim() || null;
  const supersedesId = group.supersedes_hire_group_id?.trim() || null;
  const relatedId = supersededById ?? supersedesId;
  if (!relatedId) return null;

  const { data: related, error } = await supabase
    .from("vehicle_hire_groups")
    .select("id, subcompany_id, subcompany_legal_snapshot, subcompanies(name)")
    .eq("id", relatedId)
    .maybeSingle();
  if (error || !related) return null;

  const nested = related.subcompanies as
    | { legal_name?: string | null; display_name?: string | null; name?: string | null }
    | { legal_name?: string | null; display_name?: string | null; name?: string | null }[]
    | null;
  const subcompany = Array.isArray(nested) ? nested[0] ?? null : nested;
  const lessorLabel = resolveHireLessorDisplayName({
    snapshot: (related.subcompany_legal_snapshot ?? null) as Record<string, unknown> | null,
    subcompany,
    parentCompanyName: null,
    hasSubcompany: Boolean(related.subcompany_id),
  });

  return {
    hireGroupId: related.id as string,
    direction: supersededById ? "superseded_by" : "supersedes",
    lessorLabel,
  };
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
    rows.push({
      id: onFile?.id ?? docType,
      label: VEHICLE_DOC_TYPE_LABELS[docType as RequiredVehicleDocType],
      status: onFile ? "on_file" : "missing",
      // Signed URLs are issued on demand after a fresh status check.
      viewUrl: null,
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

function formatRentFrequencyShort(cadence: unknown): string {
  const c = String(cadence ?? "").trim();
  if (c === "daily") return "daily";
  if (c === "weekly") return "weekly";
  if (c === "monthly") return "monthly";
  return "—";
}

function buildCheckoutBeforeScheduledNote(input: {
  startDate: string | null | undefined;
  startTime: string | null | undefined;
  activatedAt: string | null | undefined;
}): string | null {
  if (!input.activatedAt || !input.startDate) return null;
  const scheduled = new Date(
    `${input.startDate.trim()}T${normalizeHireTime(input.startTime, HIRE_PDF_DEFAULT_START_TIME)}:00`,
  );
  const activated = new Date(input.activatedAt);
  if (Number.isNaN(scheduled.getTime()) || Number.isNaN(activated.getTime())) return null;
  if (activated.getTime() < scheduled.getTime()) {
    return "Checkout occurred before the scheduled start time. Keep both timestamps and label them clearly.";
  }
  return null;
}

function buildRentRateDetailsLabel(input: {
  rentAmountGbp: unknown;
  rentCadence: unknown;
  depositLabel: string | null;
}): string {
  const amount = formatRentAmount(input.rentAmountGbp);
  const frequency = formatRentFrequencyShort(input.rentCadence);
  const rentPart = amount !== "—" && frequency !== "—" ? `${amount} ${frequency}` : amount;
  if (input.depositLabel) return `${rentPart} · ${input.depositLabel} deposit`;
  return rentPart;
}

function formatHireReference(hireGroupId: string): { label: string; kicker: string } {
  const short = hireGroupId.replace(/-/g, "").slice(0, 8);
  return {
    label: short.toLowerCase(),
    kicker: `HIRE ${short.toUpperCase()}`,
  };
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
  endTime?: string | null,
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
      endDateLabel: formatHireContractEndLabel(agreement.end_date, endTime),
      endDateYmd: agreement.end_date?.slice(0, 10) ?? null,
      statusLabel: agreementStatusLabel(agreement),
      signedAtLabel: agreement.signed_at ? formatUkDateTime(agreement.signed_at) : null,
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
  startTime?: string | null | undefined;
  endTime?: string | null | undefined;
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
  const mappedAgreements = mapRentalAgreements(input.agreements, input.signedByEnvelope, input.endTime);
  const primaryAgreement = mappedAgreements[0] ?? null;

  return {
    companyName: input.companyName,
    startDateLabel: formatUkCalendarDateTimeText(
      input.startDate,
      normalizeHireTime(input.startTime, HIRE_PDF_DEFAULT_START_TIME),
    ),
    activatedAtLabel: input.activatedAt ? formatUkDateTimeText(input.activatedAt) : null,
    endedAtLabel: input.endedAt ? formatUkDateTimeText(input.endedAt) : null,
    contractEndLabel: primaryAgreement
      ? formatUkCalendarDateTimeText(
          input.agreements?.[0]?.end_date,
          normalizeHireTime(input.endTime, HIRE_PDF_DEFAULT_END_TIME),
        )
      : null,
    contractEndYmd: input.agreements?.[0]?.end_date?.slice(0, 10) ?? null,
    rentAmountLabel: formatRentAmount(input.rentAmountGbp),
    rentFrequencyLabel: formatRentFrequency(input.rentCadence),
    rentRateDetailsLabel: buildRentRateDetailsLabel({
      rentAmountGbp: input.rentAmountGbp,
      rentCadence: input.rentCadence,
      depositLabel,
    }),
    depositLabel,
    checkoutBeforeScheduledNote: buildCheckoutBeforeScheduledNote({
      startDate: input.startDate,
      startTime: input.startTime,
      activatedAt: input.activatedAt,
    }),
    agreements: mappedAgreements,
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

async function loadCompanyCardForHire(input: {
  parentCompanyId: string;
  subcompanyId: string | null;
  embeddedCompanyName: string | null;
  admin: ReturnType<typeof createSupabaseAdminClient> | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
  forDriver: boolean;
}): Promise<HireDetailsCompanyCard> {
  let parentCompanyName = input.embeddedCompanyName?.trim() || "Rental company";
  let rentalSubcompanyName: string | null = null;
  let companyName = parentCompanyName;
  let legalName: string | null = null;
  let companyNumber: string | null = null;
  let address: string | null = null;

  const client = input.forDriver && input.admin ? input.admin : input.supabase;

  const { data: parentCompany } = await client
    .from("companies")
    .select("name")
    .eq("id", input.parentCompanyId)
    .maybeSingle();
  if (parentCompany?.name?.trim()) {
    parentCompanyName = parentCompany.name.trim();
    companyName = parentCompanyName;
  }

  if (input.subcompanyId) {
    const { data: subcompany } = await client
      .from("subcompanies")
      .select(
        "name, display_name, legal_name, company_number, registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode",
      )
      .eq("id", input.subcompanyId)
      .maybeSingle();
    if (subcompany) {
      legalName = (subcompany.legal_name as string | null)?.trim() || null;
      companyNumber = (subcompany.company_number as string | null)?.trim() || null;
      address = formatAddress([
        subcompany.registered_address_line1 as string | null,
        subcompany.registered_address_line2 as string | null,
        subcompany.registered_town as string | null,
        subcompany.registered_county as string | null,
        subcompany.registered_postcode as string | null,
      ]);
      rentalSubcompanyName = resolveHireLessorDisplayName({
        subcompany: {
          legal_name: subcompany.legal_name as string | null,
          display_name: subcompany.display_name as string | null,
          name: subcompany.name as string | null,
        },
        hasSubcompany: true,
      });
      companyName = rentalSubcompanyName;
    }
  }

  return { parentCompanyName, rentalSubcompanyName, companyName, legalName, companyNumber, address };
}

async function buildHireDetails(
  hireGroupId: string,
  options: { includeHirer: boolean; driverUserId?: string },
): Promise<{ ok: true; data: HireDetailsPayload } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select(
      `id, status, parent_company_id, subcompany_id, driver_user_id, driver_access_status, vehicle_id, start_date, start_time, end_time, activated_at, ended_at, terminated_at, driver_documents_retain_until, rent_cadence, rent_amount_gbp, deposit_gbp, include_deposit, insurance_provided_by, supersedes_hire_group_id, superseded_by_hire_group_id, companies(name), vehicles(vrm, make, model, colour, fuel_type, seats, cc, mot_expiry, tax_expiry, phv_licence_no, phv_licence_expiry, service_due_at), vehicle_hire_agreements(id, contract_length_kind, end_date, status, signed_at, esign_envelope_id)`,
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
  let hirerDocumentsAccessible = true;
  let driverDocumentsRetentionWarningMessage: string | null = null;
  const retainUntilYmd = (group.driver_documents_retain_until as string | null) ?? null;
  const todayYmd = ukTodayYmd();

  if (options.driverUserId) {
    vehicleDocumentsAccessible = driverCanAccessVehicleDocuments(hireStatus);
    if (vehicleDocumentsAccessible && admin) {
      vehicleDocuments = await loadVehicleDocumentsForDriver(admin, vehicleId);
    }
  } else {
    vehicleDocuments = await loadVehicleDocuments(supabase, vehicleId);
  }

  if (options.includeHirer && group.driver_user_id) {
    const packageAccess = hireAllowsCompanyDriverPackageAccess({
      driverAccessStatus: (group.driver_access_status as string | null) ?? null,
      hireStatus,
      retainUntilYmd,
      todayYmd,
    });
    hirerDocumentsAccessible = packageAccess;

    if (packageAccess && retainUntilYmd) {
      driverDocumentsRetentionWarningMessage =
        driverDocumentsRetentionWarning(retainUntilYmd, todayYmd)?.message ?? null;
    }

    if (!packageAccess) {
      hirer = null;
      hirerDocuments = [];
    } else {
      // Identity package requires Cap + hire-scoped approval (not company link alone).
      const { profile } = await requireRentalCompanyArea();
      if (!canReadDriverIdentity(profile)) {
        hirer = null;
        hirerDocuments = [];
        hirerDocumentsAccessible = false;
      } else {
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
        if (!linked.ok) {
          hirer = null;
          hirerDocuments = [];
          hirerDocumentsAccessible = false;
        } else {
          const hirerBundle = await loadHirerDocuments(admin, group.driver_user_id as string);
          hirer = hirerBundle.hirer;
          hirerDocuments = hirerBundle.documents;
        }
      }
    }
  }

  const importantDates = buildImportantDates({
    vehicle,
    hirerLicenceExpiryLabel: hirer?.drivingLicenceExpiryLabel ?? null,
    hirerPhvExpiryLabel: hirer?.phvLicenceExpiryLabel ?? null,
  });

  const companyCard = await loadCompanyCardForHire({
    parentCompanyId: group.parent_company_id as string,
    subcompanyId: (group.subcompany_id as string | null) ?? null,
    embeddedCompanyName: company?.name?.trim() || null,
    admin,
    supabase,
    forDriver: Boolean(options.driverUserId),
  });

  const [{ data: insuranceRow }, { data: notifyCompany }] = await Promise.all([
    supabase
      .from("vehicle_hire_insurance")
      .select("insurance_type, expiry_date, file_name, file_path, uploaded_at, uploaded_by_role")
      .eq("hire_group_id", hireGroupId.trim())
      .maybeSingle(),
    supabase
      .from("companies")
      .select("notify_insurance_days_before")
      .eq("id", group.parent_company_id as string)
      .maybeSingle(),
  ]);
  const notifySettings = parseCompanyNotificationSettings(notifyCompany ?? undefined);
  const hireInsurance = mapHireInsuranceSummary({
    providedBy: (group.insurance_provided_by as string | null) ?? null,
    insuranceRow: insuranceRow,
    notifyDaysBefore: notifySettings.notify_insurance_days_before,
    audience: options.driverUserId ? "driver" : "staff",
    todayYmd,
  });

  const rental = buildRentalCard({
    companyName: options.driverUserId ? companyCard.companyName : null,
    startDate: group.start_date as string | undefined,
    startTime: (group.start_time as string | null) ?? null,
    endTime: (group.end_time as string | null) ?? null,
    activatedAt: group.activated_at as string | null | undefined,
    endedAt:
      (group.terminated_at as string | null | undefined) ??
      (group.ended_at as string | null | undefined),
    rentAmountGbp: group.rent_amount_gbp,
    rentCadence: group.rent_cadence,
    includeDeposit: Boolean(group.include_deposit),
    depositGbp: group.deposit_gbp,
    agreements,
    signedByEnvelope,
  });

  const hireSupersession = await loadHireSupersessionLink(supabase, group);

  const hireReference = formatHireReference(group.id as string);

  return {
    ok: true,
    data: {
      hireGroupId: group.id as string,
      hireReferenceLabel: hireReference.label,
      hireReferenceKicker: hireReference.kicker,
      company: companyCard,
      rental,
      vehicle: {
        vrm: vehicle.vrm?.trim() || "—",
        make: vehicle.make?.trim() || "—",
        model: vehicle.model?.trim() || "—",
        colour: vehicle.colour?.trim() || null,
        fuelType: vehicle.fuel_type?.trim() || null,
        seats: vehicle.seats ?? null,
        cc: vehicle.cc ?? null,
        motExpiryLabel: formatUkDateText(vehicle.mot_expiry),
        motExpiryYmd: vehicle.mot_expiry?.slice(0, 10) ?? null,
        taxExpiryLabel: formatUkDateText(vehicle.tax_expiry),
        taxExpiryYmd: vehicle.tax_expiry?.slice(0, 10) ?? null,
        phvLicenceNo: vehicle.phv_licence_no?.trim() || null,
        phvExpiryLabel: formatUkDateText(vehicle.phv_licence_expiry),
        phvExpiryYmd: vehicle.phv_licence_expiry?.slice(0, 10) ?? null,
      },
      importantDates,
      vehicleDocuments,
      vehicleDocumentsAccessible,
      hirer,
      hirerDocuments,
      hirerDocumentsAccessible,
      driverDocumentsRetentionWarning: driverDocumentsRetentionWarningMessage,
      driverDocumentsRetainUntilLabel: retainUntilYmd ? formatUkDate(retainUntilYmd) : null,
      hireInsurance,
      hireSupersession,
      hireStatus,
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

/**
 * Driver open/download for vehicle compliance docs. Re-checks hire ownership and
 * that the hire is still `active` before issuing a short-lived signed URL.
 */
export async function getDriverHireVehicleDocumentUrlAction(
  hireGroupId: string,
  documentId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const id = hireGroupId.trim();
  const docId = documentId.trim();
  if (!id || !docId) return { ok: false, error: "Document not found." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server error." };
  }

  const { data: group } = await admin
    .from("vehicle_hire_groups")
    .select("id, status, vehicle_id, driver_user_id")
    .eq("id", id)
    .eq("driver_user_id", user.id)
    .maybeSingle();
  if (!group?.vehicle_id) return { ok: false, error: "Hire not found." };
  if (!driverCanAccessVehicleDocuments(String(group.status ?? ""))) {
    return {
      ok: false,
      error: "Vehicle documents are only available while your hire is active.",
    };
  }

  const { data: doc } = await admin
    .from("vehicle_documents")
    .select("id, file_path, vehicle_id")
    .eq("id", docId)
    .maybeSingle();
  if (!doc || doc.vehicle_id !== group.vehicle_id) return { ok: false, error: "Document not found." };

  const url = await signVehicleDocUrlAdmin(admin, doc.file_path as string);
  if (!url) return { ok: false, error: "Could not open document." };
  return { ok: true, url };
}
