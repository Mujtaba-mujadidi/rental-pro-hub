import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { getRentalSessionLifecycleCached } from "@/lib/auth/rental-lifecycle";
import { loadPendingContractRenewal } from "@/lib/companies/pending-contract-renewal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AwaitingContractClient } from "./awaiting-contract-client";

type SearchParams = { signError?: string };

export default async function RentalAwaitingContractPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { profile } = await requireRentalCompanyArea({ skipActiveContractRequirement: true });
  const user = await getSessionUser();
  const sp = await searchParams;
  const companyId = profile.company_id?.trim();

  let renewalSignaturePending = false;
  let signReady = false;
  let signBlockedReason: string | null = null;
  let dashboardAccess = false;

  if (companyId && user) {
    const life = await getRentalSessionLifecycleCached(user.id, user.email);
    dashboardAccess = life.kind === "rental" && life.contractActive && life.renewalSignaturePending;

    try {
      const admin = createSupabaseAdminClient();
      const pending = await loadPendingContractRenewal(admin, companyId);
      renewalSignaturePending = Boolean(pending);
      signReady = pending?.signReady ?? false;
      signBlockedReason = pending?.signBlockedReason ?? null;
    } catch {
      renewalSignaturePending = dashboardAccess;
    }
  }

  return (
    <AwaitingContractClient
      renewalSignaturePending={renewalSignaturePending}
      signReady={signReady}
      signBlockedReason={signBlockedReason}
      dashboardAccess={dashboardAccess}
      signError={sp.signError ?? null}
    />
  );
}
