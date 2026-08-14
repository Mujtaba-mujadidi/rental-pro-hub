"use client";

import type { HireDetailsPayload } from "@/app/actions/hire-details";
import {
  formatHireDetailsVehicleSubtitle,
  vehicleExpiryHint,
} from "@/lib/fleet/hire-details-display";

export function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-rph-fg-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-rph-fg">{value}</dd>
    </div>
  );
}

export function HireDetailsVehiclePanel({
  data,
  ended,
}: {
  data: Pick<HireDetailsPayload, "vehicle" | "rental">;
  ended: boolean;
}) {
  return (
    <aside className="hire-ws-payments-panel">
      <div className="hire-ws-details-panel-body">
        <div className="hire-ws-details-vehicle-head">
          <span className="hire-ws-details-vehicle-icon" aria-hidden>
            <CarIcon />
          </span>
          <div className="min-w-0">
            <p className="hire-ws-section-kicker">Hire vehicle</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-rph-fg">{data.vehicle.vrm}</p>
            <p className="mt-1 text-sm text-rph-fg-secondary">
              {formatHireDetailsVehicleSubtitle(data.vehicle)}
            </p>
          </div>
        </div>
        <dl className="hire-ws-details-vehicle-expiry-list">
          <ExpiryRow
            label="MOT"
            value={data.vehicle.motExpiryLabel}
            hint={ended ? null : vehicleExpiryHint(data.vehicle.motExpiryYmd, data.rental.contractEndYmd)}
          />
          <ExpiryRow
            label="Tax"
            value={data.vehicle.taxExpiryLabel}
            hint={ended ? null : vehicleExpiryHint(data.vehicle.taxExpiryYmd, data.rental.contractEndYmd)}
          />
          <ExpiryRow
            label="PHV licence"
            value={data.vehicle.phvExpiryLabel}
            hint={ended ? null : vehicleExpiryHint(data.vehicle.phvExpiryYmd, data.rental.contractEndYmd)}
          />
        </dl>
      </div>
    </aside>
  );
}

export function HireDetailsAgreementsSection({
  agreements,
  description,
}: {
  agreements: HireDetailsPayload["rental"]["agreements"];
  description: string;
}) {
  return (
    <section className="hire-ws-payments-panel">
      <header className="hire-ws-payments-panel-header">
        <h2 className="text-base font-semibold text-rph-fg">Signed agreements</h2>
        <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">{description}</p>
      </header>
      <ul className="hire-ws-details-agreements-list">
        {agreements.length ? (
          agreements.map((agreement) => (
            <li key={agreement.id} className="hire-ws-details-agreement-row">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className="hire-ws-details-doc-icon" aria-hidden>
                  <DocIcon />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rph-fg">{agreement.label}</p>
                  <p className="mt-0.5 text-xs text-rph-fg-secondary">
                    {agreement.signedAtLabel
                      ? `Signed: ${agreement.signedAtLabel}`
                      : `Ends ${agreement.endDateLabel}`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
                <span className="hire-ws-details-doc-chip hire-ws-details-doc-chip-success">
                  <span className="hire-ws-details-doc-chip-dot" aria-hidden />
                  {agreement.statusLabel}
                </span>
                {agreement.pdfUrl ? (
                  <a
                    href={agreement.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hire-ws-details-agreement-btn"
                  >
                    View PDF
                  </a>
                ) : null}
              </div>
            </li>
          ))
        ) : (
          <li className="px-4 py-5 text-sm text-rph-fg-secondary sm:px-5">
            No agreements on this hire yet.
          </li>
        )}
      </ul>
    </section>
  );
}

function ExpiryRow({ label, value, hint }: { label: string; value: string; hint: string | null }) {
  return (
    <div className="hire-ws-details-vehicle-expiry-row">
      <dt className="text-sm text-rph-fg-secondary">{label}</dt>
      <dd className="text-right">
        <p className="text-sm font-semibold text-rph-fg">{value}</p>
        {hint ? <p className="mt-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">{hint}</p> : null}
      </dd>
    </div>
  );
}

export function CarIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 17h10M5 11l1.5-4h11L19 11M6 17a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PersonIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M20 21a8 8 0 0 0-16 0" strokeLinecap="round" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

export function DocIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

export function WarnIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DocTileIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
