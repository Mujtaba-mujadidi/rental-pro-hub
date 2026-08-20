"use client";

import type { HireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import type { HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";
import {
  overallTerminationPositionGbp,
  settlementBalanceLabel,
} from "@/lib/fleet/hire-termination-summary";
import { driverHireWorkspaceHref } from "@/lib/fleet/driver-hire-workspace-nav";
import { formatGbp } from "@/lib/fleet/maintenance";
import Link from "next/link";

export function HireOverviewSettlementNote({
  hireGroupId,
  audience,
  settlementBalance,
  terminationSummary,
  depositPendingReview,
  depositGbp,
  depositDispositionLabel,
  hasPostEndPrepaidPayments,
}: {
  hireGroupId: string;
  audience: "staff" | "driver";
  settlementBalance: HireWorkspaceSettlementBalance | null;
  terminationSummary: HireTerminationAccountsSummary | null;
  depositPendingReview: boolean;
  depositGbp: number | null;
  depositDispositionLabel: string | null;
  hasPostEndPrepaidPayments: boolean;
}) {
  const paymentsHref =
    audience === "driver"
      ? driverHireWorkspaceHref(hireGroupId, "payments")
      : `/rental/hires/${hireGroupId}/payments`;
  const settlementHref =
    audience === "driver"
      ? driverHireWorkspaceHref(hireGroupId, "settlement")
      : `/rental/hires/${hireGroupId}/settlement`;
  const paymentsLabel = audience === "driver" ? "Payments & settlement" : "Payments";
  const settled = settlementBalance?.settled === true;

  return (
    <section className="rph-card space-y-2 border-rph-border-strong p-4">
      <h2 className="text-sm font-semibold text-rph-fg">After contract end</h2>
      <ul className="list-inside list-disc space-y-1.5 text-sm text-rph-fg-secondary">
        {terminationSummary ? (
          <li>
            Money owed when the contract ended:{" "}
            <span className="font-medium text-rph-fg">
              {settlementBalanceLabel(
                terminationSummary.balanceDirection,
                Math.abs(overallTerminationPositionGbp(terminationSummary)),
                audience,
              )}
            </span>
            {(terminationSummary.outstandingExtraChargesGbp ?? 0) > 0.005 ? (
              <span className="text-rph-fg-secondary">
                {" "}
                (includes {formatGbp(terminationSummary.outstandingExtraChargesGbp)} extra charges)
              </span>
            ) : null}
          </li>
        ) : null}
        <li>
          Final balance now:{" "}
          <span className="font-medium text-rph-fg">
            {settled
              ? "All clear — nothing owed"
              : settlementBalance
                ? settlementBalanceLabel(
                    settlementBalance.settlementDirection,
                    settlementBalance.openBalanceGbp,
                    audience,
                  )
                : "—"}
          </span>
          {!settled ? (
            <>
              {" "}
              — see{" "}
              <Link href={settlementHref} className="rph-link-inline">
                Settlement
              </Link>
            </>
          ) : null}
        </li>
        {depositPendingReview && (depositGbp ?? 0) > 0 ? (
          <li>
            Deposit of {formatGbp(depositGbp ?? 0)} is still held —{" "}
            {audience === "staff" ? (
              <Link href={paymentsHref} className="rph-link-inline">
                decide on Payments
              </Link>
            ) : (
              "your rental company will confirm what happens to it"
            )}
          </li>
        ) : depositDispositionLabel ? (
          <li>
            Deposit: <span className="font-medium text-rph-fg">{depositDispositionLabel}</span>
          </li>
        ) : null}
        {hasPostEndPrepaidPayments ? (
          <li>
            Some rent was paid in advance for weeks after the end date. See{" "}
            <Link href={paymentsHref} className="rph-link-inline">
              {paymentsLabel}
            </Link>{" "}
            for refunds or how it was settled.
          </li>
        ) : null}
        <li>
          Refunds, deposit returns, and damage charges are listed on{" "}
          <Link href={paymentsHref} className="rph-link-inline">
            {paymentsLabel}
          </Link>{" "}
          and{" "}
          <Link href={settlementHref} className="rph-link-inline">
            Settlement
          </Link>{" "}
          — not in the rent totals above.
        </li>
      </ul>
    </section>
  );
}
