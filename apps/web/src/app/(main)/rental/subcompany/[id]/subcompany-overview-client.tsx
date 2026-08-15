"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissSubcompanyDocumentRequirementAction } from "@/app/actions/rental-subcompany-workspace";
import type { SubcompanyOverviewStats } from "@/lib/rental/load-subcompany-section-data";
import { formatSubcompanyAddressLines } from "@/lib/rental/subcompany-legal-snapshot";
import type { SubcompanyOverviewActivityItem } from "@/lib/rental/subcompany-overview-display";
import { subcompanyWorkspaceHref } from "@/lib/rental/subcompany-workspace-nav";
import {
  SUBCOMPANY_DOCUMENT_KIND_LABELS,
  type SubcompanyOpenRequirement,
} from "@/lib/rental/subcompany-workspace-types";
import { useSubcompanyWorkspace } from "./subcompany-workspace-provider";

export function SubcompanyOverviewClient({
  stats,
  openRequirements,
  recentActivity,
}: {
  stats: SubcompanyOverviewStats;
  openRequirements: SubcompanyOpenRequirement[];
  recentActivity: SubcompanyOverviewActivityItem[];
}) {
  const { shell, refreshShell } = useSubcompanyWorkspace();
  const subcompany = shell.subcompany;
  const [pendingDismissId, setPendingDismissId] = useState<string | null>(null);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function dismissRequirement(requirementId: string) {
    setDismissError(null);
    setPendingDismissId(requirementId);
    startTransition(async () => {
      const res = await dismissSubcompanyDocumentRequirementAction(requirementId);
      setPendingDismissId(null);
      if (!res.ok) {
        setDismissError(res.error);
        return;
      }
      refreshShell();
    });
  }

  const address =
    [subcompany.registered_town?.trim(), subcompany.country?.trim()].filter(Boolean).join(", ") ||
    formatSubcompanyAddressLines(subcompany) ||
    "—";
  const tradingName = subcompany.display_name?.trim() || subcompany.name;
  const healthy = stats.health === "healthy";

  return (
    <div className="subco-ov space-y-4 sm:space-y-5">
      {openRequirements.length ? (
        <div className="rph-alert-warn text-sm">
          <p className="font-semibold">
            {openRequirements.length === 1
              ? "1 hire document needs updating after a details change."
              : `${openRequirements.length} hire documents need updating after a details change.`}
          </p>
          <p className="mt-1 text-sm">
            Only active on-rent hires with generated or signed PDFs need updates. Ended contracts are
            cleared automatically — dismiss any remaining flags that were raised in error.
          </p>
          {dismissError ? <p className="mt-2 text-sm text-red-600">{dismissError}</p> : null}
          <ul className="mt-2 space-y-2">
            {openRequirements.map((req) => (
              <li key={req.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  <Link href={req.href} className="rph-link">
                    {req.label}
                  </Link>
                  <span> · {SUBCOMPANY_DOCUMENT_KIND_LABELS[req.documentKind]}</span>
                </span>
                {shell.canWrite ? (
                  <button
                    type="button"
                    className="rph-btn-ghost px-2 py-1 text-xs disabled:opacity-50"
                    disabled={isPending && pendingDismissId === req.id}
                    onClick={() => dismissRequirement(req.id)}
                  >
                    {isPending && pendingDismissId === req.id ? "Dismissing…" : "Not needed"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="subco-ov-ops rph-card overflow-hidden p-0 lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-rph-border px-4 py-3.5 sm:px-5">
            <h2 className="text-base font-semibold text-rph-fg">Operational summary</h2>
            <span className={healthy ? "subco-ov-health-ok" : "subco-ov-health-warn"}>
              {stats.healthLabel}
            </span>
          </div>
          <div className="grid grid-cols-2">
            <div className="border-b border-r border-rph-border px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-sm text-rph-fg-muted">Fleet vehicles</p>
              <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-rph-fg sm:text-2xl">
                {stats.vehicleCount.toLocaleString("en-GB")}
              </p>
            </div>
            <div className="border-b border-rph-border px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-sm text-rph-fg-muted">Active hires</p>
              <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-rph-fg sm:text-2xl">
                {stats.activeHireCount.toLocaleString("en-GB")}
              </p>
            </div>
            <div className="border-r border-rph-border px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-sm text-rph-fg-muted">Open balance</p>
              <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-rph-fg sm:text-2xl">
                {stats.openBalanceLabel}
              </p>
            </div>
            <div className="px-4 py-4 sm:px-5 sm:py-5">
              <p className="text-sm text-rph-fg-muted">Compliance</p>
              <p
                className={`mt-1 text-xl font-semibold tracking-tight sm:text-2xl ${
                  healthy ? "text-rph-fg" : "text-amber-800 dark:text-amber-200"
                }`}
              >
                {stats.complianceLabel}
              </p>
              <p className="mt-1.5 text-xs leading-snug text-rph-fg-muted">
                {healthy
                  ? "Fleet documents and MOT, tax, and PHV renewals are up to date. No hire paperwork needs updating."
                  : "Something needs attention — missing or expiring vehicle documents, or hire paperwork that must be updated after a details change."}
              </p>
            </div>
          </div>
        </section>

        <section className="subco-ov-details rph-card overflow-hidden p-0">
          <div className="flex items-center justify-between gap-3 border-b border-rph-border px-4 py-3.5 sm:px-5">
            <h2 className="text-base font-semibold text-rph-fg">Company details</h2>
            <Link
              href={subcompanyWorkspaceHref(subcompany.id, "details")}
              className="rph-open-link-sm"
            >
              {shell.canWrite ? "Edit" : "View"}
            </Link>
          </div>
          <dl className="divide-y divide-rph-border">
            <div className="flex items-start justify-between gap-4 px-4 py-3.5 text-sm sm:px-5">
              <dt className="shrink-0 text-rph-fg-muted">Trading name</dt>
              <dd className="min-w-0 text-right font-semibold text-rph-fg">{tradingName}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-4 py-3.5 text-sm sm:px-5">
              <dt className="shrink-0 text-rph-fg-muted">Contact email</dt>
              <dd className="min-w-0 break-all text-right font-semibold text-rph-fg">
                {subcompany.primary_contact_email || "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-4 py-3.5 text-sm sm:px-5">
              <dt className="shrink-0 text-rph-fg-muted">Contact number</dt>
              <dd className="min-w-0 text-right font-semibold text-rph-fg">
                {subcompany.primary_contact_phone || "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 px-4 py-3.5 text-sm sm:px-5">
              <dt className="shrink-0 text-rph-fg-muted">Address</dt>
              <dd className="min-w-0 text-right font-semibold text-rph-fg">{address}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="subco-ov-activity rph-card overflow-hidden p-0 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-rph-border px-4 py-3.5 sm:px-5">
          <h2 className="text-base font-semibold text-rph-fg">Recent activity</h2>
          <Link
            href={subcompanyWorkspaceHref(subcompany.id, "activity")}
            className="text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
          >
            View all
          </Link>
        </div>
        {!recentActivity.length ? (
          <p className="px-4 py-5 text-sm text-rph-fg-muted sm:px-5">No recent activity yet.</p>
        ) : (
          <ul className="px-4 py-4 sm:px-5">
            {recentActivity.map((item, index) => {
              const isLast = index === recentActivity.length - 1;
              const dotClass =
                item.tone === "ok"
                  ? "bg-emerald-500"
                  : item.tone === "warn"
                    ? "bg-amber-500"
                    : "bg-sky-600";
              return (
                <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {!isLast ? (
                    <span
                      className="absolute left-[4px] top-3 bottom-0 w-px bg-rph-border"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={`relative z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-rph-fg">{item.title}</p>
                    <p className="text-xs text-rph-fg-secondary">{item.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
