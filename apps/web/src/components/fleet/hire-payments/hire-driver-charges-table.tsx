"use client";

import type { HireDriverChargeWorkspaceRow } from "@/app/actions/rental-hire-termination";
import { formatUkDate } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";

export function HireDriverChargesTable({
  items,
  description = "Charges from check-in and other events affecting this hire balance.",
  audience = "staff",
}: {
  items: HireDriverChargeWorkspaceRow[];
  description?: string;
  audience?: "staff" | "driver";
}) {
  if (items.length === 0) return null;

  return (
    <section className="rph-card overflow-hidden p-0">
      <div className="border-b border-rph-border bg-rph-chrome/40 px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-semibold text-rph-fg">
          {audience === "driver" ? "Charges" : "Driver charges"}
        </h2>
        <p className="rph-muted mt-0.5 text-xs">{description}</p>
      </div>
      <div className="max-h-[min(60vh,28rem)] overflow-x-auto overflow-y-auto overscroll-y-contain">
        <table className="min-w-full text-sm">
          <thead className="bg-rph-chrome/60 text-left text-xs uppercase tracking-wide text-rph-fg-muted">
            <tr>
              <th className="px-4 py-2.5 sm:px-5">Type</th>
              <th className="px-4 py-2.5 sm:px-5">Description</th>
              <th className="px-4 py-2.5 sm:px-5">Amount</th>
              <th className="px-4 py-2.5 sm:px-5">Resolution</th>
              <th className="px-4 py-2.5 sm:px-5">Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-rph-border">
                <td className="px-4 py-3 text-rph-fg-secondary sm:px-5">{item.chargeTypeLabel}</td>
                <td className="px-4 py-3 text-rph-fg-secondary sm:px-5">{item.description ?? "—"}</td>
                <td className="px-4 py-3 font-medium tabular-nums text-rph-fg sm:px-5">
                  {formatGbp(item.amountGbp)}
                </td>
                <td className="px-4 py-3 text-rph-fg-secondary sm:px-5">{item.resolutionLabel}</td>
                <td className="px-4 py-3 text-rph-fg-secondary sm:px-5">
                  {formatUkDate(item.chargedOn || item.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
