import { formatUkDateAtTime, formatUkDateLong } from "@/lib/datetime/uk";
import type {
  ContractPdfDetailRow,
  ContractPdfHireDetails,
  ContractPdfHireRunningHeader,
} from "@/lib/esign/pdf-generate";
import { CONTRACT_LENGTH_LABELS } from "@/lib/fleet/hire-access-display";
import type { ContractLengthKind, RentCadence } from "@/lib/fleet/hire-types";

export const HIRE_PDF_DEFAULT_START_TIME = "09:00";
export const HIRE_PDF_DEFAULT_END_TIME = "17:00";

export type HirePdfDriverSource = {
  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  account_email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_town?: string | null;
  address_county?: string | null;
  address_postcode?: string | null;
  driving_licence_number?: string | null;
  driving_licence_expiry?: string | null;
  phv_licence_number?: string | null;
};

export type HirePdfVehicleSource = {
  vrm?: string | null;
  make?: string | null;
  model?: string | null;
  colour?: string | null;
  cc?: number | null;
  fuel_type?: string | null;
};

export function formatDriverPostalAddress(driver: HirePdfDriverSource): string {
  return [
    driver.address_line1,
    driver.address_line2,
    driver.address_town,
    driver.address_county,
    driver.address_postcode,
  ]
    .filter(Boolean)
    .join(", ");
}

function displayOrDash(value: string | null | undefined): string {
  const t = value?.trim();
  return t || "—";
}

const RENT_FREQUENCY_LABELS: Record<RentCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function formatGbp(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `£${amount.toFixed(2)}`;
}

export function buildHirePdfDetails(input: {
  driver: HirePdfDriverSource;
  driverName: string;
  driverEmail: string;
  vehicle: HirePdfVehicleSource;
  startDate: string;
  endDate: string;
  contractLengthKind: ContractLengthKind;
  rentCadence: RentCadence;
  rentAmountGbp: number;
  depositGbp: number | null;
}): { hireDetails: ContractPdfHireDetails; hireRunningHeader: ContractPdfHireRunningHeader } {
  const driverAddress = formatDriverPostalAddress(input.driver) || "—";
  const phvNumber = displayOrDash(input.driver.phv_licence_number);

  const hireDetails: ContractPdfHireDetails = {
    driver: [
      { label: "Full name", value: input.driverName },
      { label: "Address", value: driverAddress },
      { label: "Date of birth", value: formatUkDateLong(input.driver.date_of_birth) },
      { label: "Email", value: displayOrDash(input.driverEmail || input.driver.account_email) },
      { label: "Telephone (mobile)", value: displayOrDash(input.driver.phone) },
      { label: "Licence number", value: displayOrDash(input.driver.driving_licence_number) },
      {
        label: "Licence expiry date",
        value: formatUkDateLong(input.driver.driving_licence_expiry),
      },
      { label: "NI number", value: "—" },
      { label: "PHV/Licence number", value: phvNumber },
    ],
    vehicle: [
      { label: "VRM", value: displayOrDash(input.vehicle.vrm) },
      { label: "Make", value: displayOrDash(input.vehicle.make) },
      { label: "Model", value: displayOrDash(input.vehicle.model) },
      { label: "Colour", value: displayOrDash(input.vehicle.colour) },
      {
        label: "Cylinder capacity",
        value: input.vehicle.cc != null && Number.isFinite(input.vehicle.cc) ? String(input.vehicle.cc) : "—",
      },
      { label: "Fuel type", value: displayOrDash(input.vehicle.fuel_type) },
    ],
    rental: [
      {
        label: "Hire start date and time",
        value: formatUkDateAtTime(input.startDate, HIRE_PDF_DEFAULT_START_TIME),
      },
      {
        label: "Hire end date and time",
        value: formatUkDateAtTime(input.endDate, HIRE_PDF_DEFAULT_END_TIME),
      },
      { label: "Rent", value: formatGbp(input.rentAmountGbp) },
      {
        label: "Rent frequency",
        value: RENT_FREQUENCY_LABELS[input.rentCadence] ?? displayOrDash(input.rentCadence),
      },
      {
        label: "Deposit",
        value: input.depositGbp != null ? formatGbp(input.depositGbp) : "No deposit",
      },
      {
        label: "Contract length",
        value: CONTRACT_LENGTH_LABELS[input.contractLengthKind] ?? displayOrDash(input.contractLengthKind),
      },
    ],
  };

  const hireRunningHeader: ContractPdfHireRunningHeader = {
    vrm: displayOrDash(input.vehicle.vrm),
    hirer: input.driverName,
    hirerAddress: driverAddress,
    phvLicenceNumber: phvNumber,
    hireStartDate: formatUkDateAtTime(input.startDate, HIRE_PDF_DEFAULT_START_TIME),
  };

  return { hireDetails, hireRunningHeader };
}
