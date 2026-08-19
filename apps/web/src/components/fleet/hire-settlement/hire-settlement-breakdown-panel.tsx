"use client";

import {
  groupHireSettlementBreakdownLines,
  type HireSettlementBreakdown,
  type HireSettlementBreakdownLine,
} from "@/lib/fleet/hire-settlement-breakdown";
import { settlementBalanceLabel, type HireUiAudience } from "@/lib/fleet/hire-termination-summary";
import { formatGbp } from "@/lib/fleet/maintenance";

function amountTone(direction: HireSettlementBreakdownLine["direction"]): string {
  if (direction === "company_pays") return "text-rph-fg-secondary";
  if (direction === "driver_pays") return "text-rph-fg";
  return "text-rph-fg";
}

function amountPrefix(direction: HireSettlementBreakdownLine["direction"]): string {
  if (direction === "company_pays") return "−";
  if (direction === "driver_pays") return "+";
  return "";
}

function BreakdownRow({ line }: { line: HireSettlementBreakdownLine }) {
  return (
    <div className="flex min-h-9 items-center gap-2 sm:gap-3">
      <span className="min-w-0 flex-1 text-sm leading-snug text-rph-fg-secondary">{line.label}</span>
      <span
        className="hidden min-w-[1.5rem] shrink-0 self-end border-b border-dotted border-rph-border-strong/80 pb-1 sm:block sm:min-w-[2.5rem] sm:flex-[1.5]"
        aria-hidden
      />
      <span
        className={`shrink-0 text-right text-sm font-semibold tabular-nums ${amountTone(line.direction)}`}
      >
        <span className="mr-0.5 text-rph-fg-muted">{amountPrefix(line.direction)}</span>
        {formatGbp(line.amountGbp)}
      </span>
    </div>
  );
}

function openBalanceHint(
  direction: HireSettlementBreakdown["openDirection"],
  audience: HireUiAudience,
): string | null {
  if (direction === "company_owes_driver") {
    return audience === "driver" ? "Owed to you" : "Company pays driver";
  }
  if (direction === "driver_owes_company") {
    return audience === "driver" ? "You owe" : "Driver pays company";
  }
  return null;
}

export function HireSettlementBreakdownPanel({
  breakdown,
  title = "Balance breakdown",
  description,
  audience = "staff",
  openBalanceLabel = "Still owed now",
}: {
  breakdown: HireSettlementBreakdown;
  title?: string;
  description?: string;
  audience?: HireUiAudience;
  openBalanceLabel?: string;
}) {
  const sections = groupHireSettlementBreakdownLines(breakdown.lines);
  const hint = openBalanceHint(breakdown.openDirection, audience);
  const pendingGbp = breakdown.pendingPaymentsGbp ?? 0;
  const defaultDescription =
    audience === "driver"
      ? "How your balance was worked out after the contract ended."
      : "How the current balance was reached after contract end.";

  return (
    <section className="rph-card flex max-h-[min(60vh,28rem)] flex-col overflow-hidden p-0">
      <header className="shrink-0 border-b border-rph-border bg-rph-chrome/40 px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-semibold text-rph-fg">{title}</h2>
        <p className="rph-muted mt-0.5 text-xs">{description ?? defaultDescription}</p>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5 sm:py-5">
        {sections.map((section) => (
          <div key={section.id}>
            <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-rph-fg-muted">
              {section.title}
            </p>
            <div className="divide-y divide-rph-border/70 rounded-lg border border-rph-border bg-rph-page px-3 py-1 sm:px-4">
              {section.lines.map((line, index) => (
                <BreakdownRow key={line.id ?? `${section.id}:${line.label}:${index}`} line={line} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <footer className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-t border-rph-border bg-rph-chrome px-4 py-4 sm:px-5">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-rph-fg-muted">
            {openBalanceLabel}
          </p>
          {hint ? <p className="mt-1 text-xs text-rph-fg-secondary">{hint}</p> : null}
          {pendingGbp > 0.005 ? (
            <p className="mt-1 text-xs text-rph-fg-secondary">
              {formatGbp(pendingGbp)} submitted and waiting for approval — not deducted yet.
            </p>
          ) : null}
        </div>
        <p className="text-xl font-bold tabular-nums tracking-tight text-rph-fg sm:text-2xl">
          {breakdown.openDirection === "settled"
            ? "All clear"
            : settlementBalanceLabel(breakdown.openDirection, breakdown.openBalanceGbp, audience)}
        </p>
      </footer>
    </section>
  );
}
