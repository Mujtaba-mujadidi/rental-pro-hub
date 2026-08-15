"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { HireDetailsPayload } from "@/app/actions/hire-details";
import { getHireInsuranceDocumentUrlAction } from "@/app/actions/hire-insurance";
import { HireInsuranceCard } from "@/components/fleet/hire-insurance/hire-insurance-card";
import {
  HireDetailsDocumentRow,
  hireDetailsDocumentFileName,
} from "@/components/fleet/hire-details/hire-details-document-row";
import {
  CarIcon,
  DocTileIcon,
  FactRow,
  HireDetailsAgreementsSection,
  HireDetailsVehiclePanel,
  PersonIcon,
  WarnIcon,
} from "@/components/fleet/hire-details/hire-details-shared";
import { InsuranceDocumentIcon } from "@/components/fleet/insurance-document-icon";
import {
  buildHireDetailsComplianceTiles,
  buildHireDetailsDriverDocumentRows,
  buildHireDetailsExpiringSoonItems,
  buildHireDetailsInsuranceDocumentRow,
  buildHireDetailsVehicleDocumentRows,
  hireDetailsIsEnded,
  HIRE_DETAILS_EXPIRING_PREVIEW_COUNT,
  type HireDetailsExpiringSoonItem,
} from "@/lib/fleet/hire-details-display";

export function HireDetailsCompanyView({ data }: { data: HireDetailsPayload }) {
  const [error, setError] = useState<string | null>(null);
  const [insurancePanelOpen, setInsurancePanelOpen] = useState(false);
  const [expiringExpanded, setExpiringExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const ended = hireDetailsIsEnded(data.hireStatus);

  const vehicleRows = useMemo(() => buildHireDetailsVehicleDocumentRows(data), [data]);
  const driverRows = useMemo(
    () => (data.hirerDocumentsAccessible ? buildHireDetailsDriverDocumentRows(data) : []),
    [data],
  );
  const insuranceRow = useMemo(() => buildHireDetailsInsuranceDocumentRow(data), [data]);
  const driverDocumentCount = driverRows.length + 1;
  const complianceTiles = useMemo(
    () => (ended ? [] : buildHireDetailsComplianceTiles(data)),
    [data, ended],
  );
  const expiringItems = useMemo(
    () => (ended ? [] : buildHireDetailsExpiringSoonItems(data)),
    [data, ended],
  );
  const visibleExpiringItems = expiringExpanded
    ? expiringItems
    : expiringItems.slice(0, HIRE_DETAILS_EXPIRING_PREVIEW_COUNT);
  const hiddenExpiringCount = Math.max(0, expiringItems.length - HIRE_DETAILS_EXPIRING_PREVIEW_COUNT);

  function openInsuranceCertificate() {
    startTransition(async () => {
      const res = await getHireInsuranceDocumentUrlAction(data.hireGroupId, "staff");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    <div className="hire-ws-details-layout space-y-4">
      <header className="hire-ws-details-intro">
        {ended ? null : <p className="hire-ws-section-kicker">{data.hireReferenceKicker}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-rph-fg">Details &amp; documents</h1>
        <p className="mt-1 text-sm text-rph-fg-secondary">
          {ended
            ? "Hire terms, vehicle information and signed agreements in one place."
            : "Live hire terms, responsible company, compliance and agreements."}
        </p>
      </header>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {!ended && data.driverDocumentsRetentionWarning ? (
        <p
          className={
            data.hirerDocumentsAccessible ? "rph-alert-warning text-sm" : "rph-alert-error text-sm"
          }
        >
          {data.driverDocumentsRetentionWarning}
          {data.driverDocumentsRetainUntilLabel
            ? ` Access until ${data.driverDocumentsRetainUntilLabel}.`
            : null}
        </p>
      ) : null}

      {data.hireSupersession ? (
        <div className="rph-alert-ok text-sm">
          <p>
            {data.hireSupersession.direction === "supersedes" ? (
              <>
                This hire replaced an earlier contract under a different company.{" "}
                <Link href={`/rental/hires/${data.hireSupersession.hireGroupId}`} className="rph-link">
                  View previous hire ({data.hireSupersession.lessorLabel})
                </Link>
              </>
            ) : (
              <>
                This hire was superseded by a replacement contract under {data.hireSupersession.lessorLabel}.{" "}
                <Link href={`/rental/hires/${data.hireSupersession.hireGroupId}`} className="rph-link">
                  View replacement hire
                </Link>
              </>
            )}
          </p>
        </div>
      ) : null}

      <div className="hire-ws-details-top-grid">
        <section className="hire-ws-payments-panel">
          <div className="hire-ws-details-panel-body">
            <h2 className="text-base font-semibold text-rph-fg">Hire details</h2>
            <dl className="hire-ws-details-facts-list mt-4">
              <div className="hire-ws-details-facts-row">
                <FactRow
                  label="Rental company"
                  value={data.company.rentalSubcompanyName ?? data.company.companyName}
                />
                <FactRow label="Driver" value={data.hirer?.fullName ?? "—"} />
              </div>
              <div className="hire-ws-details-facts-row">
                <FactRow label="Hire reference" value={data.hireReferenceLabel} />
                <FactRow label="Scheduled start" value={data.rental.startDateLabel} />
              </div>
              <div className="hire-ws-details-facts-row">
                <FactRow
                  label="Actual checkout"
                  value={data.rental.activatedAtLabel ?? "Not recorded"}
                />
                <FactRow
                  label={ended ? "Contract ended" : "Contract end"}
                  value={
                    ended
                      ? (data.rental.endedAtLabel ?? data.rental.contractEndLabel ?? "—")
                      : (data.rental.contractEndLabel ?? "—")
                  }
                />
              </div>
              <div className="hire-ws-details-facts-row">
                <FactRow label="Rent and deposit" value={data.rental.rentRateDetailsLabel} />
              </div>
            </dl>
            {!ended && data.rental.checkoutBeforeScheduledNote ? (
              <p className="hire-ws-details-warn-note mt-4">{data.rental.checkoutBeforeScheduledNote}</p>
            ) : null}
          </div>
        </section>

        <HireDetailsVehiclePanel data={data} ended={ended} />
      </div>

      {!ended ? (
      <section className="hire-ws-payments-panel">
        <header className="hire-ws-payments-panel-header">
          <h2 className="text-base font-semibold text-rph-fg">Compliance and insurance</h2>
          <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">
            Show missing and expiring requirements before they become operational problems.
          </p>
        </header>
        <div className="hire-ws-details-compliance-scroll">
        <div className="hire-ws-details-compliance-grid">
          {complianceTiles.map((tile) => (
            <div
              key={tile.id}
              className={`hire-ws-details-compliance-card hire-ws-details-compliance-${tile.tone}`}
            >
              <div className="flex items-start gap-3">
                <span className="hire-ws-details-compliance-icon" aria-hidden>
                  {tile.id === "insurance" ? (
                    <InsuranceDocumentIcon />
                  ) : tile.tone === "warn" ? (
                    <WarnIcon />
                  ) : (
                    <DocTileIcon />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-rph-fg">{tile.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">{tile.detail}</p>
                </div>
              </div>
              <button
                type="button"
                className={`hire-ws-details-status-pill hire-ws-details-status-pill-${tile.badgeTone}`}
                disabled={pending && tile.id === "insurance" && !tile.interactive}
                onClick={() => {
                  if (tile.id !== "insurance") return;
                  if (tile.interactive) {
                    setInsurancePanelOpen((open) => !open);
                    return;
                  }
                  if (data.hireInsurance.hasDocument) openInsuranceCertificate();
                }}
              >
                <span className="hire-ws-details-status-pill-dot" aria-hidden />
                {tile.id === "insurance" && tile.interactive && insurancePanelOpen
                  ? "Close upload"
                  : tile.badgeLabel}
              </button>
            </div>
          ))}
        </div>
        {expiringItems.length ? (
          <div className="hire-ws-details-expiring-block">
            <div className="hire-ws-details-expiring-head">
              <h3 className="text-sm font-semibold text-rph-fg">Also expiring during this hire</h3>
              <p className="mt-0.5 text-xs text-rph-fg-secondary">
                Vehicle documents and shorter agreements that expire while this hire is still running.
              </p>
            </div>
            <ul className="hire-ws-details-expiring-list">
              {visibleExpiringItems.map((item) => (
                <ExpiringSoonRow key={item.id} item={item} />
              ))}
            </ul>
            {hiddenExpiringCount > 0 ? (
              <button
                type="button"
                className="hire-ws-details-expiring-toggle"
                aria-expanded={expiringExpanded}
                onClick={() => setExpiringExpanded((open) => !open)}
              >
                <span>
                  {expiringExpanded ? "Show fewer" : `Show all (${expiringItems.length})`}
                </span>
                <ChevronIcon open={expiringExpanded} />
              </button>
            ) : null}
          </div>
        ) : null}
        </div>
        {insurancePanelOpen ? (
          <div className="border-t border-rph-border px-3 py-3 sm:px-5 sm:py-4">
            <HireInsuranceCard
              hireGroupId={data.hireGroupId}
              insurance={data.hireInsurance}
              audience="staff"
              onError={setError}
            />
          </div>
        ) : null}
      </section>
      ) : null}

      <section className="hire-ws-payments-panel">
        <header className="hire-ws-payments-panel-header">
          <h2 className="text-base font-semibold text-rph-fg">Vehicle and driver documents</h2>
          <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">
            Company staff can view or download the documents linked to this hire.
          </p>
        </header>
        <div className="hire-ws-details-docs-grid">
          <div className="hire-ws-details-docs-column">
            <div className="hire-ws-details-docs-column-head">
              <span className="hire-ws-details-docs-column-icon" aria-hidden>
                <CarIcon />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-rph-fg">Vehicle documents</h3>
                <p className="text-xs text-rph-fg-secondary">
                  {vehicleRows.length} document{vehicleRows.length === 1 ? "" : "s"} linked to this hire
                </p>
              </div>
            </div>
            <ul className="hire-ws-details-doc-list">
              {vehicleRows.map((row) => (
                <HireDetailsDocumentRow
                  key={row.id}
                  label={row.label}
                  subtitle={row.subtitle}
                  statusLabel={row.status.label}
                  statusTone={row.status.tone}
                  viewUrl={row.document.viewUrl}
                  fileName={hireDetailsDocumentFileName(row.label, row.document.fileName)}
                  onError={setError}
                />
              ))}
            </ul>
          </div>

          <div className="hire-ws-details-docs-column">
            <div className="hire-ws-details-docs-column-head">
              <span className="hire-ws-details-docs-column-icon" aria-hidden>
                <PersonIcon />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-rph-fg">Driver documents</h3>
                <p className="text-xs text-rph-fg-secondary">
                  {driverDocumentCount} document{driverDocumentCount === 1 ? "" : "s"} linked to this hire
                </p>
              </div>
            </div>
            {!data.hirerDocumentsAccessible ? (
              <p className="px-4 py-3 text-sm text-rph-fg-secondary">
                Driver document access for this hire has expired.
              </p>
            ) : !data.hirer ? (
              <p className="px-4 py-3 text-sm text-rph-fg-secondary">No driver linked to this hire.</p>
            ) : null}
            <ul className="hire-ws-details-doc-list">
              {driverRows.map((row) => (
                <HireDetailsDocumentRow
                  key={row.id}
                  label={row.label}
                  subtitle={row.subtitle}
                  statusLabel={row.status.label}
                  statusTone={row.status.tone}
                  viewUrl={row.document.viewUrl}
                  fileName={hireDetailsDocumentFileName(row.label, row.document.fileName)}
                  onError={setError}
                />
              ))}
              <HireDetailsDocumentRow
                key={insuranceRow.id}
                label={insuranceRow.label}
                subtitle={insuranceRow.subtitle}
                statusLabel={insuranceRow.status.label}
                statusTone={insuranceRow.status.tone}
                icon={<InsuranceDocumentIcon />}
                resolveUrl={
                  data.hireInsurance.hasDocument
                    ? async () => {
                        const res = await getHireInsuranceDocumentUrlAction(data.hireGroupId, "staff");
                        if (!res.ok) throw new Error(res.error);
                        return res.data.url;
                      }
                    : undefined
                }
                fileName={hireDetailsDocumentFileName(insuranceRow.label, insuranceRow.document.fileName)}
                onError={setError}
              />
            </ul>
          </div>
        </div>
        {ended && data.driverDocumentsRetentionWarning ? (
          <p
            className={
              data.hirerDocumentsAccessible
                ? "hire-ws-details-docs-retention"
                : "hire-ws-details-docs-retention hire-ws-details-docs-retention-expired"
            }
          >
            {data.driverDocumentsRetentionWarning}
            {data.driverDocumentsRetainUntilLabel
              ? ` Access until ${data.driverDocumentsRetainUntilLabel}.`
              : null}
          </p>
        ) : null}
      </section>

      <HireDetailsAgreementsSection
        agreements={data.rental.agreements}
        description={
          ended
            ? "All contracts created for this hire are kept together with their form and signing status."
            : "All contracts created for this hire are shown together; multiple agreements are expected by design."
        }
      />
    </div>
  );
}

function ExpiringSoonRow({ item }: { item: HireDetailsExpiringSoonItem }) {
  const hireAgreement = item.kind === "hire_agreement";
  const expired = item.statusTone === "danger";
  return (
    <li className="hire-ws-details-expiring-row">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">
          {hireAgreement ? "Hire agreement" : "Vehicle document"}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-rph-fg">{item.label}</p>
        <p className={`mt-0.5 text-xs ${expired ? "font-medium text-red-800 dark:text-red-200" : "text-rph-fg-secondary"}`}>
          {expired ? "Ended" : hireAgreement ? "Ends" : "Expires"} {item.expiryLabel}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className={`hire-ws-details-doc-chip hire-ws-details-doc-chip-${item.statusTone}`}>
          <span className="hire-ws-details-doc-chip-dot" aria-hidden />
          {item.statusLabel}
        </span>
        {item.viewUrl ? (
          <a
            href={item.viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hire-ws-details-agreement-btn"
          >
            View
          </a>
        ) : null}
      </div>
    </li>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-rph-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

