"use client";

import Link from "next/link";
import { useState } from "react";
import { driverHireStatusTone } from "@/lib/fleet/driver-hire-nav";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import { HireTerminateContractModal } from "@/components/fleet/hire-termination/hire-terminate-contract-modal";
import { HireWorkspaceChip, HireWorkspacePlate } from "@/components/fleet/hire-workspace/hire-workspace-ui";

export function HireWorkspaceHero({
  chrome,
  status,
  mode = "staff",
  backHref,
}: {
  chrome: HireWorkspaceChromeData;
  status: string;
  mode?: "staff" | "driver";
  backHref?: string;
}) {
  const [terminateOpen, setTerminateOpen] = useState(false);
  const statusTone = driverHireStatusTone(status);
  const chipTone =
    statusTone === "success" ? "success" : statusTone === "warning" || statusTone === "pending" ? "warn" : "neutral";
  const subtitleName = mode === "driver" ? chrome.companyName ?? "—" : chrome.lessorName;

  return (
    <>
      <section>
        <div className="hire-ws-hero-head">
          {backHref ? (
            <Link href={backHref} className="hire-ws-hero-back" aria-label="Back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ) : null}
          <div className="hire-ws-hero-identity">
            <HireWorkspacePlate vrm={chrome.vehicleVrm} compact />
            <div className="min-w-0 pt-0.5">
              <h1 className="text-base font-semibold tracking-tight text-rph-fg sm:text-xl">{chrome.vehicleMakeModel}</h1>
              <p className="mt-0.5 text-[11px] text-rph-fg-secondary sm:text-xs">
                Hire #{chrome.hireGroupIdShort}
                <span className="text-rph-fg-muted"> · </span>
                <span className="break-words">{subtitleName}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="hire-ws-hero-actions">
          <HireWorkspaceChip tone={chipTone} dot>
            {chrome.statusLabel}
          </HireWorkspaceChip>
          {chrome.amountDueChip ? (
            <HireWorkspaceChip tone="warn" dot>
              {chrome.amountDueChip}
            </HireWorkspaceChip>
          ) : null}
          {chrome.settlementStatusChip ? (
            <HireWorkspaceChip tone="success" dot>
              {chrome.settlementStatusChip}
            </HireWorkspaceChip>
          ) : null}
          {mode === "staff" && chrome.canTerminate ? (
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-lg border border-red-300 bg-rph-raised px-3 text-xs font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-50 dark:border-red-800/60 dark:text-red-300 dark:hover:bg-red-950/30"
              onClick={() => setTerminateOpen(true)}
            >
              End contract
            </button>
          ) : null}
          {chrome.canCheckIn ? (
            <Link
              href={
                mode === "driver"
                  ? `/driver/hires/${chrome.hireGroupId}/checkin`
                  : `/rental/hires/${chrome.hireGroupId}/checkin`
              }
              className="inline-flex h-8 items-center rounded-lg border border-rph-rail/30 bg-rph-rail px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-rph-rail-hover"
            >
              Check in
            </Link>
          ) : null}
        </div>

        <div className="hire-ws-hero-metrics">
          {chrome.contractEnded ? (
            <>
              <Metric
                label={mode === "driver" ? "Rental company" : "Driver"}
                value={mode === "driver" ? chrome.companyName ?? "—" : chrome.driverName ?? "—"}
              />
              <Metric label="Hire period" value={chrome.endedHirePeriodLabel ?? "—"} />
              <Metric label="Time on hire" value={chrome.endedTimeOnHireLabel ?? "—"} />
              <Metric label={chrome.rentMetricLabel} value={chrome.dailyRentLabel ?? "—"} />
            </>
          ) : (
            <>
              <Metric
                label={mode === "driver" ? "Rental company" : "Driver"}
                value={mode === "driver" ? chrome.companyName ?? "—" : chrome.driverName ?? "—"}
              />
              <Metric label="Active since" value={chrome.activeSinceLabel} />
              <Metric label="Contract ends" value={chrome.contractEndLabel ?? "—"} />
              <Metric label={chrome.rentMetricLabel} value={chrome.dailyRentLabel ?? "—"} />
            </>
          )}
        </div>
      </section>

      {mode === "staff" && chrome.canTerminate ? (
        <HireTerminateContractModal
          hireGroupId={chrome.hireGroupId}
          open={terminateOpen}
          includeDeposit={chrome.includeDeposit}
          onClose={() => setTerminateOpen(false)}
          onCompleted={() => window.location.reload()}
        />
      ) : null}
    </>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="hire-ws-hero-metric">
      <p className="hire-ws-section-kicker">{label}</p>
      <p className="hire-ws-hero-metric-value">{value}</p>
    </div>
  );
}
