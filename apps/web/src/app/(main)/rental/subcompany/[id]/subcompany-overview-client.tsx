"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  loadSubcompanyOverviewAction,
  type SubcompanyOverviewStats,
} from "@/app/actions/rental-subcompany-workspace";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { formatSubcompanyAddressLines } from "@/lib/rental/subcompany-legal-snapshot";
import { subcompanyWorkspaceHref, subcompanyWorkspaceNav } from "@/lib/rental/subcompany-workspace-nav";
import {
  SUBCOMPANY_DOCUMENT_KIND_LABELS,
  type SubcompanyOpenRequirement,
} from "@/lib/rental/subcompany-workspace-types";
import { SUBCOMPANY_STATUS_LABELS } from "./subcompany-status-chip";
import { useSubcompanyWorkspace } from "./subcompany-workspace-provider";

export function SubcompanyOverviewClient() {
  const { shell } = useSubcompanyWorkspace();
  const subcompany = shell.subcompany;
  const [pending, startTransition] = useTransition();
  const [stats, setStats] = useState<SubcompanyOverviewStats | null>(null);
  const [openRequirements, setOpenRequirements] = useState<SubcompanyOpenRequirement[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const res = await loadSubcompanyOverviewAction(subcompany.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStats(res.stats);
      setOpenRequirements(res.openRequirements);
      setError(null);
    });
  }, [subcompany.id]);

  const address = formatSubcompanyAddressLines(subcompany);
  const contactName = [subcompany.primary_contact_first_name, subcompany.primary_contact_last_name]
    .filter(Boolean)
    .join(" ");
  const relatedLinks = subcompanyWorkspaceNav(subcompany.id).filter(
    (item) => item.label === "Vehicles" || item.label === "Hires" || item.label === "Staff",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="rph-h1">{subcompany.name}</h1>
        <p className="rph-muted mt-1 text-sm">
          {subcompany.legal_name || "Subcompany overview"}
          {subcompany.is_primary ? " · Main company" : ""}
        </p>
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {openRequirements.length ? (
        <div className="rph-alert-warn text-sm">
          <p className="font-semibold">
            {openRequirements.length === 1
              ? "1 hire document needs updating after a details change."
              : `${openRequirements.length} hire documents need updating after a details change.`}
          </p>
          <ul className="mt-2 space-y-1">
            {openRequirements.map((req) => (
              <li key={req.id}>
                <Link href={req.href} className="rph-link">
                  {req.label}
                </Link>
                <span> · {SUBCOMPANY_DOCUMENT_KIND_LABELS[req.documentKind]}</span>
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
            {stats ? stats.vehicleCount.toLocaleString("en-GB") : pending ? "…" : "—"}
          </p>
          <Link href={subcompanyWorkspaceHref(subcompany.id, "vehicles")} className="rph-link mt-1 inline-block text-sm">
            View fleet
          </Link>
        </div>

        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Hires</p>
          <p className="mt-2 text-lg font-semibold text-rph-fg">
            {stats ? stats.activeHireCount.toLocaleString("en-GB") : pending ? "…" : "—"}
            <span className="rph-muted text-sm font-normal"> active</span>
          </p>
          <p className="rph-muted mt-1 text-sm">
            {stats ? `${stats.totalHireCount.toLocaleString("en-GB")} total` : "—"}
          </p>
          <Link href={subcompanyWorkspaceHref(subcompany.id, "hires")} className="rph-link mt-1 inline-block text-sm">
            View hires
          </Link>
        </div>

        <div className="rph-card p-4">
          <p className="rph-meta font-semibold uppercase tracking-wide">Contract updates</p>
          <p className="mt-2 text-lg font-semibold text-rph-fg">
            {stats ? stats.openRequirementCount.toLocaleString("en-GB") : shell.openRequirementCount}
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

      <div className="rph-panel p-4">
        <p className="rph-meta font-semibold uppercase tracking-wide">Related lists</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {relatedLinks.map((item) => (
            <Link key={item.href} href={item.href} className="rph-pill">
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
