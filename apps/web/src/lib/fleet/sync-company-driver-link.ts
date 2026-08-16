import { hireAllowsCompanyDriverPackageAccess } from "@/lib/fleet/hire-driver-package-access";
import { ukTodayYmd } from "@/lib/datetime/uk";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Keep `company_driver_links` aligned with hire-scoped approvals.
 * Removes the company-wide link when no remaining hire still grants driver-package access.
 */
export async function syncCompanyDriverLinkAfterAccessChange(
  admin: Admin,
  parentCompanyId: string,
  driverUserId: string,
): Promise<void> {
  const companyId = parentCompanyId.trim();
  const driverId = driverUserId.trim();
  if (!companyId || !driverId) return;

  const { data: hires } = await admin
    .from("vehicle_hire_groups")
    .select("id, status, driver_access_status, driver_documents_retain_until")
    .eq("parent_company_id", companyId)
    .eq("driver_user_id", driverId);

  const todayYmd = ukTodayYmd();
  const stillGranted = (hires ?? []).some((hire) =>
    hireAllowsCompanyDriverPackageAccess({
      driverAccessStatus: (hire.driver_access_status as string | null) ?? null,
      hireStatus: (hire.status as string | null) ?? null,
      retainUntilYmd: (hire.driver_documents_retain_until as string | null) ?? null,
      todayYmd,
    }),
  );

  if (stillGranted) return;

  await admin
    .from("company_driver_links")
    .update({ status: "removed" })
    .eq("parent_company_id", companyId)
    .eq("driver_user_id", driverId)
    .eq("status", "active");
}
