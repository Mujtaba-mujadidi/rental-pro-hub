import { requireSuperAdmin } from "@/lib/auth/profile";
import { ADMIN_AGREEMENT_CHANGE_REQUESTS_NAV } from "@/lib/admin/contract-change-display";
import { fetchAdminContractChangeQueue } from "@/lib/admin/contract-change-requests-query";
import { ContractChangesClient } from "./contract-changes-client";

export default async function ContractChangesPage() {
  await requireSuperAdmin();

  const result = await fetchAdminContractChangeQueue();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">{ADMIN_AGREEMENT_CHANGE_REQUESTS_NAV}</h1>
        <p className="rph-muted mt-2 max-w-3xl text-sm">
          Review rental company agreement change requests, approve when correct, then prepare the renewal contract and
          send it for e-signature. Company records update automatically when the rental company signs.
        </p>
      </div>
      {!result.ok ? (
        <p className="rph-alert-error text-sm">Could not load contract change requests: {result.error}</p>
      ) : (
        <ContractChangesClient openRequests={result.openRequests} stuckRenewals={result.stuckRenewals} />
      )}
    </div>
  );
}
