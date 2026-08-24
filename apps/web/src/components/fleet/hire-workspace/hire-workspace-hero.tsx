"use client";

import Link from "next/link";
import { driverHireStatusTone } from "@/lib/fleet/driver-hire-nav";
import type { HireWorkspaceChromeData } from "@/lib/fleet/hire-workspace-chrome-types";
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
  const statusTone = driverHireStatusTone(status);
  const chipTone =
    statusTone === "success" ? "success" : statusTone === "warning" || statusTone === "pending" ? "warn" : "neutral";
  const subtitleName = mode === "driver" ? chrome.companyName ?? "—" : chrome.lessorName;
  const partyLabel = mode === "driver" ? "Rental company" : "Driver";
  const partyValue = mode === "driver" ? chrome.companyName ?? "—" : chrome.driverName ?? "—";

  const endActions =
    (mode === "staff" && chrome.canTerminate) || chrome.canCheckIn ? (
      <div className="hire-ws-hero-end-actions">
        {mode === "staff" && chrome.canTerminate ? (
          <Link href={`/rental/hires/${chrome.hireGroupId}/end-hire`} className="hire-ws-hero-end-hire">
            End hire
          </Link>
        ) : null}
        {chrome.canCheckIn ? (
          <Link
            href={
              mode === "driver"
                ? `/driver/hires/${chrome.hireGroupId}/checkin`
                : `/rental/hires/${chrome.hireGroupId}/end-hire`
            }
            className="hire-ws-hero-checkin"
          >
            Check in
          </Link>
        ) : null}
      </div>
    ) : null;

  return (
    <section className="hire-ws-hero">
      <div className="hire-ws-hero-inner">
        <div className="hire-ws-hero-top">
          <div className="hire-ws-hero-top-main">
            <div className="hire-ws-hero-chips">
              <HireWorkspacePlate vrm={chrome.vehicleVrm} compact />
              <HireWorkspaceChip tone={chipTone}>{chrome.statusLabel}</HireWorkspaceChip>
              {chrome.amountDueChip ? (
                <HireWorkspaceChip tone="warn">{chrome.amountDueChip}</HireWorkspaceChip>
              ) : null}
              {chrome.settlementStatusChip ? (
                <HireWorkspaceChip tone="success">{chrome.settlementStatusChip}</HireWorkspaceChip>
              ) : null}
            </div>
            <h1 className="hire-ws-hero-title">{chrome.vehicleMakeModel}</h1>
            <p className="hire-ws-hero-subtitle">
              Hire #{chrome.hireGroupIdShort}
              <span className="text-rph-fg-muted"> · </span>
              <span className="break-words">{subtitleName}</span>
            </p>
          </div>
          {endActions}
        </div>

        <div className="hire-ws-hero-metrics">
          {chrome.contractEnded ? (
            <>
              <Metric label={partyLabel} value={partyValue} />
              <Metric label="Hire period" value={chrome.endedHirePeriodLabel ?? "—"} />
              <Metric label="Time on hire" value={chrome.endedTimeOnHireLabel ?? "—"} />
              <Metric label={chrome.rentMetricLabel} value={chrome.dailyRentLabel ?? "—"} />
            </>
          ) : (
            <>
              <Metric label={partyLabel} value={partyValue} />
              <Metric label="Hire started" value={chrome.contractStartLabel} />
              <Metric label="Signed / activated" value={chrome.activeSinceLabel} />
              <Metric label={chrome.rentMetricLabel} value={chrome.dailyRentLabel ?? "—"} />
            </>
          )}
        </div>
      </div>
    </section>
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
      <p className="hire-ws-hero-metric-label">{label}</p>
      <p className="hire-ws-hero-metric-value">{value}</p>
    </div>
  );
}
