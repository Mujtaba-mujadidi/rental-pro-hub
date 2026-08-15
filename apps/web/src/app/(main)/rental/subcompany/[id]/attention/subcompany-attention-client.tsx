"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { RphSelect } from "@/components/forms/rph-select";
import type { SubcompanyAttentionData } from "@/lib/rental/load-subcompany-attention-data";
import {
  SUBCOMPANY_ATTENTION_FILTERS,
  SUBCOMPANY_ATTENTION_SORT_OPTIONS,
  buildSubcompanyAttentionExportCsv,
  filterCounts,
  filterSubcompanyAttentionItems,
  sortSubcompanyAttentionItems,
  type SubcompanyAttentionFilter,
  type SubcompanyAttentionItem,
  type SubcompanyAttentionSort,
} from "@/lib/rental/subcompany-attention-display";

export function SubcompanyAttentionClient({ data }: { data: SubcompanyAttentionData }) {
  const [filter, setFilter] = useState<SubcompanyAttentionFilter>("all");
  const [sort, setSort] = useState<SubcompanyAttentionSort>("priority");

  const counts = useMemo(() => filterCounts(data.items), [data.items]);
  const visible = useMemo(
    () =>
      sortSubcompanyAttentionItems(filterSubcompanyAttentionItems(data.items, filter), sort),
    [data.items, filter, sort],
  );

  function exportCsv() {
    const csv = buildSubcompanyAttentionExportCsv(visible);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `attention-${data.subcompanyName.replace(/\s+/g, "-").toLowerCase()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const { summary } = data;

  return (
    <div className="subco-attention space-y-4 pb-4 sm:pb-5">
      <div className="hidden grid-cols-1 gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          tone="urgent"
          title="Urgent issues"
          value={String(summary.urgentCount)}
          detail="Requires immediate action"
          icon={<IconUrgent />}
        />
        <SummaryCard
          tone="urgent"
          title="Overdue rent"
          value={summary.overdueRentLabel}
          detail="Due on active contracts"
          icon={<IconBanknote />}
        />
        <SummaryCard
          tone="warn"
          title="Contracts"
          value={String(summary.contractsCount)}
          detail="Reviews approaching"
          icon={<IconSwap />}
        />
        <SummaryCard
          tone="warn"
          title="Documents"
          value={String(summary.documentsCount)}
          detail="Expired, missing or expiring"
          icon={<IconDoc />}
        />
      </div>

      <section className="subco-attention-card rph-card overflow-hidden p-0 shadow-sm">
        <div className="border-b border-rph-border px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="company-dash-section-label">Action centre</p>
              <h2 className="mt-1 text-lg font-semibold text-rph-fg">Attention items</h2>
              <p className="mt-1 text-sm text-rph-fg-muted">
                Unresolved rent, contract and document issues for {data.subcompanyName}.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="min-w-0 flex-1 sm:min-w-[10.5rem] sm:flex-none">
                <RphSelect
                  value={sort}
                  onValueChange={(v) => setSort(v as SubcompanyAttentionSort)}
                  aria-label="Sort attention items"
                  options={SUBCOMPANY_ATTENTION_SORT_OPTIONS}
                  triggerClassName="rph-input flex h-9 w-full cursor-pointer items-center justify-between gap-2 px-3 text-left text-sm font-medium outline-none"
                />
              </div>
              <button
                type="button"
                className="rph-btn-ghost h-9 shrink-0 px-3.5 text-sm font-semibold"
                onClick={exportCsv}
              >
                Export
              </button>
            </div>
          </div>

          <div className="mt-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {SUBCOMPANY_ATTENTION_FILTERS.map((option) => {
              const active = filter === option.value;
              const count = counts[option.value];
              return (
                <button
                  key={option.value}
                  type="button"
                  className={
                    active
                      ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                      : "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rph-border bg-rph-raised px-3 py-1.5 text-xs font-semibold text-rph-fg-secondary hover:bg-rph-chrome"
                  }
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                  <span
                    className={
                      active
                        ? "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-800/40 px-1.5 text-[11px] tabular-nums text-white"
                        : "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rph-chrome px-1.5 text-[11px] tabular-nums text-rph-fg-muted"
                    }
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!visible.length ? (
          <p className="px-4 py-10 text-sm text-rph-fg-muted sm:px-5">
            {filter === "resolved"
              ? "No recently resolved items."
              : "Nothing needs attention right now."}
          </p>
        ) : (
          <ul className="divide-y divide-rph-border">
            {visible.map((item) => (
              <AttentionRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  tone,
  title,
  value,
  detail,
  icon,
}: {
  tone: "urgent" | "warn";
  title: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className={tone === "urgent" ? "subco-att-summary subco-att-summary-urgent" : "subco-att-summary subco-att-summary-warn"}>
      <div className="flex items-start gap-3">
        <span className="subco-att-summary-icon" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-rph-fg-secondary">{title}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-rph-fg [font-variant-numeric:lining-nums_tabular-nums]">
            {value}
          </p>
          <p className="mt-1 text-xs text-rph-fg-muted">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function AttentionRow({ item }: { item: SubcompanyAttentionItem }) {
  const barClass =
    item.urgency === "resolved"
      ? "subco-att-bar-ok"
      : item.urgency === "urgent"
        ? "subco-att-bar-urgent"
        : "subco-att-bar-doc";

  const dueClass =
    item.dueStatusLabel === "Required now" || item.dueStatusTone === "urgent"
      ? "font-semibold text-red-700 dark:text-red-300"
      : item.dueStatusTone === "warn"
        ? "font-semibold text-amber-800 dark:text-amber-200"
        : item.dueStatusTone === "ok"
          ? "text-rph-fg-secondary"
          : "text-rph-fg";

  const amountDisplay =
    item.amountGbp != null && item.amountGbp > 0 ? item.amountLabel : "—";

  return (
    <li className="subco-att-row">
      <span className={`subco-att-bar ${barClass}`} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            <CategoryBadge category={item.category} resolved={item.urgency === "resolved"} />
            <UrgencyBadge urgency={item.urgency} />
          </div>

          <div className="flex min-w-0 gap-3">
            <span className={`subco-att-row-icon ${barClass}`} aria-hidden>
              {item.urgency === "resolved" ? (
                <IconCheck />
              ) : item.urgency === "urgent" ? (
                <IconUrgent />
              ) : item.category === "contracts" ? (
                <IconSwap />
              ) : (
                <IconDoc />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-rph-fg">{item.title}</p>
              <p className="mt-0.5 text-sm text-rph-fg-secondary">{item.description}</p>
              <p className="mt-1 text-xs text-rph-fg-muted">{item.meta}</p>
            </div>
          </div>

          <div className="lg:hidden">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">
              {item.urgency === "resolved" ? "Completed" : "Due status"}
            </p>
            <p className={`mt-0.5 text-sm ${dueClass}`}>{item.dueStatusLabel}</p>
          </div>
        </div>

        <div className="hidden shrink-0 grid-cols-[8.75rem_6.25rem_9.25rem] items-center gap-4 lg:grid">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">
              {item.urgency === "resolved" ? "Completed" : "Due status"}
            </p>
            <p className={`mt-0.5 truncate text-sm ${dueClass}`}>{item.dueStatusLabel}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rph-fg-muted">
              Amount
            </p>
            <p className="mt-0.5 text-sm font-semibold text-rph-fg [font-variant-numeric:lining-nums_tabular-nums]">
              {amountDisplay}
            </p>
          </div>
          <div className="flex justify-end">
            <Link
              href={item.primaryActionHref}
              className={
                item.urgency === "resolved"
                  ? "rph-btn-ghost inline-flex h-8 w-full items-center justify-center px-2.5 text-xs font-semibold"
                  : "rph-btn-primary inline-flex h-8 w-full items-center justify-center px-2.5 text-xs"
              }
            >
              {item.primaryActionLabel}
            </Link>
          </div>
        </div>

        <div className="flex w-full lg:hidden">
          <Link
            href={item.primaryActionHref}
            className={
              item.urgency === "resolved"
                ? "rph-btn-ghost inline-flex h-8 w-full items-center justify-center px-2.5 text-xs font-semibold"
                : "rph-btn-primary inline-flex h-8 w-full items-center justify-center px-2.5 text-xs"
            }
          >
            {item.primaryActionLabel}
          </Link>
        </div>
      </div>
    </li>
  );
}

function CategoryBadge({
  category,
  resolved,
}: {
  category: SubcompanyAttentionItem["category"];
  resolved: boolean;
}) {
  const label = category === "rent" ? "Rent" : category === "contracts" ? "Contracts" : "Documents";
  const cls = resolved
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100"
    : category === "rent"
      ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-100"
      : category === "contracts"
        ? "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-100";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: SubcompanyAttentionItem["urgency"] }) {
  const label =
    urgency === "urgent"
      ? "Urgent"
      : urgency === "due_soon"
        ? "Due soon"
        : urgency === "upcoming"
          ? "Upcoming"
          : "Resolved";
  const cls =
    urgency === "urgent"
      ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-100"
      : urgency === "resolved"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/45 dark:text-emerald-100"
        : urgency === "due_soon"
          ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
          : "bg-rph-chrome text-rph-fg-secondary";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function IconUrgent() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconBanknote() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M7 12h0.01M17 12h0.01" strokeLinecap="round" />
    </svg>
  );
}

function IconSwap() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M7 8h11l-3-3M17 16H6l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="6" y="4" width="12" height="16" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h4" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
