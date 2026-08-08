"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissSubcompanyDocumentRequirementAction } from "@/app/actions/rental-subcompany-workspace";
import { formatUkDateTime } from "@/lib/datetime/uk";
import type {
  SubcompanyOverviewStats,
} from "@/lib/rental/load-subcompany-section-data";
import { formatSubcompanyAddressLines } from "@/lib/rental/subcompany-legal-snapshot";
import { subcompanyWorkspaceHref } from "@/lib/rental/subcompany-workspace-nav";
import {
  SUBCOMPANY_DOCUMENT_KIND_LABELS,
  type SubcompanyOpenRequirement,
} from "@/lib/rental/subcompany-workspace-types";
import { SUBCOMPANY_STATUS_LABELS } from "./subcompany-status-chip";
import { useSubcompanyWorkspace } from "./subcompany-workspace-provider";

export function SubcompanyOverviewClient({
  stats,
  openRequirements,
}: {
  stats: SubcompanyOverviewStats;
  openRequirements: SubcompanyOpenRequirement[];
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

  const address = formatSubcompanyAddressLines(subcompany);
  const contactName = [subcompany.primary_contact_first_name, subcompany.primary_contact_last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">{subcompany.name}</h1>
        <p className="rph-muted mt-1 text-sm">
          {subcompany.legal_name || "Subcompany overview"}
          {subcompany.is_primary ? " · Main company" : ""}
        </p>
      </div>

      {openRequirements.length ? (
        <div className="rph-alert-warn text-sm">
          <p className="font-semibold">
            {openRequirements.length === 1
              ? "1 hire document needs updating after a details change."
              : `${openRequirements.length} hire documents need updating after a details change.`}
          </p>
          <p className="mt-1 text-sm">
            Only active on-rent hires with generated or signed PDFs need updates. Ended contracts are cleared
            automatically — dismiss any remaining flags that were raised in error.
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Status</p>
          <p className="mt-2 text-lg font-semibold text-rph-fg">
            {SUBCOMPANY_STATUS_LABELS[subcompany.status]}
          </p>
          <p className="rph-muted mt-1 text-sm">
            Registered {formatUkDateTime(subcompany.created_at)}
          </p>
        </div>

        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Vehicles</p>
          <p className="mt-2 text-lg font-semibold text-rph-fg">
            {stats.vehicleCount.toLocaleString("en-GB")}
          </p>
          <Link href={subcompanyWorkspaceHref(subcompany.id, "vehicles")} className="rph-link mt-1 inline-block text-sm">
            View fleet
          </Link>
        </div>

        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Hires</p>
          <p className="mt-2 text-lg font-semibold text-rph-fg">
            {stats.activeHireCount.toLocaleString("en-GB")}
            <span className="rph-muted text-sm font-normal"> active</span>
          </p>
          <p className="rph-muted mt-1 text-sm">
            {stats.totalHireCount.toLocaleString("en-GB")} total
          </p>
          <Link href={subcompanyWorkspaceHref(subcompany.id, "hires")} className="rph-link mt-1 inline-block text-sm">
            View hires
          </Link>
        </div>

        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Contract updates</p>
          <p className="mt-2 text-lg font-semibold text-rph-fg">
            {stats.openRequirementCount.toLocaleString("en-GB")}
          </p>
          <p className="rph-muted mt-1 text-sm">Hire documents flagged for re-issue.</p>
        </div>

        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Registered office</p>
          <p className="mt-2 text-sm text-rph-fg-secondary">{address || "—"}</p>
          <Link href={subcompanyWorkspaceHref(subcompany.id, "details")} className="rph-link mt-2 inline-block text-sm">
            Edit details
          </Link>
        </div>

        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Primary contact</p>
          <p className="mt-2 text-sm font-semibold text-rph-fg">{contactName || "—"}</p>
          <p className="rph-muted text-sm">{subcompany.primary_contact_email}</p>
          <p className="rph-muted text-sm">{subcompany.primary_contact_phone}</p>
        </div>
      </div>
    </div>
  );
}
