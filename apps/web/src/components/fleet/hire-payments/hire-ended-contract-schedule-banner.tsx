import { HIRE_DRIVER_DOCUMENT_RETENTION_MONTHS } from "@/lib/fleet/hire-document-retention";

export function HireEndedContractScheduleBanner({
  contractEndedAtLabel,
  hasPostEndPrepaidPayments,
  settlementSettled = false,
  driverDocumentsRetainUntilLabel,
  driverDocumentsRetentionWarning,
  showDocumentRetention,
}: {
  contractEndedAtLabel: string;
  hasPostEndPrepaidPayments: boolean;
  settlementSettled?: boolean;
  driverDocumentsRetainUntilLabel?: string | null;
  driverDocumentsRetentionWarning?: string | null;
  /** Staff-only: show licence/ID copy retention deadline. */
  showDocumentRetention?: boolean;
}) {
  const prepaidCopy =
    hasPostEndPrepaidPayments && settlementSettled
      ? ", including prepaid periods marked Refunded once the company paid them back."
      : hasPostEndPrepaidPayments
        ? ", plus any periods paid in advance that still show a refund due."
        : "; later periods are not shown.";

  return (
    <section className="rph-card space-y-3 border-rph-border-strong p-4">
      <p className="text-sm text-rph-fg">
        <span className="font-medium">Contract ended</span> {contractEndedAtLabel}. The schedule shows
        rent through the end date
        {prepaidCopy}
      </p>

      {showDocumentRetention && driverDocumentsRetainUntilLabel ? (
        <div
          className={
            driverDocumentsRetentionWarning
              ? "rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
              : "rounded-lg border border-rph-border bg-rph-chrome/40 px-3 py-2.5"
          }
        >
          <p className="text-sm font-medium text-rph-fg">Driver document access deadline</p>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            Licence and ID copies for this hire are retained until{" "}
            <span className="font-semibold text-rph-fg">{driverDocumentsRetainUntilLabel}</span> (
            {HIRE_DRIVER_DOCUMENT_RETENTION_MONTHS} months after contract end). Download any files you
            need before this date.
          </p>
          {driverDocumentsRetentionWarning ? (
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              {driverDocumentsRetentionWarning}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
