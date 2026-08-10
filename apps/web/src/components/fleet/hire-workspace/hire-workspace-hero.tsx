"use client";

import { useState } from "react";
import { driverHireStatusTone } from "@/lib/fleet/driver-hire-nav";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
import { HireTerminateContractModal } from "@/components/fleet/hire-termination/hire-terminate-contract-modal";
import { HireWorkspaceChip, HireWorkspacePlate } from "@/components/fleet/hire-workspace/hire-workspace-ui";

export function HireWorkspaceHero({
  chrome,
  status,
  mode = "staff",
}: {
  chrome: HireWorkspaceChromeData;
  status: string;
  mode?: "staff" | "driver";
}) {
  const [terminateOpen, setTerminateOpen] = useState(false);
  const statusTone = driverHireStatusTone(status);
  const chipTone =
    statusTone === "success" ? "success" : statusTone === "warning" || statusTone === "pending" ? "warn" : "neutral";
  const subtitleName = mode === "driver" ? chrome.companyName ?? "—" : chrome.lessorName;

  return (
    <>
      <section>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <HireWorkspacePlate vrm={chrome.vehicleVrm} compact />
            <div className="min-w-0 pt-0.5">
              <h1 className="text-xl font-semibold tracking-tight text-rph-fg">{chrome.vehicleMakeModel}</h1>
              <p className="mt-0.5 text-xs text-rph-fg-secondary">
                Hire #{chrome.hireGroupIdShort}
                <span className="text-rph-fg-muted"> · </span>
                {subtitleName}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
          </div>
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
      <p className="mt-0.5 whitespace-nowrap text-sm font-semibold text-rph-fg">{value}</p>
    </div>
  );
}
