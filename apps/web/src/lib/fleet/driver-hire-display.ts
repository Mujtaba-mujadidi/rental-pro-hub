import { formatHireContractStartLabel } from "@/lib/fleet/hire-pdf-details";

export type DriverHireVehicleSnapshot = {
  vrm?: string | null;
  make?: string | null;
  model?: string | null;
};

export type DriverHireCompanyLookup = {
  name?: string | null;
};

export type DriverHireSubcompanyLookup = {
  legalName?: string | null;
  companyName?: string | null;
};

export type DriverHireDisplayLookups = {
  vehiclesById: Map<string, DriverHireVehicleSnapshot>;
  companiesById: Map<string, DriverHireCompanyLookup>;
  subcompaniesById: Map<string, DriverHireSubcompanyLookup>;
};

/** Contract hire start — same date and default time as the signed PDF. */
export function formatDriverHireContractStartLabel(
  startDate: string | null | undefined,
): string {
  return formatHireContractStartLabel(startDate);
}

export function resolveDriverHireCompanyName(input: {
  parentCompanyId: string;
  subcompanyId: string | null;
  lookups: DriverHireDisplayLookups;
}): string {
  const subcompany = input.subcompanyId
    ? input.lookups.subcompaniesById.get(input.subcompanyId)
    : null;
  const parentCompany = input.lookups.companiesById.get(input.parentCompanyId);

  const linkedName = subcompany?.companyName?.trim();
  if (linkedName) return linkedName;

  const parentName = parentCompany?.name?.trim();
  if (parentName) return parentName;

  const legalName = subcompany?.legalName?.trim();
  if (legalName) return legalName;

  return "Rental company";
}

export function resolveDriverHireVehicleDisplay(
  vehicleId: string | null,
  lookups: DriverHireDisplayLookups,
): { vehicleVrm: string; vehicleMakeModel: string } {
  const vehicle = vehicleId ? lookups.vehiclesById.get(vehicleId) : null;
  return {
    vehicleVrm: vehicle?.vrm?.trim() || "—",
    vehicleMakeModel: [vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || "—",
  };
}
