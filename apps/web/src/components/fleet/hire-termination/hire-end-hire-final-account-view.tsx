"use client";

import { useMemo, useRef, useState } from "react";
import type { HireEndHirePageData } from "@/app/actions/hire-end-hire";
import type { HireDepositFinalizePayload } from "@/components/fleet/hire-payments/hire-deposit-disposition-resolve-card";
import { HireEndHireDepositPositionPanel } from "@/components/fleet/hire-termination/hire-end-hire-deposit-position-panel";
import { formatHireEndHireSignedAmount } from "@/lib/fleet/hire-end-hire-financial";
import {
  buildHireEndHireFinalAccountModel,
  buildHireEndHireFinalAccountStatement,
  hireEndHireFinalAccountBalanceLabel,
  type HireEndHireFinalAccountModel,
  type HireEndHireFinalAccountStatementRow,
} from "@/lib/fleet/hire-end-hire-final-account";
import { formatGbp } from "@/lib/fleet/maintenance";
import type { HireEndHireFinancialReview } from "@/lib/fleet/hire-end-hire-financial";

type FinalAccountTab = "overview" | "statement";

function FinalAccountAmountRow({
  label,
  amount,
  emphasis,
}: {
  label: string;
  amount: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-1.5 ${
        emphasis ? "mt-1 border-t border-dashed border-rph-border pt-2 font-semibold text-rph-fg" : ""
      }`}
    >
      <span className={emphasis ? "text-sm" : "text-sm text-rph-fg-secondary"}>{label}</span>
      <span className="shrink-0 text-sm tabular-nums">{amount}</span>
    </div>
  );
}

function StatementStatusPill({
  label,
  tone,
}: {
  label: HireEndHireFinalAccountStatementRow["statusLabel"];
  tone: HireEndHireFinalAccountStatementRow["statusTone"];
}) {
  return (
    <span
      className={`rph-pill text-[10px] ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
          : "border-rph-border bg-rph-page text-rph-fg-secondary"
      }`}
    >
      {label}
    </span>
  );
}

type FinalAccountLedger = NonNullable<HireEndHirePageData["finalAccountLedger"]>;

export function HireEndHireFinalAccountView({
  data,
  review,
  rentCutoffLabel,
  returnedAtIso,
  driverChargeLineItems,
  extraChargeTimedPayments,
  settlementBalancePayments,
  onDepositFinalizePayloadChange,
}: {
  data: HireEndHirePageData;
  review: HireEndHireFinancialReview;
  rentCutoffLabel: string;
  returnedAtIso: string;
  driverChargeLineItems: FinalAccountLedger["driverChargeLineItems"];
  extraChargeTimedPayments: FinalAccountLedger["extraChargeTimedPayments"];
  settlementBalancePayments: FinalAccountLedger["settlementBalancePayments"];
  onDepositFinalizePayloadChange: (payload: HireDepositFinalizePayload | null) => void;
}) {
  const [tab, setTab] = useState<FinalAccountTab>("overview");
  const depositPanelRef = useRef<HTMLDivElement | null>(null);

  const depositNeedsDecision =
    !data.isEndHireFinalized && Boolean(data.depositResolution?.canResolveDeposit);

  const model: HireEndHireFinalAccountModel = useMemo(
    () =>
      buildHireEndHireFinalAccountModel({
        review,
        rentCutoffLabel,
        returnCharges: data.returnCharges,
        returnChargesDraft: data.draft.returnChargesDraft,
        depositHeldGbp: data.depositResolution?.depositHeldGbp ?? review.depositReceivedGbp,
        depositRequiredGbp: review.depositRequiredGbp,
        depositNeedsDecision,
        currentSignedSettlementGbp: data.depositResolution?.currentSignedSettlementGbp ?? data.openBalanceGbp,
        returnChargesApplied: Boolean(data.returnCharges?.returnChargesAppliedAt?.trim()),
      }),
    [data, review, rentCutoffLabel, depositNeedsDecision],
  );

  const statementRows = useMemo(
    () =>
      buildHireEndHireFinalAccountStatement({
        review,
        returnCharges: data.returnCharges,
        returnChargesDraft: data.draft.returnChargesDraft,
        returnChargesApplied: Boolean(data.returnCharges?.returnChargesAppliedAt?.trim()),
        returnedAtIso,
        driverChargeLineItems,
        extraChargeTimedPayments,
        settlementBalancePayments,
      }),
    [
      review,
      data.returnCharges,
      data.draft.returnChargesDraft,
      returnedAtIso,
      driverChargeLineItems,
      extraChargeTimedPayments,
      settlementBalancePayments,
    ],
  );

  const confirmedBalanceLabel = hireEndHireFinalAccountBalanceLabel(model.balanceBeforeDepositGbp);

  return (
    <div className="space-y-3">
      {data.isEndHireFinalized ? (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30 sm:px-5">
          <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
            Contract termination finalised
          </p>
          <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
            This hire is complete. Any open balance remains on the company Balances list until settled.
          </p>
        </div>
      ) : null}

      <div className="border-b border-rph-border">
        <div className="flex gap-6">
          <button
            type="button"
            className={tab === "overview" ? "rph-tab rph-tab-active" : "rph-tab"}
            onClick={() => setTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={tab === "statement" ? "rph-tab rph-tab-active" : "rph-tab"}
            onClick={() => setTab("statement")}
          >
            Full statement
          </button>
        </div>
      </div>

      {tab === "overview" ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <article className="rph-panel p-4 sm:p-5">
            <p className="driver-dash-section-label">Confirmed calculation</p>
            <h3 className="mt-0.5 text-base font-semibold tracking-tight text-rph-fg sm:text-lg">
              Charges, payments and held funds
            </h3>

            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                Confirmed final charges
              </p>
              <div className="mt-1.5">
                {model.chargeLines.map((line) => (
                  <FinalAccountAmountRow
                    key={line.id}
                    label={line.label}
                    amount={formatHireEndHireSignedAmount(line.amountGbp, true)}
                  />
                ))}
                <FinalAccountAmountRow
                  label="Total confirmed charges"
                  amount={formatGbp(model.totalFinalChargesGbp)}
                  emphasis
                />
              </div>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                Confirmed settlement funding
              </p>
              <div className="mt-1.5">
                <FinalAccountAmountRow
                  label="Approved driver payments"
                  amount={formatHireEndHireSignedAmount(model.driverPaymentsReceivedGbp, false)}
                />
                <FinalAccountAmountRow
                  label="Funding applied"
                  amount={formatGbp(model.driverPaymentsReceivedGbp)}
                  emphasis
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4 border-t border-rph-border pt-3">
              <span className="text-sm font-semibold text-rph-fg">Confirmed balance now</span>
              <span className="text-sm font-semibold text-amber-800 tabular-nums dark:text-amber-200">
                {confirmedBalanceLabel}
              </span>
            </div>
          </article>

          {depositNeedsDecision && model.depositHeldGbp > 0.005 ? (
            <div ref={depositPanelRef}>
              <HireEndHireDepositPositionPanel
                hireGroupId={data.hireGroupId}
                depositRequiredGbp={review.depositRequiredGbp}
                depositHeldGbp={model.depositHeldGbp}
                driverBalanceBeforeDepositGbp={model.balanceBeforeDepositGbp}
                onFinalizePayloadChange={onDepositFinalizePayloadChange}
              />
            </div>
          ) : (
            <article className="rph-panel flex h-full flex-col p-4 sm:p-5">
              <p className="driver-dash-section-label">Deposit position</p>
              <h3 className="mt-0.5 text-base font-semibold tracking-tight text-rph-fg sm:text-lg">
                Deposit on this hire
              </h3>
              <p className="mt-3 text-sm text-rph-fg-secondary">
                {data.depositResolution?.depositDisposition
                  ? "The deposit decision is already recorded for this hire."
                  : "No held deposit needs a decision on this final account."}
              </p>
              <p className="mt-2 text-sm text-rph-fg">
                Deposit received:{" "}
                <span className="font-medium tabular-nums">
                  {formatGbp(review.depositReceivedGbp)}
                </span>
              </p>
            </article>
          )}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
          <article className="rph-panel p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="driver-dash-section-label">Full statement</p>
                <h3 className="mt-0.5 text-base font-semibold tracking-tight text-rph-fg sm:text-lg">
                  Charges, payments and allocations
                </h3>
                <p className="mt-1 text-sm text-rph-fg-secondary">
                  Only posted settlement funding reduces the running driver balance.
                </p>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-rph-border text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Activity</th>
                    <th className="px-2 py-2">Type</th>
                    <th className="px-2 py-2 text-right">Amount</th>
                    <th className="px-2 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statementRows.map((row) => (
                    <tr key={row.id} className="border-b border-rph-border/70 align-top">
                      <td className="px-2 py-2.5 text-xs text-rph-fg-secondary">{row.dateLabel}</td>
                      <td className="px-2 py-2.5">
                        <p className="font-medium text-rph-fg">{row.activity}</p>
                        {row.detail ? (
                          <p className="mt-0.5 text-xs text-rph-fg-secondary">{row.detail}</p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-col items-start gap-1">
                          <StatementStatusPill label={row.statusLabel} tone={row.statusTone} />
                          <span className="text-xs text-rph-fg-secondary">{row.categoryLabel}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-rph-fg">
                        {formatHireEndHireSignedAmount(row.amountGbp, row.signed)}
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-rph-fg">
                        {formatGbp(row.balanceGbp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rph-panel h-fit p-4 sm:p-5">
            <p className="driver-dash-section-label">Reconciliation</p>
            <h3 className="mt-0.5 text-base font-semibold tracking-tight text-rph-fg sm:text-lg">
              Final balance calculation
            </h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-rph-fg-secondary">Total confirmed charges</dt>
                <dd className="font-medium tabular-nums text-rph-fg">
                  {formatHireEndHireSignedAmount(model.totalFinalChargesGbp, true)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-rph-fg-secondary">Approved driver payments</dt>
                <dd className="font-medium tabular-nums text-rph-fg">
                  {formatHireEndHireSignedAmount(model.driverPaymentsReceivedGbp, false)}
                </dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-rph-border pt-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-rph-fg">Confirmed balance now</span>
                <span className="text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-200">
                  {confirmedBalanceLabel}
                </span>
              </div>
              {depositNeedsDecision && model.depositHeldGbp > 0.005 ? (
                <p className="mt-2 text-xs text-rph-fg-secondary">
                  {formatGbp(model.depositHeldGbp)} remains unallocated until you confirm a deposit
                  decision and complete the final account.
                </p>
              ) : null}
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
