"use client";

import type { HirePaymentHealthSummary } from "@/lib/fleet/hire-payment-analytics";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import type { HireOverviewContext } from "@/lib/fleet/hire-overview-types";

const HEALTH_META: Record<
  HirePaymentHealthSummary["level"],
  { label: string; tone: "success" | "warning" | "error" }
> = {
  on_track: { label: "On track", tone: "success" },
  attention: { label: "Needs attention", tone: "warning" },
  at_risk: { label: "Overdue", tone: "error" },
};

function HeaderCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-rph-fg-muted">{label}</p>
      <div className="mt-1 text-sm text-rph-fg">{children}</div>
    </div>
  );
}

export function HireOverviewHeader({
  context,
  health,
  audience,
}: {
  context: HireOverviewContext;
  health: HirePaymentHealthSummary;
  audience: "staff" | "driver";
}) {
  const healthMeta = HEALTH_META[health.level];
  const driverNameLine =
    audience === "driver"
      ? context.driverName ?? "Your hire"
      : context.driverName ?? "—";
  const driverEmailLine = context.driverEmail;
  const showPaymentHealth = !context.contractEnded;

  return (
    <section className="rph-card divide-y divide-rph-border overflow-hidden">
      <div
        className={`grid gap-4 p-4 ${showPaymentHealth ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
      >
        <HeaderCell label="Rental ID">
          <p className="font-mono text-xs font-semibold text-rph-fg">{context.hireGroupIdShort}</p>
          <p className="mt-1 font-semibold">
            {context.vehicleVrm}
            <span className="font-normal text-rph-fg-secondary"> · {context.vehicleMakeModel}</span>
          </p>
        </HeaderCell>

        <HeaderCell label={audience === "driver" ? "You" : "Driver"}>
          <p className="font-medium">{driverNameLine}</p>
          {driverEmailLine ? (
            <p className="mt-0.5 text-xs text-rph-fg-secondary">{driverEmailLine}</p>
          ) : null}
          {audience === "driver" && context.companyName ? (
            <p className="mt-0.5 text-xs text-rph-fg-secondary">{context.companyName}</p>
          ) : null}
        </HeaderCell>

        {showPaymentHealth ? (
          <HeaderCell label={audience === "driver" ? "Your payments" : "Payment health"}>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${hireTableStatusToneClass(healthMeta.tone)}`}
              >
                {healthMeta.label}
              </span>
              {health.onTimePercent != null ? (
                <span className="text-xs text-rph-fg-secondary">{health.onTimePercent}% on time</span>
              ) : null}
            </div>
            {context.rentLabel ? (
              <p className="mt-1 text-xs text-rph-fg-secondary">Rate: {context.rentLabel}</p>
            ) : null}
          </HeaderCell>
        ) : null}
      </div>
    </section>
  );
}
