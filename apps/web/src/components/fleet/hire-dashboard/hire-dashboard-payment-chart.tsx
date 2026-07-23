"use client";

import type { HirePaymentChartPoint } from "@/lib/fleet/hire-payment-analytics";
import { hirePaymentDisplayStatusMeta } from "@/lib/fleet/hire-payment-display";
import { formatGbp } from "@/lib/fleet/maintenance";

const BAR_COLOURS: Record<string, string> = {
  paid: "bg-emerald-500 dark:bg-emerald-600",
  cleared: "bg-emerald-400 dark:bg-emerald-700",
  partially_paid: "bg-amber-500 dark:bg-amber-600",
  overdue: "bg-red-500 dark:bg-red-600",
  due: "bg-amber-400 dark:bg-amber-700",
  upcoming: "bg-rph-border",
  pending_approval: "bg-amber-300 dark:bg-amber-800",
  rejected: "bg-red-400 dark:bg-red-800",
};

export function HireDashboardPaymentChart({ points }: { points: HirePaymentChartPoint[] }) {
  if (!points.length) {
    return (
      <section className="rph-card p-4">
        <h2 className="text-sm font-semibold text-rph-fg">Payment schedule</h2>
        <p className="rph-meta mt-2 text-sm">No payment periods on this hire yet.</p>
      </section>
    );
  }

  const maxNet = Math.max(...points.map((p) => p.netDueGbp), 1);

  return (
    <section className="rph-card p-4">
      <h2 className="text-sm font-semibold text-rph-fg">Payment schedule</h2>
      <p className="rph-meta mt-1 text-xs">Due amount per period; green shows paid portion.</p>

      <div className="mt-4 overflow-x-auto pb-2">
        <div className="flex min-w-max items-end gap-2" style={{ minHeight: "10rem" }}>
          {points.map((point) => {
            const dueHeight = Math.max(8, Math.round((point.netDueGbp / maxNet) * 120));
            const paidHeight =
              point.netDueGbp > 0
                ? Math.round((Math.min(point.paidGbp, point.netDueGbp) / point.netDueGbp) * dueHeight)
                : 0;
            const statusMeta = hirePaymentDisplayStatusMeta(point.displayStatus);
            const barColour = BAR_COLOURS[point.displayStatus] ?? "bg-rph-border";

            return (
              <div key={point.rowId} className="flex w-14 flex-col items-center gap-1">
                <div
                  className="relative w-full overflow-hidden rounded-t-md border border-rph-border bg-rph-page"
                  style={{ height: `${dueHeight}px` }}
                  title={`${point.label}: due ${formatGbp(point.netDueGbp)}, paid ${formatGbp(point.paidGbp)}`}
                >
                  {paidHeight > 0 ? (
                    <div
                      className={`absolute bottom-0 left-0 right-0 ${barColour}`}
                      style={{ height: `${paidHeight}px` }}
                    />
                  ) : null}
                </div>
                <span className="max-w-full truncate text-center text-[9px] font-medium text-rph-fg-secondary" title={statusMeta.label}>
                  {statusMeta.label}
                </span>
                <span className="max-w-full truncate text-center text-[9px] text-rph-fg-muted" title={point.label}>
                  {point.label.length > 12 ? `${point.label.slice(0, 10)}…` : point.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-rph-fg-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Paid
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-red-500" /> Overdue
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-amber-400" /> Due / partial
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-rph-border" /> Upcoming
        </span>
      </div>
    </section>
  );
}
