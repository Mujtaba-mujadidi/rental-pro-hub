"use client";

import type { HireOverviewContext } from "@/lib/fleet/hire-overview-types";
import { RENT_CADENCE_LABELS } from "@/lib/fleet/hire-access-display";

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-rph-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-rph-fg">{value}</dd>
    </div>
  );
}

export function HireOverviewRentalSummary({ context }: { context: HireOverviewContext }) {
  const cadenceLabel = RENT_CADENCE_LABELS[context.rentCadence] ?? context.rentCadence;

  return (
    <section className="rph-card p-4">
      <h2 className="text-sm font-semibold text-rph-fg">Rental summary</h2>
      <dl className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryItem label="Contract start" value={context.contractStartLabel} />
        <SummaryItem label="Active since" value={context.startAtLabel} />
        {context.contractEnded && context.endedAtLabel ? (
          <SummaryItem label="Ended" value={context.endedAtLabel} />
        ) : context.scheduledEndAtLabel ? (
          <SummaryItem label="Contract ends" value={context.scheduledEndAtLabel} />
        ) : null}
        <SummaryItem label="Rent" value={context.rentLabel ?? "—"} />
        <SummaryItem label="How often" value={cadenceLabel.charAt(0).toUpperCase() + cadenceLabel.slice(1)} />
        <SummaryItem
          label="Deposit"
          value={context.depositLabel ?? "None"}
        />
        <SummaryItem
          label={context.contractEnded ? "Final period" : "Current period"}
          value={context.frequencyPositionLabel}
        />
        <SummaryItem label="Status" value={context.statusLabel} />
      </dl>
    </section>
  );
}
