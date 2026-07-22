import { formatUkDate } from "@/lib/datetime/uk";
import { computeContractEndDate } from "@/lib/fleet/hire-lifecycle";
import type { HireAccessVehicleSnapshot } from "@/lib/fleet/hire-access-vehicle-fields";
import type { ContractLengthKind, RentCadence } from "@/lib/fleet/hire-types";

export const CONTRACT_LENGTH_LABELS: Record<ContractLengthKind, string> = {
  annual: "Annual",
  six_months: "6 months",
  custom: "Custom",
};

export const RENT_CADENCE_LABELS: Record<RentCadence, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

type SnapshotVehicle = HireAccessVehicleSnapshot | null;
type SnapshotCompany = { name?: string } | null;
type SnapshotSubcompany = {
  legal_name?: string;
  company_number?: string;
  registered_address_line1?: string;
  registered_address_line2?: string;
  registered_town?: string;
  registered_county?: string;
  registered_postcode?: string;
} | null;
type SnapshotTerms = { title?: string; body?: string; version_label?: string } | null;

export type HireAccessDetailRow = { label: string; value: string };

export type HireAccessDisplay = {
  companyName: string;
  subcompanyLegalName: string | null;
  subcompanyCompanyNumber: string | null;
  subcompanyAddress: string | null;
  startDate: string | null;
  startDateLabel: string;
  rentLabel: string | null;
  depositLabel: string | null;
  contractLengthLines: string[];
  vehicleVrm: string;
  vehicleMakeModel: string;
  vehicleDetailRows: HireAccessDetailRow[];
  termsTitle: string | null;
  termsBody: string | null;
  termsVersionLabel: string | null;
};

function formatAddress(parts: (string | null | undefined)[]): string | null {
  const line = parts.filter(Boolean).join(", ").trim();
  return line || null;
}

function formatGbp(amount: unknown): string | null {
  const n = typeof amount === "number" ? amount : Number.parseFloat(String(amount ?? ""));
  if (!Number.isFinite(n)) return null;
  return `£${n.toFixed(2)}`;
}

export function formatRentLabel(amountGbp: unknown, cadence: unknown): string | null {
  const amount = formatGbp(amountGbp);
  if (!amount) return null;
  const c = String(cadence ?? "").trim() as RentCadence;
  const unit = RENT_CADENCE_LABELS[c];
  return unit ? `${amount} per ${unit}` : amount;
}

export function buildContractLengthLines(
  startDate: string | null,
  draftSnapshot: unknown,
): string[] {
  if (!startDate?.trim()) return [];
  const lengths = (draftSnapshot as { contractLengths?: { kind: ContractLengthKind; customEndDate?: string | null }[] })
    ?.contractLengths;
  if (!Array.isArray(lengths) || !lengths.length) return [];

  return lengths
    .map((entry) => {
      const kind = entry?.kind;
      if (!kind) return null;
      const label = CONTRACT_LENGTH_LABELS[kind] ?? kind;
      const end = computeContractEndDate(startDate, kind, entry.customEndDate);
      return end ? `${label} (ends ${formatUkDate(end)})` : label;
    })
    .filter((line): line is string => Boolean(line));
}

export function buildVehicleDetailRows(vehicle: SnapshotVehicle): HireAccessDetailRow[] {
  if (!vehicle) return [];

  const rows: HireAccessDetailRow[] = [];
  const push = (label: string, value: string | number | null | undefined) => {
    if (value == null) return;
    const text = typeof value === "number" ? String(value) : value.trim();
    if (!text) return;
    rows.push({ label, value: text });
  };

  push("Registration", vehicle.vrm);
  push("Make", vehicle.make);
  push("Model", vehicle.model);
  push("Colour", vehicle.colour?.toUpperCase());
  push("First registration", vehicle.first_reg_date ? formatUkDate(vehicle.first_reg_date) : null);
  push("UK registration", vehicle.first_reg_uk_date ? formatUkDate(vehicle.first_reg_uk_date) : null);
  push("Fuel type", vehicle.fuel_type?.toUpperCase());
  if (vehicle.seats != null) push("Seats", String(vehicle.seats));
  if (vehicle.cc != null) push("Engine (cc)", String(vehicle.cc));
  push("Notes", vehicle.notes);

  return rows;
}

export function parseHireAccessSnapshot(
  hireSummary: Record<string, unknown>,
  companyNameFallback: string,
  termsPreview: { title: string; body: string; versionLabel?: string | null } | null,
): HireAccessDisplay {
  const vehicle = (hireSummary.vehicles ?? null) as SnapshotVehicle;
  const company = (hireSummary.companies ?? null) as SnapshotCompany;
  const subcompany = (hireSummary.subcompanies ?? null) as SnapshotSubcompany;
  const embeddedTerms = (hireSummary.company_hire_terms_versions ?? null) as SnapshotTerms;

  const startDate = typeof hireSummary.start_date === "string" ? hireSummary.start_date : null;
  const includeDeposit = Boolean(hireSummary.include_deposit);
  const deposit = includeDeposit ? formatGbp(hireSummary.deposit_gbp) : null;

  const termsTitle = termsPreview?.title ?? embeddedTerms?.title ?? null;
  const termsBody = termsPreview?.body ?? embeddedTerms?.body ?? null;
  const termsVersionLabel = termsPreview?.versionLabel ?? embeddedTerms?.version_label ?? null;

  return {
    companyName: company?.name?.trim() || companyNameFallback,
    subcompanyLegalName: subcompany?.legal_name?.trim() || null,
    subcompanyCompanyNumber: subcompany?.company_number?.trim() || null,
    subcompanyAddress: formatAddress([
      subcompany?.registered_address_line1,
      subcompany?.registered_address_line2,
      subcompany?.registered_town,
      subcompany?.registered_county,
      subcompany?.registered_postcode,
    ]),
    startDate,
    startDateLabel: startDate ? formatUkDate(startDate) : "—",
    rentLabel: formatRentLabel(hireSummary.rent_amount_gbp, hireSummary.rent_cadence),
    depositLabel: deposit,
    contractLengthLines: buildContractLengthLines(startDate, hireSummary.draft_snapshot),
    vehicleVrm: vehicle?.vrm?.trim() || "—",
    vehicleMakeModel: [vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || "—",
    vehicleDetailRows: buildVehicleDetailRows(vehicle),
    termsTitle,
    termsBody,
    termsVersionLabel,
  };
}
