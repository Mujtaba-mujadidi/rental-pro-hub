import type { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatRegisteredCompanyAddress } from "@/lib/companies/registered-address";
import type { HireSummaryPdfInput } from "@/lib/esign/pdf-generate";
import { buildHirePdfDetails, type HirePdfDriverSource, type HirePdfVehicleSource } from "@/lib/fleet/hire-pdf-details";
import type { ContractLengthKind, RentCadence } from "@/lib/fleet/hire-types";
import {
  lessorAddressFromSnapshot,
  lessorDisplayNameFromSnapshot,
  snapshotString,
} from "@/lib/rental/subcompany-legal-snapshot";
import { loadSubcompanyLogoForContractPdf } from "@/lib/rental/subcompany-logo";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const HIRE_GROUP_SELECT =
  "id, parent_company_id, subcompany_id, driver_user_id, start_date, start_time, end_time, rent_cadence, rent_amount_gbp, deposit_gbp, subcompany_legal_snapshot, vehicles(vrm, make, model, colour, cc, fuel_type), vehicle_hire_agreements(contract_length_kind, end_date)";

const HIRE_DRIVER_PROFILE_SELECT =
  "first_name, last_name, account_email, date_of_birth, phone, address_line1, address_line2, address_town, address_county, address_postcode, driving_licence_number, driving_licence_expiry, phv_licence_number";

async function resolveHireLessorAddress(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  group: Record<string, unknown>,
  legalSnap: Record<string, unknown>,
): Promise<string | null> {
  const fromSnapshot = lessorAddressFromSnapshot(legalSnap);
  if (fromSnapshot) return fromSnapshot;

  const subcompanyId = (group.subcompany_id as string | null) ?? null;
  if (!subcompanyId) return null;
  const { data: sub } = await admin
    .from("subcompanies")
    .select(
      "registered_address_line1, registered_address_line2, registered_town, registered_county, registered_postcode",
    )
    .eq("id", subcompanyId)
    .maybeSingle();
  return formatRegisteredCompanyAddress(sub ?? {}) || null;
}

export async function loadHireInspectionReportPdfContext(
  supabase: Supabase,
  hireGroupId: string,
  kind: "checkout" | "checkin",
): Promise<{ ok: true; summary: HireSummaryPdfInput } | { ok: false; error: string }> {
  const { data: group, error } = await supabase
    .from("vehicle_hire_groups")
    .select(HIRE_GROUP_SELECT)
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!group?.id) return { ok: false, error: "Hire not found." };

  const driverUserId = group.driver_user_id as string;
  const vehicle = (group.vehicles ?? {}) as HirePdfVehicleSource;
  const agreements = (group.vehicle_hire_agreements ?? []) as {
    contract_length_kind: ContractLengthKind;
    end_date: string;
  }[];
  const primaryAgreement = agreements[0];

  const admin = createSupabaseAdminClient();
  const legalSnap = (group.subcompany_legal_snapshot ?? {}) as Record<string, unknown>;
  const logoPath = snapshotString(legalSnap, "logo_storage_path");

  const [{ data: driver }, logo] = await Promise.all([
    admin.from("driver_profiles").select(HIRE_DRIVER_PROFILE_SELECT).eq("user_id", driverUserId).maybeSingle(),
    loadSubcompanyLogoForContractPdf(admin, logoPath),
  ]);

  if (!driver) return { ok: false, error: "Driver profile not found." };

  let resolvedLogo = logo;
  if (!resolvedLogo) {
    const subId = (group.subcompany_id as string | null) ?? null;
    if (subId) {
      const { data: sub } = await admin
        .from("subcompanies")
        .select("logo_storage_path")
        .eq("id", subId)
        .maybeSingle();
      resolvedLogo = await loadSubcompanyLogoForContractPdf(admin, sub?.logo_storage_path as string | null);
    }
  }

  const subcompanyLegalName = lessorDisplayNameFromSnapshot(legalSnap);
  const subcompanyAddress = await resolveHireLessorAddress(admin, group as Record<string, unknown>, legalSnap);
  const companyNumber = snapshotString(legalSnap, "company_number");
  const driverName =
    [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() ||
    (driver.account_email as string | undefined)?.trim() ||
    "Driver";
  const driverEmail = (driver.account_email as string | undefined)?.trim() || "";

  const { hireDetails, hireRunningHeader } = buildHirePdfDetails({
    driver: driver as HirePdfDriverSource,
    driverName,
    driverEmail,
    vehicle,
    startDate: group.start_date as string,
    startTime: (group.start_time as string | null) ?? null,
    endDate: primaryAgreement?.end_date ?? (group.start_date as string),
    endTime: (group.end_time as string | null) ?? null,
    contractLengthKind: primaryAgreement?.contract_length_kind ?? "custom",
    rentCadence: group.rent_cadence as RentCadence,
    rentAmountGbp: Number(group.rent_amount_gbp),
    depositGbp: group.deposit_gbp != null ? Number(group.deposit_gbp) : null,
    lessor: {
      legalName: subcompanyLegalName,
      address: subcompanyAddress,
      companyNumber,
    },
  });

  const documentLabel = kind === "checkout" ? "Vehicle checkout report" : "Vehicle check-in report";

  return {
    ok: true,
    summary: {
      title: documentLabel,
      subtitle: vehicle.vrm?.trim()
        ? `${vehicle.vrm}${vehicle.make || vehicle.model ? ` · ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")}` : ""}`
        : null,
      documentLabel,
      platformName: subcompanyLegalName,
      companyNumber,
      contactEmail: snapshotString(legalSnap, "primary_contact_email"),
      contactPhone: snapshotString(legalSnap, "primary_contact_phone"),
      contactAddress: subcompanyAddress,
      logoBytes: resolvedLogo?.bytes ?? null,
      logoContentType: resolvedLogo?.contentType ?? null,
      hireDetails,
      hireRunningHeader,
    },
  };
}

export type { HireSummaryPdfInput };
