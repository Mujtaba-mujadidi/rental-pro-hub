import { formatHireContractStartLabel } from "@/lib/fleet/hire-pdf-details";
import { resolveHireLessorDisplayName } from "@/lib/rental/subcompany-legal-snapshot";

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
  displayName?: string | null;
  name?: string | null;
};

export type DriverHireDisplayLookups = {
  vehiclesById: Map<string, DriverHireVehicleSnapshot>;
  companiesById: Map<string, DriverHireCompanyLookup>;
  subcompaniesById: Map<string, DriverHireSubcompanyLookup>;
};

/** Contract hire start — same date and default time as the signed PDF. */
export function formatDriverHireContractStartLabel(
  startDate: string | null | undefined,
  startTime?: string | null | undefined,
): string {
  return formatHireContractStartLabel(startDate, startTime);
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

  if (input.subcompanyId) {
    return resolveHireLessorDisplayName({
      subcompany: subcompany
        ? {
            legal_name: subcompany.legalName,
            display_name: subcompany.displayName,
            name: subcompany.name,
          }
        : null,
      hasSubcompany: true,
    });
  }

  return resolveHireLessorDisplayName({
    parentCompanyName: parentCompany?.name,
    hasSubcompany: false,
  });
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
