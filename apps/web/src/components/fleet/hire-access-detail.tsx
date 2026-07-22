import DOMPurify from "isomorphic-dompurify";
import type { HireAccessDisplay } from "@/lib/fleet/hire-access-display";

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-rph-border bg-rph-chrome/30">
      <h2 className="border-b border-rph-border px-4 py-3 text-sm font-semibold text-rph-fg">{title}</h2>
      <dl className="divide-y divide-rph-border/70 px-4 py-1 text-sm">{children}</dl>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-rph-fg-muted">{label}</dt>
      <dd className="font-medium text-rph-fg">{value}</dd>
    </div>
  );
}

export function HireAccessDetail({ display }: { display: HireAccessDisplay }) {
  return (
    <div className="space-y-4">
      <DetailSection title="Rental company">
        <DetailRow label="Company" value={display.companyName} />
        {display.subcompanyLegalName ? <DetailRow label="Legal entity" value={display.subcompanyLegalName} /> : null}
        {display.subcompanyCompanyNumber ? (
          <DetailRow label="Company number" value={display.subcompanyCompanyNumber} />
        ) : null}
        {display.subcompanyAddress ? <DetailRow label="Address" value={display.subcompanyAddress} /> : null}
      </DetailSection>

      <DetailSection title="Vehicle">
        {display.vehicleDetailRows.length ? (
          display.vehicleDetailRows.map((row) => <DetailRow key={row.label} label={row.label} value={row.value} />)
        ) : (
          <>
            <DetailRow label="Registration" value={display.vehicleVrm} />
            <DetailRow label="Make & model" value={display.vehicleMakeModel} />
          </>
        )}
      </DetailSection>

      <DetailSection title="Rental details">
        <DetailRow label="Start date" value={display.startDateLabel} />
        {display.rentLabel ? <DetailRow label="Rent" value={display.rentLabel} /> : null}
        {display.depositLabel ? <DetailRow label="Deposit" value={display.depositLabel} /> : null}
        {display.contractLengthLines.length ? (
          <DetailRow
            label="Contract length"
            value={
              <ul className="list-disc space-y-1 pl-4 font-normal text-rph-fg-secondary">
                {display.contractLengthLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            }
          />
        ) : null}
      </DetailSection>

      {display.termsTitle && display.termsBody ? (
        <section className="rounded-xl border border-rph-border bg-rph-page">
          <div className="border-b border-rph-border px-4 py-3">
            <h2 className="text-sm font-semibold text-rph-fg">{display.termsTitle}</h2>
            {display.termsVersionLabel ? (
              <p className="rph-meta mt-1 text-xs">Version {display.termsVersionLabel}</p>
            ) : (
              <p className="rph-meta mt-1 text-xs">Terms and conditions that apply if you approve this request.</p>
            )}
          </div>
          <div
            className="prose prose-sm max-w-none px-4 py-4 dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(display.termsBody) }}
          />
        </section>
      ) : null}
    </div>
  );
}
