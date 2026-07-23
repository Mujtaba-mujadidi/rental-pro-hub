"use client";

import type {
  HireDetailsDocumentItem,
  HireDetailsHirerCard,
  HireDetailsImportantDateRow,
  HireDetailsPayload,
  HireDetailsRentalCard,
  HireDetailsVehicleCard,
} from "@/app/actions/hire-details";
import {
  HireDetailsDocActionsMenu,
  hireDetailsDocumentFileName,
} from "@/components/fleet/hire-details/hire-details-doc-actions";
import { useState } from "react";

const cardClass = "rph-card flex h-full flex-col p-3";
const sectionTitleClass = "text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted";
const subsectionClass = "border-t border-rph-border/80 pt-2.5 mt-2.5";

function DocFileIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-rph-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="shrink-0 text-rph-fg-muted">{label}</span>
      <span className="text-right font-semibold text-rph-fg">{value || "—"}</span>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <p className="text-[10px] font-medium text-rph-fg-muted">{label}</p>
      <p className="font-semibold text-rph-fg">{value || "—"}</p>
    </div>
  );
}

function DateTextList({ rows }: { rows: HireDetailsImportantDateRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <DetailRow key={row.label} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

function DocumentsList({
  documents,
  onError,
  inaccessibleMessage,
}: {
  documents: HireDetailsDocumentItem[];
  onError?: (message: string) => void;
  inaccessibleMessage?: string | null;
}) {
  if (inaccessibleMessage) {
    return (
      <div>
        <p className="mb-1.5 text-[10px] font-semibold text-rph-fg-secondary">Documents</p>
        <p className="text-xs text-rph-fg-muted">{inaccessibleMessage}</p>
      </div>
    );
  }

  const missingCount = documents.filter((doc) => doc.status === "missing").length;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-rph-fg-secondary">Documents</p>
        {missingCount ? (
          <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {missingCount} missing
          </span>
        ) : documents.length ? (
          <span className="rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Complete
          </span>
        ) : null}
      </div>
      {!documents.length ? (
        <p className="text-xs text-rph-fg-muted">No documents on file.</p>
      ) : (
        <ul className="divide-y divide-rph-border/80">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2 py-2 first:pt-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <DocFileIcon />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-rph-fg">{doc.label}</p>
                  <p className="truncate text-[10px] text-rph-fg-muted">
                    {doc.status === "on_file" ? doc.fileName ?? "On file" : "Not uploaded"}
                  </p>
                </div>
                {doc.status === "missing" ? (
                  <span className="shrink-0 rounded bg-amber-100 px-1 py-px text-[9px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    Missing
                  </span>
                ) : null}
              </div>
              {doc.status === "on_file" ? (
                <HireDetailsDocActionsMenu
                  viewUrl={doc.viewUrl}
                  fileName={hireDetailsDocumentFileName(doc.label, doc.fileName)}
                  onError={onError}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RentalCard({ rental, onError }: { rental: HireDetailsRentalCard; onError?: (message: string) => void }) {
  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>Rental</h2>
      {rental.companyName ? (
        <p className="rph-meta mt-1 text-xs">{rental.companyName}</p>
      ) : null}

      <div className="mt-2 space-y-1.5">
        <DetailRow label="Start date" value={rental.startDateLabel} />
        {rental.activatedAtLabel ? <DetailRow label="On rent since" value={rental.activatedAtLabel} /> : null}
        {rental.endedAtLabel ? <DetailRow label="Ended" value={rental.endedAtLabel} /> : null}
        <DetailRow label="Rent" value={rental.rentAmountLabel} />
        <DetailRow label="Frequency" value={rental.rentFrequencyLabel} />
        {rental.depositLabel ? <DetailRow label="Deposit" value={rental.depositLabel} /> : null}
      </div>

      <div className={`${subsectionClass} mt-auto`}>
        <p className="mb-1.5 text-[10px] font-semibold text-rph-fg-secondary">Agreements</p>
        {!rental.agreements.length ? (
          <p className="text-xs text-rph-fg-muted">No agreements on this hire yet.</p>
        ) : (
          <ul className="space-y-2">
            {rental.agreements.map((agreement) => (
              <li
                key={agreement.id}
                className="flex items-start justify-between gap-2 rounded border border-rph-border/80 bg-rph-page/40 px-2 py-1.5"
              >
                <div className="min-w-0 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-rph-fg">{agreement.label}</span>
                    <span className="shrink-0 text-[10px] font-medium text-rph-fg-muted">{agreement.statusLabel}</span>
                  </div>
                  <p className="mt-0.5 text-rph-fg-muted">Ends {agreement.endDateLabel}</p>
                </div>
                {agreement.pdfUrl ? (
                  <HireDetailsDocActionsMenu
                    viewUrl={agreement.pdfUrl}
                    fileName={agreement.downloadFileName ?? hireDetailsDocumentFileName(agreement.label)}
                    onError={onError}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function VehicleDetailsCard({
  vehicle,
  dates,
  documents,
  vehicleDocumentsAccessible = true,
  onError,
}: {
  vehicle: HireDetailsVehicleCard;
  dates: HireDetailsImportantDateRow[];
  documents: HireDetailsDocumentItem[];
  vehicleDocumentsAccessible?: boolean;
  onError?: (message: string) => void;
}) {
  return (
    <section className={cardClass}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={sectionTitleClass}>Vehicle</h2>
        <p className="text-sm font-bold tracking-wide text-rph-fg">{vehicle.vrm}</p>
      </div>
      <p className="rph-meta text-xs">
        {vehicle.make} {vehicle.model}
        {vehicle.colour ? ` · ${vehicle.colour.toUpperCase()}` : ""}
        {vehicle.fuelType ? ` · ${vehicle.fuelType.toUpperCase()}` : ""}
      </p>

      {dates.length ? (
        <div className="mt-2">
          <p className="mb-1 text-[10px] font-semibold text-rph-fg-secondary">Expiry dates</p>
          <DateTextList rows={dates} />
        </div>
      ) : null}

      <div className={`${subsectionClass} mt-auto`}>
        <DocumentsList
          documents={documents}
          onError={onError}
          inaccessibleMessage={
            vehicleDocumentsAccessible
              ? null
              : "Vehicle documents are only available while your hire is active. Signed hire agreements remain available separately."
          }
        />
      </div>
    </section>
  );
}

function HirerDetailsCard({
  hirer,
  dates,
  documents,
  onError,
}: {
  hirer: HireDetailsHirerCard;
  dates: HireDetailsImportantDateRow[];
  documents: HireDetailsDocumentItem[];
  onError?: (message: string) => void;
}) {
  return (
    <section className={cardClass}>
      <h2 className={sectionTitleClass}>Hirer</h2>
      <div className="mt-2 space-y-1.5">
        <DetailBlock label="Name" value={hirer.fullName} />
        {hirer.email ? <DetailBlock label="Email" value={hirer.email} /> : null}
        {hirer.phone ? <DetailBlock label="Phone" value={hirer.phone} /> : null}
        {hirer.address ? <DetailBlock label="Address" value={hirer.address} /> : null}
        {hirer.drivingLicenceNumber ? <DetailBlock label="Driving licence" value={hirer.drivingLicenceNumber} /> : null}
      </div>

      {dates.length ? (
        <div className={subsectionClass}>
          <p className="mb-1 text-[10px] font-semibold text-rph-fg-secondary">Expiry dates</p>
          <DateTextList rows={dates} />
        </div>
      ) : null}

      <div className={`${subsectionClass} mt-auto`}>
        <DocumentsList documents={documents} onError={onError} />
      </div>
    </section>
  );
}

function StaffDetailsLayout({ data }: { data: HireDetailsPayload }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      <div className="grid gap-3 xl:grid-cols-3">
        <RentalCard rental={data.rental} onError={setError} />
        <VehicleDetailsCard
          vehicle={data.vehicle}
          dates={data.importantDates.vehicle}
          documents={data.vehicleDocuments}
          onError={setError}
        />
        {data.hirer ? (
          <HirerDetailsCard
            hirer={data.hirer}
            dates={data.importantDates.hirer}
            documents={data.hirerDocuments}
            onError={setError}
          />
        ) : (
          <section className={`${cardClass} items-center justify-center`}>
            <p className="text-xs text-rph-fg-muted">No hirer linked to this hire.</p>
          </section>
        )}
      </div>
    </div>
  );
}

function DriverDetailsLayout({ data }: { data: HireDetailsPayload }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      <div className="grid gap-3 xl:grid-cols-3">
        <RentalCard rental={data.rental} onError={setError} />
        <div className="xl:col-span-2">
          <VehicleDetailsCard
            vehicle={data.vehicle}
            dates={data.importantDates.vehicle}
            documents={data.vehicleDocuments}
            vehicleDocumentsAccessible={data.vehicleDocumentsAccessible}
            onError={setError}
          />
        </div>
      </div>
    </div>
  );
}

export function HireDetailsView({
  data,
  audience,
}: {
  data: HireDetailsPayload;
  audience: "driver" | "staff";
}) {
  if (audience === "staff") return <StaffDetailsLayout data={data} />;
  return <DriverDetailsLayout data={data} />;
}
