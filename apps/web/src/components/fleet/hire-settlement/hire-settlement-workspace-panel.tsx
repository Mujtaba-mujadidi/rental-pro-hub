"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useHirePaymentsRealtime } from "@/hooks/use-hire-realtime";
import Link from "next/link";
import {
  addHireBalanceNoteAction,
  loadHireSettlementWorkspaceAction,
  type HireSettlementWorkspaceData,
} from "@/app/actions/rental-hire-termination";
import { HirePaymentStatementDownloadButton } from "@/components/fleet/hire-payments/hire-payment-statement-download-button";
import { HireEndedCompanyPaymentsView } from "@/components/fleet/hire-payments/hire-ended-company-payments-view";
import { HireActiveBalanceWorkspaceView } from "@/components/fleet/hire-settlement/hire-active-balance-workspace-view";
import { formatUkDateTime } from "@/lib/datetime/uk";
import {
  hireBalanceCompanyLine,
  hireBalancePeriodLine,
  hireBalanceReference,
  hireBalanceStatusLabel,
} from "@/lib/fleet/hire-settlement-balance-display";

export function HireSettlementWorkspacePanel({
  hireGroupId,
  embedded = false,
}: {
  hireGroupId: string;
  embedded?: boolean;
}) {
  const [data, setData] = useState<HireSettlementWorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [noteBody, setNoteBody] = useState("");

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadHireSettlementWorkspaceAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
      setError(null);
    });
  }, [hireGroupId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Company sheet owns its payload (unlike tab-cache invalidation alone).
  useHirePaymentsRealtime(hireGroupId, reload, { channelPrefix: "hire-payments-settlement" });

  if (!data && pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading settlement…</p>
      </div>
    );
  }

  if (error && !data) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  const ended = data.hireStatus === "terminated" || data.hireStatus === "completed";
  const settled = ended && data.settlementDirection === "settled";
  const reference = hireBalanceReference(data.vehicleVrm, data.terminatedAt ?? data.activatedAt);
  const periodLine = hireBalancePeriodLine({
    vehicleVrm: data.vehicleVrm,
    ended,
    startedAt: data.activatedAt,
    terminatedAt: data.terminatedAt,
    driverLabel: data.driverLabel,
  });
  const companyLine = hireBalanceCompanyLine(data.companyName, ended);

  if (!ended) {
    return (
      <HireActiveBalanceWorkspaceView
        hireGroupId={hireGroupId}
        data={data}
        onReload={reload}
        embedded={embedded}
      />
    );
  }

  if (!data.endedPayments) {
    return <p className="rph-alert-error text-sm">Unable to load settlement details.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {!embedded ? (
            <Link href="/rental/balances" className="text-sm font-medium text-rph-link hover:text-rph-link-hover">
              ← Back to balances
            </Link>
          ) : null}
          <div className={`flex flex-wrap items-center gap-2 ${embedded ? "" : "mt-3"}`}>
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                settled
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-100"
                  : "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
              }`}
            >
              {hireBalanceStatusLabel(settled)}
            </span>
            <span className="font-mono text-xs text-rph-fg-muted">{reference}</span>
          </div>
          <h1 className="rph-h1 mt-2">Settlement balance</h1>
          <p className="mt-1 text-sm text-rph-fg">{periodLine}</p>
          {companyLine ? <p className="rph-muted mt-0.5 text-sm">{companyLine}</p> : null}
        </div>
        {!embedded ? (
          <div className="flex flex-wrap items-center gap-2">
            <HirePaymentStatementDownloadButton
              hireGroupId={hireGroupId}
              variant="default"
              source="balance-account"
            />
            <Link href={`/rental/hires/${hireGroupId}`} className="rph-btn-ghost">
              Hire workspace
            </Link>
          </div>
        ) : null}
      </div>

      <HireEndedCompanyPaymentsView
        hireGroupId={hireGroupId}
        data={data.endedPayments}
        onReload={reload}
        hideIntro
      />

      {data.notes.length ? (
        <section className="overflow-hidden rounded-2xl border border-rph-border">
          <div className="border-b border-rph-border bg-rph-chrome px-5 py-3">
            <h2 className="text-sm font-semibold text-rph-fg">Notes</h2>
          </div>
          <ul className="divide-y divide-rph-border">
            {data.notes.map((note) => (
              <li key={note.id} className="px-5 py-3 text-sm text-rph-fg-secondary">
                <p>{note.body}</p>
                <p className="rph-muted mt-1 text-xs">{formatUkDateTime(note.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.canWrite && !settled ? (
        <section className="rph-card space-y-3 p-5">
          <h2 className="text-sm font-semibold text-rph-fg">Add note</h2>
          <textarea
            className="rph-input min-h-20 w-full"
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
          />
          <button
            type="button"
            className="rph-btn-ghost"
            disabled={pending || !noteBody.trim()}
            onClick={() => {
              startTransition(async () => {
                const res = await addHireBalanceNoteAction({ hireGroupId, body: noteBody });
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setNoteBody("");
                reload();
              });
            }}
          >
            Save note
          </button>
        </section>
      ) : null}
    </div>
  );
}
