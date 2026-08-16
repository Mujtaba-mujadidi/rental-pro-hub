import { canCompanyAccessHireDriverDocuments } from "@/lib/fleet/hire-document-retention";

export type HireDriverPackageAccessDenial =
  | "not_approved"
  | "hire_cancelled"
  | "retention_expired";

/**
 * Whether staff may load this hire’s live driver package (profile + identity docs).
 *
 * Hire-scoped: company-wide `company_driver_links` alone is not enough.
 * Rejected / pending / cancelled must fail closed. Ended hires also need an unexpired retain-until.
 */
export function evaluateHireDriverPackageAccess(input: {
  driverAccessStatus: string | null | undefined;
  hireStatus: string | null | undefined;
  retainUntilYmd: string | null | undefined;
  todayYmd: string;
}): { ok: true } | { ok: false; reason: HireDriverPackageAccessDenial } {
  const access = (input.driverAccessStatus ?? "").trim();
  if (access !== "approved") {
    return { ok: false, reason: "not_approved" };
  }

  const status = (input.hireStatus ?? "").trim();
  if (status === "cancelled") {
    return { ok: false, reason: "hire_cancelled" };
  }

  if (!canCompanyAccessHireDriverDocuments(input.retainUntilYmd, input.todayYmd)) {
    return { ok: false, reason: "retention_expired" };
  }

  return { ok: true };
}

export function hireAllowsCompanyDriverPackageAccess(
  input: Parameters<typeof evaluateHireDriverPackageAccess>[0],
): boolean {
  return evaluateHireDriverPackageAccess(input).ok;
}
