import {
  formatContractVersionStatus,
  type RentalContractVersionMeta,
} from "@/lib/companies/contract-version-display";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { RentalContractVersionPdfActions } from "./rental-contract-version-pdf-actions";

export function RentalActiveAgreementCard({
  version,
  companyName,
}: {
  version: RentalContractVersionMeta | null;
  companyName: string;
}) {
  if (!version) {
    return (
      <p className="rounded-xl border border-rph-border bg-rph-raised px-4 py-6 text-sm text-rph-fg-muted">
        {rentalContractCopy.platformAgreementActiveUnavailable}
      </p>
    );
  }

  const signedAt = version.signedByCustomerAt ?? version.signedAt;
  const signedLabel = signedAt ? formatUkDateTime(signedAt) : null;

  return (
    <article className="rounded-xl border border-rph-border bg-rph-raised p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-rph-fg">{rentalContractCopy.platformAgreementActiveTitle}</h2>
          <p className="mt-1 truncate text-sm font-medium text-rph-fg">{companyName}</p>
          <p className="mt-2 text-sm text-rph-fg-muted">
            Version {version.versionNumber} · {formatContractVersionStatus(version.versionStatus)}
            {signedLabel ? (
              <>
                {" "}
                · {rentalContractCopy.platformAgreementSignedOn}{" "}
                <span className="font-medium text-rph-fg">{signedLabel}</span>
              </>
            ) : null}
          </p>
          {version.changeReason?.trim() ? (
            <p className="mt-2 text-sm text-rph-fg-secondary">{version.changeReason}</p>
          ) : null}
        </div>
      </div>
      <RentalContractVersionPdfActions
        versionId={version.id}
        versionNumber={version.versionNumber}
        hasPdf={version.hasPdf}
      />
    </article>
  );
}
