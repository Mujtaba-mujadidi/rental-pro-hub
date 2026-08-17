"use client";

import {
  exportCompanyBalancesAction,
  loadCompanyBalancesPageAction,
} from "@/app/actions/company-balances";
import {
  COMPANY_BALANCES_TAB_OPTIONS,
  companyBalancesKpiSubtext,
  companyBalancesOpenRowsForTab,
  type CompanyBalancesOpenKind,
  type CompanyBalancesOpenRow,
  type CompanyBalancesPageData,
  type CompanyBalancesTab,
} from "@/lib/fleet/company-balances-summary";
import { formatUkDate, formatUkDateTime } from "@/lib/datetime/uk";
import { formatGbp } from "@/lib/fleet/maintenance";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

type KpiFocus = "open_balance" | "driver_due" | "pending" | "collected" | null;

function kindToneClass(kind: CompanyBalancesOpenKind): string {
  if (kind === "pending_approval") return "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
  if (kind === "refund_owed") return "bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100";
  if (kind === "settlement") return "bg-orange-50 text-orange-950 dark:bg-orange-950/40 dark:text-orange-100";
  return "bg-rph-chrome text-rph-fg-secondary";
}

function StatusDot({ tone }: { tone: "ok" | "warn" | "muted" | "due" }) {
  const className =
    tone === "ok"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : tone === "due"
          ? "bg-amber-700"
          : "bg-rph-fg-muted/40";
  return <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${className}`} aria-hidden />;
}

export function FleetBalancesView() {
  const [data, setData] = useState<CompanyBalancesPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [exportPending, startExport] = useTransition();
  const [tab, setTab] = useState<CompanyBalancesTab | null>(null);
  const [kpiFocus, setKpiFocus] = useState<KpiFocus>(null);

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

  const activeTab = tab ?? data?.defaultTab ?? "open";
  const kpis = data?.kpis;
  const subtext = kpis ? companyBalancesKpiSubtext(kpis) : null;

  const visibleOpenRows = useMemo(() => {
    if (!data) return [];
    const focus =
      activeTab === "open" && kpiFocus && kpiFocus !== "collected" ? kpiFocus : null;
    return companyBalancesOpenRowsForTab(data.openRows, "open", focus);
  }, [data, activeTab, kpiFocus]);

  function selectKpi(focus: KpiFocus, nextTab: CompanyBalancesTab = "open") {
    setTab(nextTab);
    setKpiFocus(focus);
  }

  function onExport() {
    startExport(async () => {
      const res = await exportCompanyBalancesAction(activeTab);
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
    });
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="rph-h1">Balances</h1>
          <p className="rph-muted mt-1 text-sm">
            See what is due across the business, then trace every figure back to its hire.
          </p>
        </div>
        <button
          type="button"
          className="rph-btn-ghost shrink-0"
          disabled={exportPending || pending || !data}
          onClick={onExport}
        >
          Export
        </button>
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          className={`rph-card flex gap-3 p-4 text-left transition hover:bg-rph-chrome/40 ${
            kpiFocus === "open_balance" && activeTab === "open" ? "ring-1 ring-rph-rail/40" : ""
          }`}
          onClick={() => selectKpi("open_balance")}
        >
          <StatusDot tone={kpis && kpis.openBalanceGbp > 0.005 ? "warn" : "ok"} />
          <div className="min-w-0">
            <p className="text-sm text-rph-fg-muted">Open balance</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-rph-fg">
              {kpis ? formatGbp(kpis.openBalanceGbp) : "—"}
            </p>
            <p className="mt-1 text-xs text-rph-fg-muted">{subtext?.openBalance ?? "…"}</p>
          </div>
        </button>

        <button
          type="button"
          className={`rph-card flex gap-3 p-4 text-left transition hover:bg-rph-chrome/40 ${
            kpiFocus === "driver_due" && activeTab === "open" ? "ring-1 ring-rph-rail/40" : ""
          }`}
          onClick={() => selectKpi("driver_due")}
        >
          <StatusDot tone={kpis && kpis.driverPaymentsDueGbp > 0.005 ? "due" : "ok"} />
          <div className="min-w-0">
            <p className="text-sm text-rph-fg-muted">Driver payments due</p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                kpis && kpis.driverPaymentsDueGbp > 0.005
                  ? "text-amber-800 dark:text-amber-200"
                  : "text-rph-fg"
              }`}
            >
              {kpis ? formatGbp(kpis.driverPaymentsDueGbp) : "—"}
            </p>
            <p className="mt-1 text-xs text-rph-fg-muted">{subtext?.driverPaymentsDue ?? "…"}</p>
          </div>
        </button>

        <button
          type="button"
          className={`rph-card flex gap-3 p-4 text-left transition hover:bg-rph-chrome/40 ${
            kpiFocus === "collected" && activeTab === "activity" ? "ring-1 ring-rph-rail/40" : ""
          }`}
          onClick={() => selectKpi("collected", "activity")}
        >
          <StatusDot tone="ok" />
          <div className="min-w-0">
            <p className="text-sm text-rph-fg-muted">Collected this month</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-rph-fg">
              {kpis ? formatGbp(kpis.collectedThisMonthGbp) : "—"}
            </p>
            <p className="mt-1 text-xs text-rph-fg-muted">{subtext?.collectedThisMonth ?? "…"}</p>
          </div>
        </button>

        <button
          type="button"
          className={`rph-card flex gap-3 p-4 text-left transition hover:bg-rph-chrome/40 ${
            kpiFocus === "pending" && activeTab === "open" ? "ring-1 ring-rph-rail/40" : ""
          }`}
          onClick={() => selectKpi("pending")}
        >
          <StatusDot tone={kpis && kpis.pendingApprovalGbp > 0.005 ? "warn" : "muted"} />
          <div className="min-w-0">
            <p className="text-sm text-rph-fg-muted">Pending approval</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-rph-fg">
              {kpis ? formatGbp(kpis.pendingApprovalGbp) : "—"}
            </p>
            <p className="mt-1 text-xs text-rph-fg-muted">{subtext?.pendingApproval ?? "…"}</p>
          </div>
        </button>
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
                  className={`shrink-0 border-b-2 px-3 pb-3 pt-2 text-sm transition ${
                    active
                      ? "border-rph-rail font-semibold text-rph-rail"
                      : "border-transparent font-medium text-rph-fg-muted hover:text-rph-fg"
                  }`}
                  onClick={() => {
                    setTab(option.value);
                    if (option.value !== "open") setKpiFocus(null);
                    if (option.value === "activity") setKpiFocus("collected");
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 sm:p-5">
          {pending && !data ? (
            <p className="rph-muted text-sm">Loading balances…</p>
          ) : activeTab === "open" ? (
            visibleOpenRows.length === 0 ? (
              <BalancesEmptyState
                title={
                  kpiFocus === "driver_due"
                    ? "No driver payments are due"
                    : kpiFocus === "pending"
                      ? "Nothing waiting for approval"
                      : kpiFocus === "open_balance"
                        ? "No company balances are open"
                        : "Nothing outstanding"
                }
                detail={
                  kpiFocus === "open_balance"
                    ? "Refunds owed to drivers will appear here. Driver rent and settlement due stay under Driver payments due."
                    : kpis && kpis.pendingApprovalGbp > 0.005 && kpiFocus == null
                      ? "No rent arrears or open settlements. Check Pending approval for submissions waiting for finance."
                      : "You are fully up to date for this view."
                }
              />
            ) : (
              <BalancesOpenTable rows={visibleOpenRows} />
            )
          ) : activeTab === "settled" ? (
            !data || data.settledRows.length === 0 ? (
              <BalancesEmptyState
                title="No settled balances yet"
                detail="Ended hires with a cleared settlement balance will appear here."
              />
            ) : (
              <div className="rph-table-responsive">
                <table className="min-w-full text-sm">
                  <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                    <tr>
                      <th className="px-4 py-3">Vehicle</th>
                      <th className="px-4 py-3">Driver</th>
                      <th className="px-4 py-3">Settled</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.settledRows.map((row) => (
                      <tr key={row.hireGroupId} className="border-t border-rph-border hover:bg-rph-chrome/40">
                        <td data-label="Vehicle" className="rph-table-primary px-4 py-3 font-medium text-rph-fg">
                          {row.vehicleVrm ?? "—"}
                        </td>
                        <td data-label="Driver" className="px-4 py-3 text-rph-fg-secondary">
                          {row.driverLabel ?? "—"}
                        </td>
                        <td data-label="Settled" className="px-4 py-3 text-rph-fg-secondary">
                          {row.settledAt ? formatUkDate(row.settledAt) : "—"}
                        </td>
                        <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                          <Link href={row.href} className="rph-btn-ghost h-9 px-3 text-xs">
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : !data || data.activityRows.length === 0 ? (
            <BalancesEmptyState
              title="No collections this month"
              detail="Approved rent and settlement receipts in the current UK month will appear here."
            />
          ) : (
            <div className="rph-table-responsive">
              <table className="min-w-full text-sm">
                <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Activity</th>
                    <th className="px-4 py-3">Detail</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activityRows.map((row) => (
                    <tr key={row.id} className="border-t border-rph-border hover:bg-rph-chrome/40">
                      <td data-label="When" className="px-4 py-3 text-rph-fg-secondary">
                        {formatUkDateTime(row.at)}
                      </td>
                      <td data-label="Activity" className="rph-table-primary px-4 py-3 font-medium text-rph-fg">
                        {row.title}
                      </td>
                      <td data-label="Detail" className="px-4 py-3 text-rph-fg-secondary">
                        {row.detail}
                      </td>
                      <td data-label="Amount" className="px-4 py-3 text-right font-semibold tabular-nums text-rph-fg">
                        {formatGbp(row.amountGbp)}
                      </td>
                      <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                        <Link href={row.href} className="rph-btn-ghost h-9 px-3 text-xs">
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function BalancesEmptyState({ title, detail }: { title: string; detail: string }) {
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
      <p className="mt-4 text-base font-semibold text-rph-fg">{title}</p>
      <p className="rph-muted mt-1 max-w-md text-sm">{detail}</p>
    </div>
  );
}

function BalancesOpenTable({ rows }: { rows: CompanyBalancesOpenRow[] }) {
  return (
    <div className="rph-table-responsive">
      <table className="min-w-full text-sm">
        <thead className="bg-rph-chrome text-left text-xs uppercase tracking-wide text-rph-fg-muted">
          <tr>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Vehicle</th>
            <th className="px-4 py-3">Driver</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-rph-border hover:bg-rph-chrome/40">
              <td data-label="Type" className="px-4 py-3">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${kindToneClass(row.kind)}`}>
                  {row.kindLabel}
                </span>
              </td>
              <td data-label="Vehicle" className="rph-table-primary px-4 py-3 font-medium text-rph-fg">
                {row.vehicleVrm ?? "—"}
              </td>
              <td data-label="Driver" className="px-4 py-3 text-rph-fg-secondary">
                {row.driverLabel ?? "—"}
              </td>
              <td data-label="Date" className="px-4 py-3 text-rph-fg-secondary">
                {row.at ? (/^\d{4}-\d{2}-\d{2}$/.test(row.at) ? formatUkDate(row.at) : formatUkDateTime(row.at)) : "—"}
              </td>
              <td data-label="Amount" className="px-4 py-3 text-right font-semibold tabular-nums text-rph-fg">
                {formatGbp(row.amountGbp)}
              </td>
              <td data-label="" className="rph-table-actions px-4 py-3 text-right">
                <Link href={row.href} className="rph-btn-ghost h-9 px-3 text-xs">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
