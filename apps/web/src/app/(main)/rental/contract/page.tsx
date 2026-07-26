import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { canRequestContractChange } from "@/lib/auth/rental-permissions";
import { loadRentalContractPageData } from "@/lib/companies/rental-contract-page-data";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { RentalActiveAgreementCard } from "../rental-active-agreement-card";
import { RentalContractDetailsCard } from "../rental-contract-details-card";
import { RentalPlatformAgreementTabs } from "../rental-platform-agreement-tabs";
import { RentalRenewalSigningActions } from "../rental-renewal-signing-actions";

export default async function RentalContractPage() {
  const { profile } = await requireRentalCompanyArea();
  const data = await loadRentalContractPageData(profile);
  const companyId = profile.company_id ?? "";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="rph-h1">{rentalContractCopy.platformAgreementPageTitle}</h1>
        <p className="rph-muted mt-2 max-w-2xl text-sm">{rentalContractCopy.platformAgreementPageLead}</p>
      </div>

      {data.pendingRenewal ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <h2 className="text-sm font-semibold text-amber-950 dark:text-amber-100">Renewal signature required</h2>
          <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
            A contract amendment is waiting for your signature. Open it below or request the link by email.
          </p>
          <div className="mt-3">
            <RentalRenewalSigningActions
              signReady={data.pendingRenewal.signReady}
              signBlockedReason={data.pendingRenewal.signBlockedReason}
            />
          </div>
        </div>
      ) : null}

      <RentalPlatformAgreementTabs
        previousVersions={data.previousVersions}
        activePanel={
          <div className="space-y-4">
            <RentalActiveAgreementCard
              version={data.activeVersion}
              companyName={data.company?.name?.trim() || "Your company"}
            />
            {data.company ? (
              <RentalContractDetailsCard
                company={data.company}
                companyId={companyId}
                submittedChange={data.submittedChange}
                lastRejection={data.lastRejection}
                serverDraft={data.serverDraft}
                signatoryDefaults={data.signatoryDefaults}
                canRequestContractChange={canRequestContractChange(profile)}
              />
            ) : (
              <p className="rph-muted text-sm">Could not load your company details.</p>
            )}
          </div>
        }
      />
    </div>
  );
}
