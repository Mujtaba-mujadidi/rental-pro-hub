"use client";

import {
  exportCompanyBalancesAction,
  loadCompanyBalancesPageAction,
} from "@/app/actions/company-balances";
import { RphSelect, rphSelectTriggerClass } from "@/components/forms/rph-select";
import {
  COMPANY_BALANCES_TAB_OPTIONS,
  companyBalancesAccountsForTab,
  companyBalancesKpiSubtext,
  companyBalancesTabFooterHint,
  filterCompanyBalancesAccounts,
  type CompanyBalancesAccountRow,
  type CompanyBalancesPageData,
  type CompanyBalancesTab,
} from "@/lib/fleet/company-balances-summary";
import { formatGbp } from "@/lib/fleet/maintenance";
import { responsiveTableCellProps } from "@/lib/ui/responsive-table";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

function StatusDot({
  tone,
  className = "",
}: {
  tone: "warn" | "info" | "ok" | "muted";
  className?: string;
}) {
  const toneClass =
    tone === "warn"
      ? "bg-amber-500"
      : tone === "info"
        ? "bg-sky-500"
        : tone === "ok"
          ? "bg-emerald-500"
          : "bg-rph-fg-muted/40";
  return <span className={`h-2 w-2 shrink-0 rounded-full ${toneClass} ${className}`} aria-hidden />;
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "warn" | "info" | "ok" | "muted";
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `rph-card relative p-3.5 text-left transition hover:bg-rph-chrome/40 sm:flex sm:gap-3 sm:p-4 ${
    active ? "ring-1 ring-rph-rail/40" : ""
  }`;
  const body = (
    <>
      <StatusDot tone={tone} className="absolute right-3 top-3 sm:static sm:mt-1.5" />
      <div className="min-w-0 pr-4 sm:pr-0">
        <p className="text-xs text-rph-fg-muted sm:text-sm">{label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-rph-fg sm:text-2xl">{value}</p>
        <p className="mt-1 text-[11px] text-rph-fg-muted sm:text-xs">{hint}</p>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <section className={className}>{body}</section>;
}

function BalancesSearchInput({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`relative w-full min-w-0 ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rph-fg-muted" aria-hidden>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3-3" strokeLinecap="round" />
        </svg>
      </span>
      <input
        type="search"
        className="rph-input h-10 w-full !pl-10 pr-3"
        placeholder="Search vehicle, driver or company"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Search vehicle, driver or company"
      />
    </div>
  );
}

export function FleetBalancesView() {
  const [data, setData] = useState<CompanyBalancesPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [exportPending, startExport] = useTransition();
  const [tab, setTab] = useState<CompanyBalancesTab | null>(null);
  const [search, setSearch] = useState("");
  const [subcompanyId, setSubcompanyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadCompanyBalancesPageAction();
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
      setError(null);
      setTab((current) => current ?? res.data.defaultTab);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const activeTab = tab ?? data?.defaultTab ?? "active";
  const kpis = data?.kpis;
  const subtext = kpis ? companyBalancesKpiSubtext(kpis) : null;

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const tabRows = companyBalancesAccountsForTab(data.accountRows, activeTab);
    return filterCompanyBalancesAccounts({
      rows: tabRows,
      search,
      subcompanyId,
    });
  }, [activeTab, data, search, subcompanyId]);

  const subcompanyOptions = useMemo(
    () => [
      { value: "all", label: "All subcompanies" },
      ...(data?.subcompanies ?? []).map((subcompany) => ({
        value: subcompany.id,
        label: subcompany.name,
      })),
    ],
    [data?.subcompanies],
  );

  function onExport() {
    startExport(async () => {
      const res = await exportCompanyBalancesAction(activeTab, search, subcompanyId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = res.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="space-y-3">
        <div className="min-w-0">
          <h1 className="rph-h1">Balances</h1>
          <p className="rph-muted mt-1 max-w-3xl text-sm">
            Monitor active hire accounts, review submitted payments and keep final settlements available for audit.
          </p>
        </div>
        <button
          type="button"
          className="rph-btn-ghost h-10 w-full sm:w-auto"
          disabled={exportPending || pending || !data}
          onClick={onExport}
        >
          Export balances
        </button>
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Outstanding across hires"
          value={kpis ? formatGbp(kpis.outstandingAcrossHiresGbp) : "—"}
          hint={subtext?.outstandingAcrossHires ?? "…"}
          tone={kpis && kpis.outstandingAcrossHiresGbp > 0.005 ? "warn" : "ok"}
          active={activeTab === "active"}
          onClick={() => setTab("active")}
        />
        <KpiCard
          label="Payments under review"
          value={kpis ? formatGbp(kpis.pendingReviewGbp) : "—"}
          hint={subtext?.pendingReview ?? "…"}
          tone={kpis && kpis.pendingReviewGbp > 0.005 ? "info" : "muted"}
          active={activeTab === "payment_review"}
          onClick={() => setTab("payment_review")}
        />
        <KpiCard
          label="Received this month"
          value={kpis ? formatGbp(kpis.receivedThisMonthGbp) : "—"}
          hint={subtext?.receivedThisMonth ?? "…"}
          tone="ok"
        />
        <KpiCard
          label="Final settlements"
          value={kpis ? String(kpis.finalSettlementsCount) : "—"}
          hint={subtext?.finalSettlements ?? "…"}
          tone="ok"
          active={activeTab === "final_settlements"}
          onClick={() => setTab("final_settlements")}
        />
      </section>

      <section className="rph-card overflow-hidden p-0">
        <div className="border-b border-rph-border px-4 pt-2 sm:px-5">
          <nav
            className="-mb-px flex gap-1 overflow-x-auto sm:gap-2 [scrollbar-width:thin]"
            aria-label="Balances tabs"
          >
            {COMPANY_BALANCES_TAB_OPTIONS.map((option) => {
              const active = activeTab === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`shrink-0 border-b-2 px-2.5 pb-3 pt-2 text-sm transition sm:px-3 ${
                    active
                      ? "border-rph-rail font-semibold text-rph-rail"
                      : "border-transparent font-medium text-rph-fg-muted hover:text-rph-fg"
                  }`}
                  onClick={() => setTab(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-b border-rph-border px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <BalancesSearchInput
            className="sm:flex-1"
            value={search}
            onChange={setSearch}
          />
          {subcompanyOptions.length > 1 ? (
            <div className="w-full shrink-0 sm:w-56">
              <RphSelect
                value={subcompanyId ?? "all"}
                aria-label="Filter by subcompany"
                options={subcompanyOptions}
                triggerClassName={`${rphSelectTriggerClass} h-10`}
                onValueChange={(value) => setSubcompanyId(value === "all" ? null : value)}
              />
            </div>
          ) : null}
        </div>

        <div className="min-h-0 px-4 sm:px-5">
          {pending && !data ? (
            <p className="rph-muted py-4 text-sm">Loading balances…</p>
          ) : visibleRows.length === 0 ? (
            <BalancesEmptyState tab={activeTab} />
          ) : (
            <BalancesAccountsList rows={visibleRows} tab={activeTab} />
          )}
        </div>

        <footer className="flex flex-col gap-2 border-t border-rph-border px-4 py-3 text-xs text-rph-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p>
            Showing {visibleRows.length.toLocaleString("en-GB")}{" "}
            {visibleRows.length === 1 ? "balance" : "balances"}
          </p>
          <p>{companyBalancesTabFooterHint(activeTab)}</p>
        </footer>
      </section>
    </div>
  );
}

function BalancesEmptyState({ tab }: { tab: CompanyBalancesTab }) {
  const copy =
    tab === "payment_review"
      ? {
          title: "No payments waiting for review",
          detail: "Driver and staff submissions will appear here until finance approves or rejects them.",
        }
      : tab === "final_settlements"
        ? {
            title: "No final settlements yet",
            detail: "Ended hires with a cleared settlement balance will appear here.",
          }
        : tab === "all"
          ? {
              title: "No hire balances yet",
              detail: "Active and ended hire accounts will appear here once charges or payments are posted.",
            }
          : {
              title: "No active balances",
              detail: "Active hire accounts with charges, receipts or an outstanding balance will appear here.",
            };

  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden>
          <path
            d="M20 6 9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="mt-4 text-base font-semibold text-rph-fg">{copy.title}</p>
      <p className="rph-muted mt-1 max-w-md text-sm">{copy.detail}</p>
    </div>
  );
}

function BalancesAccountsList({
  rows,
  tab,
}: {
  rows: CompanyBalancesAccountRow[];
  tab: CompanyBalancesTab;
}) {
  return (
    <div className="max-h-[min(60vh,32rem)] overflow-y-auto overscroll-y-contain py-4">
      <BalancesAccountsTable rows={rows} tab={tab} />
    </div>
  );
}

function BalancesAccountsTable({
  rows,
  tab,
}: {
  rows: CompanyBalancesAccountRow[];
  tab: CompanyBalancesTab;
}) {
  const showPendingAsBalance = tab === "payment_review";
  const vehicleCol = { header: "Vehicle & hire", meta: { tablePrimary: true } };
  const subcompanyCol = { header: "Subcompany" };
  const chargesCol = { header: "Charges" };
  const receivedCol = { header: "Received" };
  const balanceCol = { header: showPendingAsBalance ? "Pending" : "Balance" };
  const statusCol = { header: "Status" };
  const actionCol = { header: "Action", meta: { tableActions: true } };

  return (
    <div className="rph-table-responsive rounded-xl border border-rph-border">
      <table className="min-w-full text-sm">
        <thead className="text-left text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
          <tr>
            <th className="border-b border-rph-border px-5 py-3">Vehicle &amp; hire</th>
            <th className="border-b border-rph-border px-5 py-3">Subcompany</th>
            <th className="border-b border-rph-border px-5 py-3 text-right">Charges</th>
            <th className="border-b border-rph-border px-5 py-3 text-right">Received</th>
            <th className="border-b border-rph-border px-5 py-3 text-right">
              {showPendingAsBalance ? "Pending" : "Balance"}
            </th>
            <th className="border-b border-rph-border px-5 py-3">Status</th>
            <th className="border-b border-rph-border px-5 py-3 text-right">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.hireGroupId} className="border-t border-rph-border hover:bg-rph-chrome/30">
              <td {...responsiveTableCellProps(vehicleCol, "px-5 py-4")}>
                <p className="font-semibold tracking-wide text-rph-fg">{row.vehicleVrm}</p>
                <p className="mt-0.5 text-sm text-rph-fg-secondary">
                  {row.driverLabel}
                  {row.vehicleLabel ? ` · ${row.vehicleLabel}` : ""}
                </p>
                <p className="rph-muted mt-1 text-xs">{row.periodLabel}</p>
              </td>
              <td {...responsiveTableCellProps(subcompanyCol, "px-5 py-4 text-rph-fg-secondary")}>
                {row.subcompanyName ?? "—"}
              </td>
              <td {...responsiveTableCellProps(chargesCol, "px-5 py-4 text-right tabular-nums text-rph-fg")}>
                {formatGbp(row.chargesGbp)}
              </td>
              <td
                {...responsiveTableCellProps(
                  receivedCol,
                  "px-5 py-4 text-right font-semibold tabular-nums hire-balance-kpi-value-paid",
                )}
              >
                {formatGbp(row.receivedGbp)}
              </td>
              <td
                {...responsiveTableCellProps(
                  balanceCol,
                  "px-5 py-4 text-right font-semibold tabular-nums text-rph-fg",
                )}
              >
                {formatGbp(showPendingAsBalance ? row.pendingReviewGbp : row.balanceGbp)}
              </td>
              <td {...responsiveTableCellProps(statusCol, "px-5 py-4")}>
                <AccountStatusPill row={row} tab={tab} />
              </td>
              <td {...responsiveTableCellProps(actionCol, "px-5 py-4 text-right")}>
                <Link href={row.href} className="rph-btn-ghost h-9 px-3 text-xs">
                  {showPendingAsBalance && row.pendingReviewGbp > 0.005 ? "Review" : "Open account"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountStatusPill({
  row,
  tab,
}: {
  row: CompanyBalancesAccountRow;
  tab: CompanyBalancesTab;
}) {
  const label =
    tab === "payment_review" && row.pendingReviewGbp > 0.005
      ? "Review payment"
      : tab === "payment_review"
        ? "Pending review"
        : row.statusLabel;
  const tone =
    label === "Review payment" || label === "Pending review"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      : label === "Active account"
        ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
        : label === "Settled"
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
          : "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}
