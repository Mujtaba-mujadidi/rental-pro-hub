"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { getDriverHireVehicleDocumentUrlAction, type HireDetailsPayload } from "@/app/actions/hire-details";
import { getHireInsuranceDocumentUrlAction } from "@/app/actions/hire-insurance";
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
  WarnIcon,
} from "@/components/fleet/hire-details/hire-details-shared";
import { HireInsuranceCard } from "@/components/fleet/hire-insurance/hire-insurance-card";
import {
  buildHireDetailsDriverComplianceTiles,
  buildHireDetailsInsuranceDocumentRow,
  buildHireDetailsVehicleDocumentRows,
  hireDetailsIsEnded,
} from "@/lib/fleet/hire-details-display";

export function HireDetailsDriverView({ data }: { data: HireDetailsPayload }) {
  const [error, setError] = useState<string | null>(null);
  const [insurancePanelOpen, setInsurancePanelOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ended = hireDetailsIsEnded(data.hireStatus);
  const rentalCompany = data.company.rentalSubcompanyName ?? data.company.companyName;

  const vehicleRows = useMemo(() => buildHireDetailsVehicleDocumentRows(data), [data]);
  const insuranceRow = useMemo(
    () => buildHireDetailsInsuranceDocumentRow(data, "driver"),
    [data],
  );
  const complianceTiles = useMemo(
    () => (ended ? [] : buildHireDetailsDriverComplianceTiles(data)),
    [data, ended],
  );

  function openInsuranceCertificate() {
    startTransition(async () => {
      const res = await getHireInsuranceDocumentUrlAction(data.hireGroupId, "driver");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      window.open(res.data.url, "_blank", "noopener,noreferrer");
    });
  }

  async function resolveVehicleDocumentUrl(documentId: string): Promise<string> {
    const res = await getDriverHireVehicleDocumentUrlAction(data.hireGroupId, documentId);
    if (!res.ok) throw new Error(res.error);
    return res.url;
  }

  async function resolveInsuranceUrl(): Promise<string> {
    const res = await getHireInsuranceDocumentUrlAction(data.hireGroupId, "driver");
    if (!res.ok) throw new Error(res.error);
    return res.data.url;
  }

  return (
    <div className="hire-ws-details-layout space-y-4">
      <header className="hire-ws-details-intro">
        {ended ? null : <p className="hire-ws-section-kicker">{data.hireReferenceKicker}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-rph-fg">Details &amp; documents</h1>
        <p className="mt-1 text-sm text-rph-fg-secondary">
          {ended
            ? "Your hire terms, vehicle information and signed agreements in one place."
            : "Your hire terms, vehicle, insurance and agreements."}
        </p>
      </header>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {data.hireSupersession ? (
        <div className="rph-alert-ok text-sm">
          <p>
            {data.hireSupersession.direction === "supersedes" ? (
              <>
                This hire replaced an earlier contract under a different company.{" "}
                <Link href={`/driver/hires/${data.hireSupersession.hireGroupId}`} className="rph-link">
                  View previous hire ({data.hireSupersession.lessorLabel})
                </Link>
              </>
            ) : (
              <>
                This hire was superseded by a replacement contract under {data.hireSupersession.lessorLabel}.{" "}
                <Link href={`/driver/hires/${data.hireSupersession.hireGroupId}`} className="rph-link">
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
                <FactRow label="Rental company" value={rentalCompany} />
                <FactRow label="Hire reference" value={data.hireReferenceLabel} />
              </div>
              <div className="hire-ws-details-facts-row">
                <FactRow label="Scheduled start" value={data.rental.startDateLabel} />
                <FactRow
                  label="Actual checkout"
                  value={data.rental.activatedAtLabel ?? "Not recorded"}
                />
              </div>
              <div className="hire-ws-details-facts-row">
                <FactRow
                  label={ended ? "Contract ended" : "Contract end"}
                  value={
                    ended
                      ? (data.rental.endedAtLabel ?? data.rental.contractEndLabel ?? "—")
                      : (data.rental.contractEndLabel ?? "—")
                  }
                />
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
            <h2 className="text-base font-semibold text-rph-fg">Insurance</h2>
            <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">
              If you are responsible for hire insurance, upload your certificate here.
            </p>
          </header>
          <div className="hire-ws-details-compliance-grid-single">
            {complianceTiles.map((tile) => (
              <div
                key={tile.id}
                className={`hire-ws-details-compliance-card hire-ws-details-compliance-${tile.tone}`}
              >
                <div className="flex items-start gap-3">
                  <span className="hire-ws-details-compliance-icon" aria-hidden>
                    {tile.tone === "warn" ? <WarnIcon /> : <DocTileIcon />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-rph-fg">{tile.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">{tile.detail}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={`hire-ws-details-status-pill hire-ws-details-status-pill-${tile.badgeTone}`}
                  disabled={pending && !tile.interactive}
                  onClick={() => {
                    if (tile.interactive) {
                      setInsurancePanelOpen((open) => !open);
                      return;
                    }
                    if (data.hireInsurance.hasDocument) openInsuranceCertificate();
                  }}
                >
                  <span className="hire-ws-details-status-pill-dot" aria-hidden />
                  {tile.interactive && insurancePanelOpen ? "Close upload" : tile.badgeLabel}
                </button>
              </div>
            ))}
          </div>
          {insurancePanelOpen ? (
            <div className="border-t border-rph-border px-3 py-3 sm:px-5 sm:py-4">
              <HireInsuranceCard
                hireGroupId={data.hireGroupId}
                insurance={data.hireInsurance}
                audience="driver"
                onError={setError}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="hire-ws-payments-panel">
        <header className="hire-ws-payments-panel-header">
          <h2 className="text-base font-semibold text-rph-fg">Vehicle and hire documents</h2>
          <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">
            {ended
              ? "Vehicle copies were only available while this hire was active. Signed agreements remain below."
              : "Vehicle copies are available while this hire is active. Hire insurance stays with this contract."}
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
                  {data.vehicleDocumentsAccessible
                    ? `${vehicleRows.length} document${vehicleRows.length === 1 ? "" : "s"} linked to this hire`
                    : "Available while your hire is active"}
                </p>
              </div>
            </div>
            {data.vehicleDocumentsAccessible ? (
              <ul className="hire-ws-details-doc-list">
                {vehicleRows.map((row) => (
                  <HireDetailsDocumentRow
                    key={row.id}
                    label={row.label}
                    subtitle={row.subtitle}
                    statusLabel={row.status.label}
                    statusTone={row.status.tone}
                    resolveUrl={
                      row.document.status === "on_file"
                        ? () => resolveVehicleDocumentUrl(row.document.id)
                        : undefined
                    }
                    fileName={hireDetailsDocumentFileName(row.label, row.document.fileName)}
                    onError={setError}
                  />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-rph-fg-secondary">
                Vehicle documents are only available while your hire is active. Signed hire
                agreements remain available separately.
              </p>
            )}
          </div>

          <div className="hire-ws-details-docs-column">
            <div className="hire-ws-details-docs-column-head">
              <span className="hire-ws-details-docs-column-icon" aria-hidden>
                <DocTileIcon />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-rph-fg">Hire insurance</h3>
                <p className="text-xs text-rph-fg-secondary">Certificate for this hire</p>
              </div>
            </div>
            <ul className="hire-ws-details-doc-list">
              <HireDetailsDocumentRow
                key={insuranceRow.id}
                label={insuranceRow.label}
                subtitle={insuranceRow.subtitle}
                statusLabel={insuranceRow.status.label}
                statusTone={insuranceRow.status.tone}
                resolveUrl={data.hireInsurance.hasDocument ? resolveInsuranceUrl : undefined}
                fileName={hireDetailsDocumentFileName(insuranceRow.label, insuranceRow.document.fileName)}
                onError={setError}
              />
            </ul>
            <p className="px-4 pb-3 text-xs text-rph-fg-muted">
              Driving licence and PHV copies stay in your driver profile.
            </p>
          </div>
        </div>
      </section>

      <HireDetailsAgreementsSection
        agreements={data.rental.agreements}
        description={
          ended
            ? "Your contracts for this hire are kept together with their form and signing status."
            : "Your contracts for this hire are shown together; multiple agreements are expected by design."
        }
      />
    </div>
  );
}
