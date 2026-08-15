"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  exportCompanyDashboardAction,
  loadCompanyDashboardAction,
} from "@/app/actions/company-dashboard";
import { HireContractWizardModal } from "@/app/(main)/rental/hires/hire-contract-wizard-modal";
import { AddVehicleModal } from "@/app/(main)/rental/vehicles/add-vehicle-modal";
import { RphSelect, rphSelectTriggerClass } from "@/components/forms/rph-select";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  COMPANY_DASHBOARD_ALL_SUBCOMPANIES,
  COMPANY_DASHBOARD_PERIOD_OPTIONS,
  type CompanyDashboardPeriodKind,
} from "@/lib/fleet/company-dashboard-period";
import type {
  CompanyDashboardActivityItem,
  CompanyDashboardAttentionItem,
  CompanyDashboardFinancialBucket,
  CompanyDashboardPayload,
} from "@/lib/fleet/company-dashboard-display";
import { InsuranceDocumentIcon } from "@/components/fleet/insurance-document-icon";
import { responsiveTableCellProps } from "@/lib/ui/responsive-table";

function changeLabel(pct: number | null, comparisonLabel: string): string | null {
  if (pct == null) return null;
  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  const abs = Math.abs(pct).toFixed(1);
  return `${arrow} ${abs}% ${comparisonLabel}`;
}

function changeToneClass(pct: number | null): string {
  if (pct == null) return "text-rph-fg-muted";
  if (pct > 0) return "text-emerald-700 dark:text-emerald-300";
  if (pct < 0) return "text-red-700 dark:text-red-300";
  return "text-rph-fg-muted";
}

function ukTodayLongUpper(): string {
  return new Date()
    .toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/London",
    })
    .toUpperCase();
}

function ukTimeHm(value: Date): string {
  return value.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  });
}

function splitInsight(message: string): { title: string; body: string } {
  const idx = message.indexOf(". ");
  if (idx < 0) return { title: "Insight", body: message };
  return { title: message.slice(0, idx), body: message.slice(idx + 2) };
}

function amountDueSubtext(data: CompanyDashboardPayload): string {
  const n = data.kpis.amountDueAlertCount;
  if (n <= 0) return "No driver balances need action";
  if (n === 1) return "1 driver balance needs action";
  return `${n} driver balances need action`;
}

function activityDotClass(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("payment") || t.includes("approved")) return "company-dash-activity-dot-ok";
  if (t.includes("hire") || t.includes("started") || t.includes("signed")) return "company-dash-activity-dot-info";
  if (t.includes("rejected") || t.includes("overdue") || t.includes("expired")) return "company-dash-activity-dot-warn";
  return "company-dash-activity-dot-neutral";
}

function compactAxisGbp(value: number): string {
  if (value >= 1000) {
    const k = value / 1000;
    return `£${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k`;
  }
  if (value >= 100) return `£${Math.round(value)}`;
  return `£${Math.round(value * 10) / 10}`;
}

function FinancialBars({ buckets }: { buckets: CompanyDashboardFinancialBucket[] }) {
  const max = Math.max(...buckets.flatMap((b) => [b.revenueGbp, b.costsGbp, Math.abs(b.profitGbp)]), 1);
  const axis = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    p,
    label: compactAxisGbp(max * p),
  }));

  return (
    <div className="mt-4 w-full min-w-0 max-w-full overflow-hidden">
      <p className="sr-only">
        Monthly financial trend comparing revenue, costs and profit for{" "}
        {buckets
          .map(
            (b) =>
              `${b.label}: revenue ${formatGbp(b.revenueGbp)}, costs ${formatGbp(b.costsGbp)}, profit ${formatGbp(b.profitGbp)}`,
          )
          .join("; ")}
        .
      </p>
      <div className="flex w-full min-w-0 gap-1.5 sm:gap-2">
        <div className="flex h-40 w-8 shrink-0 flex-col justify-between py-0.5 text-right text-[9px] tabular-nums text-rph-fg-muted sm:w-9 sm:text-[10px]">
          {[...axis].reverse().map((tick) => (
            <span key={tick.p} className="block truncate">
              {tick.label}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between py-0.5">
            {axis.map((tick) => (
              <div key={tick.p} className="border-t border-rph-border/70" />
            ))}
          </div>
          <div className="relative flex h-40 w-full min-w-0 items-end justify-between gap-1 sm:gap-1.5">
            {buckets.map((bucket) => (
              <div key={bucket.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex h-36 w-full max-w-[2.25rem] items-end justify-center gap-px sm:max-w-none sm:gap-0.5">
                  <div
                    className="w-[5px] rounded-t bg-sky-600 sm:w-2 dark:bg-sky-500"
                    style={{ height: `${Math.max(4, Math.round((bucket.revenueGbp / max) * 140))}px` }}
                    title={`Revenue ${formatGbp(bucket.revenueGbp)}`}
                  />
                  <div
                    className="w-[5px] rounded-t bg-amber-700/80 sm:w-2 dark:bg-amber-600"
                    style={{ height: `${Math.max(4, Math.round((bucket.costsGbp / max) * 140))}px` }}
                    title={`Costs ${formatGbp(bucket.costsGbp)}`}
                  />
                  <div
                    className="w-[5px] rounded-t bg-emerald-500 sm:w-2 dark:bg-emerald-600"
                    style={{ height: `${Math.max(4, Math.round((Math.abs(bucket.profitGbp) / max) * 140))}px` }}
                    title={`Profit ${formatGbp(bucket.profitGbp)}`}
                  />
                </div>
                <span className="max-w-full truncate text-[9px] font-medium text-rph-fg-muted sm:text-[10px]">
                  {bucket.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FleetDonut({
  onHire,
  reserved,
  available,
  compliance,
  utilisationPct,
}: {
  onHire: number;
  reserved: number;
  available: number;
  compliance: number;
  utilisationPct: number | null;
}) {
  const total = Math.max(onHire + reserved + available, 1);
  const c = 2 * Math.PI * 36;
  const segments = [
    { value: onHire, color: "#0284c7", label: "On hire" },
    { value: reserved, color: "#b45309", label: "Reserved" },
    { value: available, color: "#34d399", label: "Available" },
  ];
  let offset = 0;
  return (
    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
      <div className="relative h-28 w-28 shrink-0 sm:h-36 sm:w-36">
        <svg
          viewBox="0 0 96 96"
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`Fleet utilisation ${utilisationPct ?? 0} percent`}
        >
          <circle cx="48" cy="48" r="36" fill="none" stroke="var(--rph-border)" strokeWidth="10" />
          {segments.map((seg) => {
            const len = (seg.value / total) * c;
            const node = (
              <circle
                key={seg.label}
                cx="48"
                cy="48"
                r="36"
                fill="none"
                stroke={seg.color}
                strokeWidth="10"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return node;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold tabular-nums text-rph-fg sm:text-2xl">{utilisationPct ?? 0}%</span>
          <span className="text-[10px] text-rph-fg-muted">utilised</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        <li className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-rph-fg-secondary">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600" aria-hidden />{" "}
            <span className="truncate">On hire</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-rph-fg">{onHire}</span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-rph-fg-secondary">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-700" aria-hidden />{" "}
            <span className="truncate">Reserved</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-rph-fg">{reserved}</span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-rph-fg-secondary">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />{" "}
            <span className="truncate">Available</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-rph-fg">{available}</span>
        </li>
        <li className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-2 text-rph-fg-secondary">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-hidden />{" "}
            <span className="truncate">Compliance alerts</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums text-rph-fg">{compliance}</span>
        </li>
      </ul>
    </div>
  );
}

function marginPillClass(pct: number | null): string {
  if (pct == null) return "bg-rph-chrome text-rph-fg-muted";
  if (pct >= 50) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (pct >= 25) return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
  return "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200";
}

function AttentionIcon({ item }: { item: CompanyDashboardAttentionItem }) {
  const isInsurance =
    item.id.includes("insurance") ||
    item.severityLabel.toLowerCase().includes("insurance") ||
    item.title.toLowerCase().includes("insurance");

  const tone =
    item.severity === "critical"
      ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200"
      : item.severity === "warning"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        : "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-100";

  if (isInsurance) {
    return (
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone}`} aria-hidden>
        <InsuranceDocumentIcon className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${tone}`} aria-hidden>
      {item.severity === "critical" ? "!" : item.severity === "warning" ? "▣" : "£"}
    </span>
  );
}

function ActivityList({ items }: { items: CompanyDashboardActivityItem[] }) {
  return (
    <ul className="company-dash-scroll space-y-0">
      {items.map((item) => (
        <li key={item.id} className="company-dash-activity-row relative flex gap-3 pb-4">
          <span className="company-dash-activity-rail" aria-hidden />
          <span className={`relative z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${activityDotClass(item.title)}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <Link href={item.href} className="text-sm font-semibold text-rph-fg hover:text-rph-link-hover">
              {item.title}
            </Link>
            <p className="text-xs text-rph-fg-secondary">
              {item.detail}
              {item.atLabel ? ` · ${item.atLabel}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const filterSelectClass = `${rphSelectTriggerClass} h-12 border-rph-border bg-rph-chrome/60`;

export function CompanyDashboardView() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [exporting, startExport] = useTransition();
  const [data, setData] = useState<CompanyDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subcompanyId, setSubcompanyId] = useState(COMPANY_DASHBOARD_ALL_SUBCOMPANIES);
  const [periodKind, setPeriodKind] = useState<CompanyDashboardPeriodKind>("this_month");
  const [customStartYmd, setCustomStartYmd] = useState("");
  const [customEndYmd, setCustomEndYmd] = useState("");
  const [hireOpen, setHireOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const query = useMemo(
    () => ({
      subcompanyId,
      periodKind,
      customStartYmd: periodKind === "custom" ? customStartYmd : null,
      customEndYmd: periodKind === "custom" ? customEndYmd : null,
    }),
    [subcompanyId, periodKind, customStartYmd, customEndYmd],
  );

  const reload = useCallback(() => {
    startTransition(() => {
      void (async () => {
        if (periodKind === "custom" && (!customStartYmd || !customEndYmd)) {
          setError("Choose a custom start and end date.");
          return;
        }
        const res = await loadCompanyDashboardAction(query);
        if (!res.ok) {
          setError(res.error);
          setData(null);
          return;
        }
        setError(null);
        setData(res.data);
        setUpdatedAt(new Date());
      })();
    });
  }, [query, periodKind, customStartYmd, customEndYmd]);

  useEffect(() => {
    reload();
  }, [reload]);

  const subcompanyOptions = useMemo(() => {
    const opts = [{ value: COMPANY_DASHBOARD_ALL_SUBCOMPANIES, label: "All subcompanies" }];
    for (const sub of data?.subcompanies ?? []) {
      opts.push({ value: sub.id, label: sub.name });
    }
    return opts;
  }, [data?.subcompanies]);

  function exportDashboard() {
    startExport(() => {
      void (async () => {
        const res = await exportCompanyDashboardAction(query);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.fileName;
        a.click();
        URL.revokeObjectURL(url);
      })();
    });
  }

  const modalSubcompanies = (data?.subcompanies ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    is_primary: s.isPrimary,
  }));

  const insightParts = data?.insight ? splitInsight(data.insight.message) : null;
  const periodOptionLabel =
    COMPANY_DASHBOARD_PERIOD_OPTIONS.find((o) => o.value === periodKind)?.label ?? periodKind;

  return (
    <div className="company-dash max-w-full space-y-4 overflow-x-hidden md:space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
            {ukTodayLongUpper()}
          </p>
          <h1 className="rph-h1 mt-1">Company performance</h1>
          <p className="rph-lead mt-1 max-w-2xl text-sm">
            Financial performance, fleet health and priority actions across your rental business.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
          {data?.capabilities.canManageFleet ? (
            <button type="button" className="rph-btn-ghost w-full sm:w-auto" onClick={() => setVehicleOpen(true)}>
              Add vehicle
            </button>
          ) : null}
          {data?.capabilities.canWriteRentals ? (
            <button type="button" className="rph-btn-primary w-full sm:w-auto" onClick={() => setHireOpen(true)}>
              New hire
            </button>
          ) : null}
        </div>
      </header>

      <section className="rph-card company-dash-filters space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-rph-fg-muted">
              Business view
            </span>
            <RphSelect
              value={subcompanyId}
              onValueChange={setSubcompanyId}
              options={subcompanyOptions}
              aria-label="Business view"
              triggerClassName={filterSelectClass}
            />
          </label>
          <label className="block min-w-0">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-rph-fg-muted">
              Reporting period
            </span>
            <RphSelect
              value={periodKind}
              onValueChange={(value) => setPeriodKind(value as CompanyDashboardPeriodKind)}
              options={COMPANY_DASHBOARD_PERIOD_OPTIONS}
              aria-label="Reporting period"
              triggerClassName={filterSelectClass}
            />
          </label>
          {periodKind === "custom" ? (
            <>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-rph-fg-muted">
                  From
                </span>
                <input
                  type="date"
                  className="rph-input"
                  value={customStartYmd}
                  onChange={(e) => setCustomStartYmd(e.target.value)}
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-rph-fg-muted">
                  To
                </span>
                <input
                  type="date"
                  className="rph-input"
                  value={customEndYmd}
                  onChange={(e) => setCustomEndYmd(e.target.value)}
                />
              </label>
            </>
          ) : null}
        </div>
        <p className="text-xs text-rph-fg-secondary">
          Showing <span className="font-semibold text-rph-fg">{data?.selectedSubcompanyName ?? "All subcompanies"}</span>
          <span className="text-rph-fg-muted">
            {" "}
            · {periodOptionLabel}
            {updatedAt ? ` · Updated ${ukTimeHm(updatedAt)}` : ""}
          </span>
        </p>
        <button
          type="button"
          className="rph-btn-ghost w-full"
          onClick={exportDashboard}
          disabled={exporting || !data}
        >
          {exporting ? "Exporting…" : "Export dashboard"}
        </button>
      </section>

      {error ? <p className="rph-alert-error">{error}</p> : null}

      {pending && !data ? (
        <div className="rph-card p-8 text-sm text-rph-fg-muted" role="status">
          Loading company performance…
        </div>
      ) : null}

      {data ? (
        <>
          {data.insight && insightParts ? (
            <div
              className={`company-dash-insight flex gap-3 ${
                data.insight.tone === "ok"
                  ? "company-dash-insight-ok"
                  : data.insight.tone === "warn"
                    ? "company-dash-insight-warn"
                    : "company-dash-insight-neutral"
              }`}
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${
                  data.insight.tone === "warn" ? "bg-amber-600" : "bg-emerald-700"
                }`}
                aria-hidden
              >
                ↗
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">{insightParts.title}</p>
                <p className="mt-0.5 text-sm text-rph-fg-secondary">{insightParts.body}</p>
                <Link href={data.insight.href} className="mt-2 inline-block text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
                  {data.insight.hrefLabel}
                </Link>
              </div>
            </div>
          ) : null}

          <section className="grid grid-cols-2 gap-3 xl:grid-cols-5" aria-label="Headline KPIs">
            <article className="rph-card p-4">
              <p className="text-xs text-rph-fg-muted">Revenue</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-rph-fg sm:text-2xl">
                {formatGbp(data.kpis.revenueGbp)}
              </p>
              <p className={`mt-1 text-xs ${changeToneClass(data.kpis.revenueChangePct)}`}>
                {changeLabel(data.kpis.revenueChangePct, data.period.comparisonLabel) ?? "No prior comparison"}
              </p>
            </article>
            <article className="rph-card p-4">
              <p className="text-xs text-rph-fg-muted">Net profit</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-rph-fg sm:text-2xl">
                {formatGbp(data.kpis.netProfitGbp)}
              </p>
              <p className={`mt-1 text-xs ${changeToneClass(data.kpis.netProfitChangePct)}`}>
                {changeLabel(data.kpis.netProfitChangePct, data.period.comparisonLabel) ?? "No prior comparison"}
              </p>
            </article>
            <article className="rph-card p-4">
              <p className="text-xs text-rph-fg-muted">Profit margin</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-rph-fg sm:text-2xl">
                {data.kpis.profitMarginPct != null ? `${data.kpis.profitMarginPct}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-rph-fg-muted">
                {formatGbp(data.kpis.operatingCostsGbp)} operating costs
              </p>
            </article>
            <article className="rph-card p-4">
              <p className="text-xs text-rph-fg-muted">Fleet utilisation</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-rph-fg sm:text-2xl">
                {data.kpis.fleetUtilisationPct != null ? `${data.kpis.fleetUtilisationPct}%` : "—"}
              </p>
              <p className="mt-1 text-xs text-rph-fg-muted">
                {data.kpis.vehiclesOnHire} of {data.kpis.fleetActiveCount} vehicles on hire
              </p>
            </article>
            <article className="rph-card company-dash-kpi-due col-span-2 p-4 xl:col-span-1">
              <p className="text-xs text-amber-900/80 dark:text-amber-100/80">Amount due</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-amber-950 sm:text-2xl dark:text-amber-50">
                {formatGbp(data.kpis.amountDueGbp)}
              </p>
              <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">{amountDueSubtext(data)}</p>
            </article>
          </section>

          <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <article className="rph-card min-w-0 overflow-hidden p-4">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="company-dash-section-label">Profit &amp; loss</p>
                  <h2 className="text-base font-semibold text-rph-fg">Financial performance</h2>
                </div>
                <div className="flex min-w-0 flex-wrap gap-3 text-[11px] text-rph-fg-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-sky-600" aria-hidden /> Revenue
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-700" aria-hidden /> Costs
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> Profit
                  </span>
                </div>
              </div>
              {data.financial.empty ? (
                <p className="mt-6 text-sm text-rph-fg-muted">
                  No hire revenue or recorded operating costs in this period. Approved rent payments and maintenance
                  expenses will appear here once recorded.
                </p>
              ) : (
                <>
                  <FinancialBars buckets={data.financial.buckets} />
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rph-border pt-4">
                    <div>
                      <dt className="text-xs text-rph-fg-muted">Hire income</dt>
                      <dd className="text-sm font-semibold tabular-nums text-rph-fg">
                        {formatGbp(data.financial.revenueGbp)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-rph-fg-muted">Operating costs</dt>
                      <dd className="text-sm font-semibold tabular-nums text-rph-fg">
                        {formatGbp(data.financial.operatingCostsGbp)}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-rph-fg-muted">Net profit</dt>
                      <dd className="text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatGbp(data.financial.netProfitGbp)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 text-center">
                    <Link href={data.financial.fullFinancialsHref} className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
                      View full financials →
                    </Link>
                  </div>
                </>
              )}
            </article>

            <article className="rph-card min-w-0 overflow-hidden p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="company-dash-section-label">Fleet</p>
                  <h2 className="text-base font-semibold text-rph-fg">Vehicle performance</h2>
                </div>
                <Link href="/rental/vehicles" className="shrink-0 text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
                  View fleet
                </Link>
              </div>
              {data.fleet.empty ? (
                <p className="mt-6 text-sm text-rph-fg-muted">
                  No vehicles in this scope. Add a vehicle to start tracking utilisation and fleet health.
                </p>
              ) : (
                <>
                  <div className="mt-4">
                    <FleetDonut
                      onHire={data.fleet.onHire}
                      reserved={data.fleet.reserved}
                      available={data.fleet.available}
                      compliance={data.fleet.complianceAlertCount}
                      utilisationPct={data.fleet.utilisationPct}
                    />
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-rph-border pt-4">
                    <div className="min-w-0 border-r border-rph-border pr-2">
                      <dt className="text-[10px] leading-snug text-rph-fg-muted sm:text-[11px]">Revenue per vehicle</dt>
                      <dd className="truncate text-sm font-semibold tabular-nums">
                        {data.fleet.revenuePerVehicleGbp != null
                          ? formatGbp(data.fleet.revenuePerVehicleGbp)
                          : "—"}
                      </dd>
                    </div>
                    <div className="min-w-0 border-r border-rph-border px-2">
                      <dt className="text-[10px] leading-snug text-rph-fg-muted sm:text-[11px]">Active hires</dt>
                      <dd className="text-sm font-semibold tabular-nums">{data.fleet.activeHires}</dd>
                    </div>
                    <div className="min-w-0 pl-2">
                      <dt className="text-[10px] leading-snug text-rph-fg-muted sm:text-[11px]">Average daily rent</dt>
                      <dd className="truncate text-sm font-semibold tabular-nums">
                        {data.fleet.averageDailyRentGbp != null
                          ? formatGbp(data.fleet.averageDailyRentGbp)
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </>
              )}
            </article>
          </section>

          <section className="rph-card p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="company-dash-section-label">Portfolio comparison</p>
                <h2 className="text-base font-semibold text-rph-fg">Subcompany performance</h2>
                <p className="rph-meta mt-1">
                  {data.subcompanies.length} subcompan{data.subcompanies.length === 1 ? "y" : "ies"} · Click a
                  row to focus this dashboard
                </p>
              </div>
            </div>
            {data.comparison.length === 0 ? (
              <p className="mt-4 text-sm text-rph-fg-muted">No accessible subcompanies to compare.</p>
            ) : (
              <div className="rph-table-responsive mt-4">
                <table className="w-full min-w-[48rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-rph-border text-xs uppercase tracking-wide text-rph-fg-muted">
                      <th className="px-2 py-2 font-semibold">Subcompany</th>
                      <th className="px-2 py-2 font-semibold">Vehicles</th>
                      <th className="px-2 py-2 font-semibold">On hire</th>
                      <th className="px-2 py-2 font-semibold">Utilisation</th>
                      <th className="px-2 py-2 font-semibold">Revenue</th>
                      <th className="px-2 py-2 font-semibold">Costs</th>
                      <th className="px-2 py-2 font-semibold">Net profit</th>
                      <th className="px-2 py-2 font-semibold">Margin</th>
                      <th className="px-2 py-2 font-semibold">Alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.comparison.map((row) => {
                      const selected = data.selectedSubcompanyId === row.subcompanyId;
                      return (
                        <tr
                          key={row.subcompanyId}
                          className={`cursor-pointer border-b border-rph-border/80 hover:bg-rph-chrome/70 ${
                            selected ? "bg-sky-50/80 dark:bg-sky-950/30" : ""
                          }`}
                          onClick={() => setSubcompanyId(row.subcompanyId)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSubcompanyId(row.subcompanyId);
                            }
                          }}
                          tabIndex={0}
                          aria-label={`Focus dashboard on ${row.name}`}
                          aria-current={selected ? "true" : undefined}
                        >
                          <td
                            {...responsiveTableCellProps(
                              { header: "Subcompany", meta: { tablePrimary: true } },
                              "px-2 py-3 font-medium text-rph-fg",
                            )}
                          >
                            {row.name}
                            {selected ? <span className="rph-meta ml-2">Selected</span> : null}
                          </td>
                          <td {...responsiveTableCellProps({ header: "Vehicles" }, "px-2 py-3 tabular-nums")}>
                            {row.vehicleCount}
                          </td>
                          <td {...responsiveTableCellProps({ header: "On hire" }, "px-2 py-3 tabular-nums")}>
                            {row.onHireCount}
                          </td>
                          <td {...responsiveTableCellProps({ header: "Utilisation" }, "px-2 py-3")}>
                            <div className="flex min-w-[7rem] items-center gap-2">
                              <div className="h-1.5 flex-1 rounded-full bg-rph-chrome">
                                <div
                                  className="h-1.5 rounded-full bg-sky-600"
                                  style={{ width: `${Math.min(100, row.utilisationPct ?? 0)}%` }}
                                />
                              </div>
                              <span className="tabular-nums text-xs text-rph-fg-secondary">
                                {row.utilisationPct != null ? `${row.utilisationPct}%` : "—"}
                              </span>
                            </div>
                          </td>
                          <td {...responsiveTableCellProps({ header: "Revenue" }, "px-2 py-3 tabular-nums")}>
                            {formatGbp(row.revenueGbp)}
                          </td>
                          <td {...responsiveTableCellProps({ header: "Costs" }, "px-2 py-3 tabular-nums")}>
                            {formatGbp(row.costsGbp)}
                          </td>
                          <td
                            {...responsiveTableCellProps(
                              { header: "Net profit" },
                              "px-2 py-3 tabular-nums font-medium",
                            )}
                          >
                            {formatGbp(row.netProfitGbp)}
                          </td>
                          <td {...responsiveTableCellProps({ header: "Margin" }, "px-2 py-3")}>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${marginPillClass(row.profitMarginPct)}`}
                            >
                              {row.profitMarginPct != null ? `${row.profitMarginPct}%` : "—"}
                            </span>
                          </td>
                          <td {...responsiveTableCellProps({ header: "Alerts" }, "px-2 py-3 tabular-nums")}>
                            {row.complianceAlertCount}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {data.selectedSubcompanyId ? (
              <button
                type="button"
                className="rph-link mt-3 text-sm"
                onClick={() => setSubcompanyId(COMPANY_DASHBOARD_ALL_SUBCOMPANIES)}
              >
                Show all subcompanies
              </button>
            ) : null}
          </section>

          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <article className="company-dash-panel rph-card flex min-h-0 flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="company-dash-section-label">Vehicle contribution</p>
                  <h2 className="text-base font-semibold text-rph-fg">Most profitable vehicles</h2>
                </div>
                <Link href="/rental/vehicles" className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
                  All vehicles
                </Link>
              </div>
              {data.mostProfitableVehicles.length === 0 ? (
                <p className="mt-4 text-sm text-rph-fg-muted">
                  No vehicle hire revenue or costs in this period, so profitability ranking is empty.
                </p>
              ) : (
                <ul className="company-dash-scroll mt-3 divide-y divide-rph-border">
                  {data.mostProfitableVehicles.map((row, index) => (
                    <li key={row.vehicleId}>
                      <Link
                        href={row.href}
                        className="flex items-center gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rph-rail"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-xs font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-200">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-rph-fg">
                            {row.vrm} — {row.make} {row.model}
                          </span>
                          <span className="block truncate text-xs text-rph-fg-muted">
                            {formatGbp(row.hireRevenueGbp)} revenue · {formatGbp(row.costsGbp)} costs
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                            {formatGbp(row.netContributionGbp)}
                          </span>
                          <span className="block text-[11px] text-rph-fg-muted">
                            {row.profitMarginPct != null ? `${row.profitMarginPct}% margin` : "—"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="company-dash-panel rph-card flex min-h-0 flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="company-dash-section-label">Priority</p>
                  <h2 className="text-base font-semibold text-rph-fg">Needs attention</h2>
                </div>
                {data.attention.length > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
                    {data.attention.length} action{data.attention.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              {data.attention.length === 0 ? (
                <p className="mt-4 text-sm text-rph-fg-muted">
                  No expired documents, overdue payments or other priority actions in this scope.
                </p>
              ) : (
                <ul className="company-dash-scroll mt-3 divide-y divide-rph-border">
                  {data.attention.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        className="flex items-center gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rph-rail"
                      >
                        <AttentionIcon item={item} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-rph-fg">{item.title}</span>
                          <span className="block text-xs text-rph-fg-secondary">{item.detail}</span>
                        </span>
                        <span className="shrink-0 text-rph-fg-muted" aria-hidden>
                          ›
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="company-dash-panel rph-card flex min-h-0 flex-col p-4 lg:col-span-2 xl:col-span-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="company-dash-section-label">Latest</p>
                  <h2 className="text-base font-semibold text-rph-fg">Recent business activity</h2>
                </div>
                <Link href="/rental/hires" className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300">
                  View all
                </Link>
              </div>
              {data.activity.length === 0 ? (
                <p className="mt-4 text-sm text-rph-fg-muted">
                  No recent hire, payment, transfer, document or maintenance activity in this scope.
                </p>
              ) : (
                <div className="mt-3">
                  <ActivityList items={data.activity} />
                </div>
              )}
            </article>
          </section>

          {pending ? (
            <p className="rph-meta" role="status">
              Updating dashboard…
            </p>
          ) : null}
        </>
      ) : null}

      <HireContractWizardModal
        open={hireOpen}
        hireGroupId={null}
        onClose={() => {
          setHireOpen(false);
          reload();
        }}
        onSaved={reload}
      />
      <AddVehicleModal
        open={vehicleOpen}
        onOpenChange={(open) => {
          setVehicleOpen(open);
          if (!open) {
            reload();
            router.refresh();
          }
        }}
        subcompanies={modalSubcompanies}
        onCreated={() => {
          reload();
          router.refresh();
        }}
      />
    </div>
  );
}
