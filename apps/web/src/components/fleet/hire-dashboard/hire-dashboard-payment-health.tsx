"use client";

import type { HirePaymentHealthSummary } from "@/lib/fleet/hire-payment-analytics";
import { hireTableStatusToneClass } from "@/lib/fleet/hire-contract-table-display";
import { formatGbp } from "@/lib/fleet/maintenance";

const HEALTH_META: Record<
  HirePaymentHealthSummary["level"],
  { label: string; tone: "success" | "warning" | "error" }
> = {
  on_track: { label: "On track", tone: "success" },
  attention: { label: "Attention", tone: "warning" },
  at_risk: { label: "At risk", tone: "error" },
};

export function HireDashboardPaymentHealth({
  health,
  balanceGbp,
  audience = "staff",
}: {
  health: HirePaymentHealthSummary;
  balanceGbp: number;
  audience?: "staff" | "driver";
}) {
  const meta = HEALTH_META[health.level];
  const driverHeadline =
    health.level === "on_track"
      ? "You're up to date"
      : health.level === "at_risk"
        ? "Payments overdue"
        : "Action needed";

  return (
    <section className="rph-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">
            {audience === "driver" ? "Your payments" : "Payment health"}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-rph-fg">
            {audience === "driver" ? driverHeadline : health.headline}
          </h2>
          <p className="rph-meta mt-1 text-sm">{health.detail}</p>
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${hireTableStatusToneClass(meta.tone)}`}
        >
          {meta.label}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-rph-fg-muted">{audience === "driver" ? "Balance due" : "Arrears (to date)"}</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-rph-fg">{formatGbp(balanceGbp)}</dd>
        </div>
        <div>
          <dt className="text-rph-fg-muted">Overdue</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-rph-fg">
            {health.overdueCount > 0
              ? `${health.overdueCount} · ${formatGbp(health.overdueTotalGbp)}`
              : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-rph-fg-muted">On-time rate</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-rph-fg">
            {health.onTimePercent != null ? `${health.onTimePercent}%` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-rph-fg-muted">Pending approval</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-rph-fg">{health.pendingApprovalCount}</dd>
        </div>
      </dl>
    </section>
  );
}
