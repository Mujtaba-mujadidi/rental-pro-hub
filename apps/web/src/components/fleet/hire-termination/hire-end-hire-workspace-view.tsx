"use client";

import { useHireWorkspace } from "@/app/(main)/rental/hires/[groupId]/hire-workspace-provider";
import {
  cancelHireEndHireAction,
  confirmHireEndHireReturnAction,
  finalizeHireEndHireAction,
  loadHireEndHirePageAction,
  saveHireEndHireDraftAction,
  startHireEndHireAction,
  type HireEndHirePageData,
} from "@/app/actions/hire-end-hire";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { HireInspectionsWorkspaceClient } from "@/components/fleet/hire-inspection/hire-inspections-workspace-client";
import type { HireDepositFinalizePayload } from "@/components/fleet/hire-payments/hire-deposit-disposition-resolve-card";
import { HireEndHireFinalAccountView } from "@/components/fleet/hire-termination/hire-end-hire-final-account-view";
import { HireReturnChargesSection, type HireReturnChargesSectionHandle } from "@/components/fleet/hire-termination/hire-return-charges-section";
import {
  HirePaymentReviewModal,
  type HirePaymentReviewTarget,
} from "@/components/fleet/hire-payments/hire-payment-review-modal";
import { RphSelect } from "@/components/forms/rph-select";
import { formatUkCalendarDateTimeText, formatUkDateTime } from "@/lib/datetime/uk";
import {
  HIRE_END_HIRE_RETURN_REASON_OPTIONS,
  HIRE_END_HIRE_STEP_LABELS,
  HIRE_END_HIRE_STEPS,
  hireEndHireDefaultRentBillingMode,
  hireEndHireFurthestStep,
  hireEndHireStepNavStatus,
  hireEndHireStepNeedsFinancialReview,
  type HireEndHireStep,
} from "@/lib/fleet/hire-end-hire";
import { hireWorkspaceKeysInvalidatedByInspectionChange } from "@/lib/fleet/hire-workspace-tab-cache";
import {
  formatHireEndHireSignedAmount,
  formatHireEndHireSectionFooter,
  type HireEndHireAccountSection,
  type HireEndHireCategoryCard,
  type HireEndHireFinancialLine,
  type HireEndHireFinancialReview,
  type HireEndHirePendingApprovalItem,
} from "@/lib/fleet/hire-end-hire-financial";
import { formatGbp } from "@/lib/fleet/maintenance";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

function financialReviewPrefetchKey(input: {
  returnDateYmd: string;
  returnTimeHm: string;
  rentBillingMode?: string | null;
}): string {
  return `${input.returnDateYmd.trim()}|${(input.returnTimeHm || "00:00").trim()}|${input.rentBillingMode ?? ""}`;
}



function stepTransitionLabel(step: HireEndHireStep): string {
  switch (step) {
    case "financial_review":
      return "Loading financial review…";
    case "return_details":
      return "Loading return details…";
    case "checkin":
      return "Loading check-in…";
    case "return_charges":
      return "Loading return charges…";
    case "final_account":
      return "Loading final account…";
    default:
      return "Loading…";
  }
}

function EndHireStepTransitionOverlay({ message }: { message: string }) {
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-rph-page/95 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
        aria-hidden
      />
      <p className="text-sm font-medium text-rph-fg-secondary">{message}</p>
    </div>
  );
}

function EndHireIconCheckCircle() {
  return (
    <svg className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
}

function EndHireIconInfo() {
  return (
    <svg className="size-4 shrink-0 text-sky-600 dark:text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
      />
    </svg>
  );
}

function EndHireHireDatesRow({
  label,
  value,
  highlightedLabel,
}: {
  label: string;
  value: string;
  highlightedLabel?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-rph-border py-3.5 last:border-b-0">
      <dt className="min-w-0 text-sm text-rph-fg-secondary">
        {highlightedLabel ? (
          <span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 text-sky-950 dark:bg-sky-900/50 dark:text-sky-100">
            {label}
          </span>
        ) : (
          label
        )}
      </dt>
      <dd className="shrink-0 text-right text-sm font-semibold text-rph-fg">{value}</dd>
    </div>
  );
}

function EndHireReturnDetailsFormCard({
  returnDateYmd,
  returnTimeHm,
  reason,
  notes,
  returnAlreadyConfirmed,
  onReturnDateChange,
  onReturnTimeChange,
  onReasonChange,
  onNotesChange,
}: {
  returnDateYmd: string;
  returnTimeHm: string;
  reason: string;
  notes: string;
  returnAlreadyConfirmed: boolean;
  onReturnDateChange: (value: string) => void;
  onReturnTimeChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  return (
    <div className="rph-panel flex h-full flex-col p-5 sm:p-6">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-rph-fg-secondary">Return date</span>
            <input
              type="date"
              className="rph-input w-full"
              value={returnDateYmd}
              onChange={(e) => onReturnDateChange(e.target.value)}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-rph-fg-secondary">Return time</span>
            <input
              type="time"
              className="rph-input w-full"
              value={returnTimeHm}
              onChange={(e) => onReturnTimeChange(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-rph-fg-secondary">Reason for ending</span>
          <RphSelect
            value={reason}
            onValueChange={onReasonChange}
            placeholder="Select reason"
            options={HIRE_END_HIRE_RETURN_REASON_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-rph-fg-secondary">Internal note</span>
          <textarea
            className="rph-input min-h-[7.5rem] w-full resize-y"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Vehicle returned to company location."
          />
        </label>
      </div>

      {!returnAlreadyConfirmed ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/25 dark:text-emerald-100">
          <EndHireIconCheckCircle />
          <div className="min-w-0 text-xs leading-relaxed">
            <p className="font-semibold">Draft only</p>
            <p className="mt-1">
              The hire remains active, the vehicle remains on hire and rent continues until you confirm
              Step 2.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EndHireHireDatesCard({
  contractEffectiveFromLabel,
  signedActivatedLabel,
  proposedReturnLabel,
  contractRentStartDayMonthLabel,
}: {
  contractEffectiveFromLabel: string;
  signedActivatedLabel: string;
  proposedReturnLabel: string;
  contractRentStartDayMonthLabel: string;
}) {
  return (
    <aside className="rph-panel flex h-full flex-col p-5 sm:p-6">
      <p className="driver-dash-section-label">Hire dates</p>
      <dl className="mt-4">
        <EndHireHireDatesRow label="Contract effective from" value={contractEffectiveFromLabel} />
        <EndHireHireDatesRow label="Signed / activated" value={signedActivatedLabel} />
        <EndHireHireDatesRow label="Proposed return" value={proposedReturnLabel} />
        <EndHireHireDatesRow
          label="Proposed rent cut-off"
          value={proposedReturnLabel}
          highlightedLabel
        />
      </dl>
      <div className="mt-auto flex items-start gap-2.5 rounded-lg bg-sky-50 px-3.5 py-3 text-xs leading-relaxed text-sky-950 dark:bg-sky-950/30 dark:text-sky-100">
        <EndHireIconInfo />
        <p>
          <span className="font-semibold">Contract start controls rent.</span> The hire duration and rent
          calculation both use {contractRentStartDayMonthLabel}, not the later signature date.
        </p>
      </div>
    </aside>
  );
}

function formatRentCutoffLabel(dateYmd: string, timeHm: string): string {
  if (!dateYmd) return "—";
  return formatUkCalendarDateTimeText(dateYmd, timeHm || "00:00").replace(/\s+\d{4},/, ",");
}

function preCheckinStatusBadge(review: HireEndHireFinancialReview): string {
  if (review.positionDirection === "settled") return "Clear before check-in";
  if (review.positionDirection === "company_owes_driver") return "Credit to driver";
  return "Balance remains open";
}

function depositPositionBadge(review: HireEndHireFinancialReview): string {
  if (review.depositRequiredGbp <= 0.005) return "No deposit";
  if (review.depositReceivedGbp >= review.depositRequiredGbp - 0.005) return "Fully paid";
  if (review.depositReceivedGbp > 0.005) return "Part-paid";
  return "Unpaid";
}

function EndHireIconAlert() {
  return (
    <svg
      className="size-5 shrink-0 text-red-600 dark:text-red-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        d="M12 9v3.75m0 3.75h.008M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78a1.5 1.5 0 0 0 1.29-2.25L13.71 3.86a1.5 1.5 0 0 0-2.58 0Z"
      />
    </svg>
  );
}

function EndHireFinancialStatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
      {label}
    </span>
  );
}

function EndHireFinancialKpiCard({
  label,
  value,
  hint,
  highlighted,
}: {
  label: string;
  value: string;
  hint: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={
        highlighted
          ? "rph-panel border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/25"
          : "rph-panel p-4"
      }
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-rph-fg">{value}</p>
      <p className="mt-1 text-xs text-rph-fg-secondary">{hint}</p>
    </div>
  );
}

function EndHireFinancialLedgerRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-rph-border py-3 last:border-b-0">
      <dt className="min-w-0 text-sm text-rph-fg-secondary">{label}</dt>
      <dd className="shrink-0 text-sm font-semibold tabular-nums text-rph-fg">{amount}</dd>
    </div>
  );
}

function EndHireConfirmedAccountChargesCard({
  review,
  rentCutoffLabel,
}: {
  review: HireEndHireFinancialReview;
  rentCutoffLabel: string;
}) {
  const approvedPaymentsGbp = review.rentReceivedGbp + review.extraChargesReceivedGbp;

  return (
    <article className="rph-panel flex h-full flex-col p-5 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="driver-dash-section-label">Confirmed account charges</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-rph-fg">{review.positionLabel}</h3>
        </div>
        <EndHireFinancialStatusBadge label={preCheckinStatusBadge(review)} />
      </header>
      <dl className="mt-4 flex-1">
        <EndHireFinancialLedgerRow
          label={`Rent charged through ${rentCutoffLabel}`}
          amount={formatHireEndHireSignedAmount(review.rentChargedGbp, true)}
        />
        <EndHireFinancialLedgerRow
          label="Posted extra charges"
          amount={formatHireEndHireSignedAmount(review.extraChargesPostedGbp, true)}
        />
        <EndHireFinancialLedgerRow
          label="Approved driver payments"
          amount={formatHireEndHireSignedAmount(approvedPaymentsGbp, false)}
        />
      </dl>
      <div className="mt-2 flex items-center justify-between gap-4 border-t border-rph-border pt-3">
        <span className="text-sm font-semibold text-rph-fg">Confirmed charge balance</span>
        <span className="text-sm font-semibold tabular-nums text-rph-fg">
          {formatGbp(review.owedBeforeCheckinGbp)}
        </span>
      </div>
    </article>
  );
}

function EndHireDepositPositionCard({ review }: { review: HireEndHireFinancialReview }) {
  const stillToReceiveGbp = Math.max(0, review.depositRequiredGbp - review.depositReceivedGbp);
  const heldTitle =
    review.depositReceivedGbp > 0.005
      ? `${formatGbp(review.depositReceivedGbp)} held`
      : "No deposit held";

  let notice: string | null = null;
  if (stillToReceiveGbp > 0.005 && review.depositReceivedGbp > 0.005) {
    notice = `The unpaid ${formatGbp(stillToReceiveGbp)} is not money held and cannot be allocated or refunded.`;
  } else if (review.depositUnpaid) {
    notice = `The ${formatGbp(review.depositRequiredGbp)} contractual deposit was not paid. It cannot be applied to rent, used for damage or refunded, and is not included in the pre-check-in balance above.`;
  }

  return (
    <aside className="rph-panel flex h-full flex-col p-5 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="driver-dash-section-label">Deposit position</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-rph-fg">{heldTitle}</h3>
        </div>
        <EndHireFinancialStatusBadge label={depositPositionBadge(review)} />
      </header>
      <dl className="mt-4 flex-1">
        <EndHireFinancialLedgerRow
          label="Required by contract"
          amount={formatGbp(review.depositRequiredGbp)}
        />
        <EndHireFinancialLedgerRow
          label="Actually received"
          amount={formatGbp(review.depositReceivedGbp)}
        />
        <EndHireFinancialLedgerRow
          label="Still to receive"
          amount={formatGbp(stillToReceiveGbp)}
        />
        <EndHireFinancialLedgerRow
          label="Available at final account"
          amount={formatGbp(review.depositReceivedGbp)}
        />
      </dl>
      {notice ? (
        <div className="mt-4 rounded-lg bg-rph-page px-3.5 py-3 text-xs leading-relaxed text-rph-fg-secondary">
          {notice}
        </div>
      ) : null}
    </aside>
  );
}

function EndHireContractEndWarningBanner({ returnStopLabel }: { returnStopLabel: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3.5 dark:border-red-900/50 dark:bg-red-950/30">
      <EndHireIconAlert />
      <p className="text-sm leading-relaxed text-red-950 dark:text-red-100">
        <span className="font-semibold">The next action ends the contract.</span> It stops rent at{" "}
        {returnStopLabel}, moves the vehicle to{" "}
        <span className="font-semibold">Return pending</span> and starts the real check-in. It does not
        settle the account or make the vehicle available.
      </p>
    </div>
  );
}

function EndHireFinancialReviewStepContent({
  review,
  rentCutoffLabel,
  returnStopLabel,
  canApprovePayments,
  onReviewPayment,
}: {
  review: HireEndHireFinancialReview;
  rentCutoffLabel: string;
  returnStopLabel: string;
  canApprovePayments: boolean;
  onReviewPayment: (item: HireEndHirePendingApprovalItem) => void;
}) {
  const rentCategory = review.categories.find((category) => category.id === "rent");
  const extraCategory = review.categories.find((category) => category.id === "extra_charges");

  return (
    <div className="space-y-4">
      {review.pendingApprovalTotalGbp > 0.005 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/90 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            {formatGbp(review.pendingApprovalTotalGbp)} awaiting company approval
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            These driver submissions are not counted as received until approved.
          </p>
          <ul className="mt-3 space-y-2">
            {review.pendingApprovalItems.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-lg border border-amber-200/80 bg-white/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/40 dark:bg-amber-950/20"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-amber-950 dark:text-amber-100">{item.label}</p>
                  <p className="text-xs text-amber-900 dark:text-amber-200">
                    Driver submitted {formatGbp(item.submittedGbp)} — awaiting approval
                  </p>
                </div>
                {canApprovePayments ? (
                  <button
                    type="button"
                    className="rph-btn-primary h-9 w-full shrink-0 px-3 text-sm sm:w-auto"
                    onClick={() => onReviewPayment(item)}
                  >
                    Review payment
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EndHireFinancialKpiCard
          label="Rent balance"
          value={formatGbp(rentCategory?.balanceGbp ?? 0)}
          hint={`${formatGbp(rentCategory?.chargedGbp ?? 0)} charged · ${formatGbp(rentCategory?.receivedGbp ?? 0)} received`}
        />
        <EndHireFinancialKpiCard
          label="Extra-charge balance"
          value={formatGbp(extraCategory?.balanceGbp ?? 0)}
          hint={`${formatGbp(extraCategory?.chargedGbp ?? 0)} posted · ${formatGbp(extraCategory?.receivedGbp ?? 0)} received`}
        />
        <EndHireFinancialKpiCard
          label="Deposit required"
          value={formatGbp(review.depositRequiredGbp)}
          hint="Contract amount"
          highlighted
        />
        <EndHireFinancialKpiCard
          label="Deposit received"
          value={formatGbp(review.depositReceivedGbp)}
          hint="Held funds — not revenue"
        />
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(16rem,1fr)]">
        <EndHireConfirmedAccountChargesCard review={review} rentCutoffLabel={rentCutoffLabel} />
        <EndHireDepositPositionCard review={review} />
      </div>

      <EndHireContractEndWarningBanner returnStopLabel={returnStopLabel} />
    </div>
  );
}

function EndHireStepFooter({
  backLabel,
  onBack,
  backDisabled,
  stepLabel,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  pending,
}: {
  backLabel: string;
  onBack: () => void;
  backDisabled?: boolean;
  stepLabel: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  pending: boolean;
}) {
  return (
    <footer className="rph-modal-footer border-t border-rph-border px-4 py-3 sm:px-5">
      <button
        type="button"
        className="rph-btn-ghost h-10 w-full px-4 sm:w-auto"
        disabled={pending || backDisabled}
        onClick={onBack}
      >
        {backLabel}
      </button>
      <div className="rph-modal-footer-end">
        <span className="flex min-h-10 items-center text-center text-xs text-rph-fg-muted sm:text-left">
          {stepLabel}
        </span>
        <button
          type="button"
          className="rph-btn-primary h-10 w-full px-4 sm:w-auto"
          disabled={pending || primaryDisabled}
          onClick={onPrimary}
        >
          {primaryLabel}
        </button>
      </div>
    </footer>
  );
}

function pendingReviewTarget(
  item: HireEndHirePendingApprovalItem,
  data: HireEndHirePageData,
): HirePaymentReviewTarget | null {
  if (item.kind === "extra_charges") {
    if (!data.extraChargePendingPayment) return null;
    return {
      kind: "extra_charges",
      hireGroupId: data.hireGroupId,
      amountGbp: item.submittedGbp,
      paymentReference: item.paymentReference ?? data.extraChargePendingPayment.paymentReference,
      outstandingGbp: data.extraChargesOutstandingGbp,
      chargedGbp: data.financialReview?.extraChargesPostedGbp,
      paidGbp: data.financialReview?.extraChargesReceivedGbp,
      balanceGbp: data.extraChargesOutstandingGbp,
      title: "Extra charges",
      allocations: data.extraChargePendingPayment.allocations?.map((line) => ({
        rowId: line.chargeLineItemId,
        label: line.label ?? "Extra charge",
        allocatedGbp: line.amountGbp,
        rowBalanceAfterGbp: 0,
        fullyAllocated: false,
      })),
    };
  }
  const row = data.pendingScheduleRows.find((scheduleRow) => scheduleRow.id === item.scheduleRowId);
  if (!row) return null;
  return { kind: "schedule", row };
}

export function HireEndHireWorkspaceView({ hireGroupId }: { hireGroupId: string }) {
  const { shell, invalidateCache, readCache, writeCache } = useHireWorkspace();
  const router = useRouter();
  const [data, setData] = useState<HireEndHirePageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedLabel, setSavedLabel] = useState("Not saved yet");
  const [pending, startTransition] = useTransition();
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [depositFinalizePayload, setDepositFinalizePayload] =
    useState<HireDepositFinalizePayload | null>(null);
  const returnChargesRef = useRef<HireReturnChargesSectionHandle>(null);
  const [returnChargesCanContinue, setReturnChargesCanContinue] = useState(true);
  const [paymentReviewTarget, setPaymentReviewTarget] = useState<HirePaymentReviewTarget | null>(null);

  const [returnDateYmd, setReturnDateYmd] = useState("");
  const [returnTimeHm, setReturnTimeHm] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const financialReviewKeyRef = useRef<string | null>(null);
  const prefetchInFlightRef = useRef<string | null>(null);
  const waitingForCheckinReadyRef = useRef(false);

  function invalidateEndHireWorkspaceCaches() {
    invalidateCache(hireWorkspaceKeysInvalidatedByInspectionChange());
  }

  function applyPageData(page: HireEndHirePageData, options?: { financialReviewKey?: string | null }) {
    setData(page);
    setReturnDateYmd(page.draft.returnDateYmd);
    setReturnTimeHm(page.draft.returnTimeHm);
    setReason(page.draft.reason);
    setNotes(page.draft.notes);
    if (page.draft.updatedAt) {
      setSavedLabel(`Saved ${formatUkDateTime(page.draft.updatedAt)}`);
    }
    if (options?.financialReviewKey !== undefined) {
      financialReviewKeyRef.current = options.financialReviewKey;
    } else if (page.financialReview) {
      financialReviewKeyRef.current = financialReviewPrefetchKey({
        returnDateYmd: page.draft.returnDateYmd,
        returnTimeHm: page.draft.returnTimeHm,
        rentBillingMode: page.draft.rentBillingMode,
      });
    }
  }

  /** Show the step overlay immediately — must not run inside startTransition (low-priority paint). */
  function beginStepTransition(message: string, nextStep?: HireEndHireStep) {
    setTransitionMessage(message);
    if (nextStep) {
      setData((prev) =>
        prev ? { ...prev, draft: { ...prev.draft, step: nextStep } } : prev,
      );
    }
  }

  const clearStepTransition = useCallback(() => {
    waitingForCheckinReadyRef.current = false;
    setTransitionMessage(null);
  }, []);

  const onCheckinContentReady = useCallback(() => {
    if (!waitingForCheckinReadyRef.current) return;
    waitingForCheckinReadyRef.current = false;
    setTransitionMessage(null);
  }, []);

  const stepBusy = Boolean(transitionMessage) || pending;

  function hasFreshFinancialReview(forStep: HireEndHireStep): boolean {
    if (!data?.financialReview) return false;
    if (forStep !== "financial_review" && forStep !== "final_account") return false;
    const key = financialReviewPrefetchKey({
      returnDateYmd,
      returnTimeHm,
      rentBillingMode: data.draft.rentBillingMode,
    });
    return financialReviewKeyRef.current === key;
  }

  async function refreshPageData(
    message: string,
    options?: {
      refreshShell?: boolean;
      includeFinancialReview?: boolean;
      skipSideEffects?: boolean;
    },
  ) {
    setTransitionMessage(message);
    try {
      if (options?.refreshShell) router.refresh();
      const includeFinancialReview =
        options?.includeFinancialReview ??
        (data?.draft.step != null && hireEndHireStepNeedsFinancialReview(data.draft.step));
      const res = await loadHireEndHirePageAction(hireGroupId, {
        includeFinancialReview,
        skipSideEffects: options?.skipSideEffects ?? !options?.refreshShell,
      });
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setError(null);
      applyPageData(res.data, {
        financialReviewKey: includeFinancialReview
          ? financialReviewPrefetchKey({
              returnDateYmd: res.data.draft.returnDateYmd,
              returnTimeHm: res.data.draft.returnTimeHm,
              rentBillingMode: res.data.draft.rentBillingMode,
            })
          : financialReviewKeyRef.current,
      });
      if (res.data.repairedAutoComplete) router.refresh();
      return true;
    } finally {
      setTransitionMessage(null);
    }
  }

  useEffect(() => {
    startTransition(async () => {
      setTransitionMessage("Loading end hire…");
      try {
        const res = await loadHireEndHirePageAction(hireGroupId);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setError(null);
        applyPageData(res.data);
        if (res.data.repairedAutoComplete) router.refresh();
      } finally {
        setTransitionMessage(null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hireGroupId]);

  const step = data?.draft.step ?? "return_details";
  const furthestStep = data
    ? hireEndHireFurthestStep(data.draft, {
        status: data.status,
        checkinCompleted: data.checkinCompleted,
      })
    : "return_details";
  const started = data?.draft.started === true;

  // Prefetch financial review while staff are still on Step 1.
  useEffect(() => {
    if (!started || !data || step !== "return_details") return;
    if (!returnDateYmd.trim() || !returnTimeHm.trim() || !reason.trim()) return;
    if (transitionMessage) return;

    const key = financialReviewPrefetchKey({
      returnDateYmd,
      returnTimeHm,
      rentBillingMode: data.draft.rentBillingMode,
    });
    if (financialReviewKeyRef.current === key && data.financialReview) return;
    if (prefetchInFlightRef.current === key) return;

    const timer = window.setTimeout(() => {
      prefetchInFlightRef.current = key;
      void (async () => {
        try {
          const saveRes = await saveHireEndHireDraftAction({
            hireGroupId,
            step: "return_details",
            returnDateYmd,
            returnTimeHm,
            reason,
            notes,
            rentBillingMode: data.draft.rentBillingMode,
          });
          if (!saveRes.ok) return;
          const loadRes = await loadHireEndHirePageAction(hireGroupId, {
            includeFinancialReview: true,
            skipSideEffects: true,
          });
          if (!loadRes.ok) return;
          // Stay on Step 1 — only merge the expensive financial payload.
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  draft: { ...saveRes.draft, step: prev.draft.step },
                  financialReview: loadRes.data.financialReview,
                  pendingApprovalItems: loadRes.data.pendingApprovalItems,
                  pendingScheduleRows: loadRes.data.pendingScheduleRows,
                  extraChargePendingPayment: loadRes.data.extraChargePendingPayment,
                  extraChargesOutstandingGbp: loadRes.data.extraChargesOutstandingGbp,
                  canApprovePayments: loadRes.data.canApprovePayments,
                  depositResolution: loadRes.data.depositResolution,
                  finalAccountLedger: loadRes.data.finalAccountLedger,
                }
              : prev,
          );
          financialReviewKeyRef.current = key;
          setSavedLabel("Saved just now");
        } finally {
          if (prefetchInFlightRef.current === key) prefetchInFlightRef.current = null;
        }
      })();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    started,
    data,
    step,
    returnDateYmd,
    returnTimeHm,
    reason,
    notes,
    hireGroupId,
    transitionMessage,
  ]);

  // Warm the inspections workspace cache while staff are on financial review / check-in.
  useEffect(() => {
    if (!started || !data) return;
    if (step !== "financial_review" && step !== "checkin") return;
    if (readCache("inspections") !== undefined) return;

    let cancelled = false;
    void (async () => {
      const { loadHireInspectionAction, loadHireInspectionTrackerOdometerAction } = await import(
        "@/app/actions/hire-inspections"
      );
      const [checkoutRes, checkinRes, trackerRes] = await Promise.all([
        loadHireInspectionAction(hireGroupId, "checkout"),
        loadHireInspectionAction(hireGroupId, "checkin"),
        loadHireInspectionTrackerOdometerAction({
          hireGroupId,
          vehicleId: shell.vehicleId,
        }),
      ]);
      if (cancelled || !checkoutRes.ok) return;
      const tracker =
        trackerRes.ok && trackerRes.linked
          ? {
              linked: true as const,
              odometerMiles: trackerRes.odometerMiles,
              liveUnavailable: trackerRes.liveUnavailable,
            }
          : { linked: false as const };
      writeCache("inspections", {
        checkout: checkoutRes.data,
        checkin: checkinRes.ok ? checkinRes.data : null,
        tracker,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [started, data, step, hireGroupId, shell.vehicleId, readCache, writeCache]);

  const proposedReturnLabel = useMemo(() => {
    if (!returnDateYmd) return "—";
    return formatUkCalendarDateTimeText(returnDateYmd, returnTimeHm || "00:00");
  }, [returnDateYmd, returnTimeHm]);

  function saveDraft(nextStep?: HireEndHireStep) {
    const message = nextStep ? stepTransitionLabel(nextStep) : "Saving…";
    const previousStep = data?.draft.step ?? "return_details";
    // Set before optimistic step change so a warm cache can clear the overlay during save.
    if (nextStep === "checkin") {
      waitingForCheckinReadyRef.current = true;
    }
    beginStepTransition(message, nextStep);

    void (async () => {
      const currentStep = previousStep;
      const res = await saveHireEndHireDraftAction({
        hireGroupId,
        step: nextStep,
        returnDateYmd,
        returnTimeHm,
        reason,
        notes,
        rentBillingMode: data?.draft.rentBillingMode,
      });
      if (!res.ok) {
        setError(res.error);
        setData((prev) =>
          prev ? { ...prev, draft: { ...prev.draft, step: previousStep } } : prev,
        );
        clearStepTransition();
        return;
      }
      setSavedLabel("Saved just now");

      const targetStep = nextStep ?? res.draft.step;
      const needsFinancialReview = hireEndHireStepNeedsFinancialReview(targetStep);
      const canUseCachedFinancialReview =
        needsFinancialReview &&
        hasFreshFinancialReview(targetStep) &&
        (targetStep === "financial_review" ||
          (targetStep === "checkin" && currentStep === "financial_review"));

      setData((prev) =>
        prev
          ? {
              ...prev,
              draft: res.draft,
              financialReview:
                targetStep === "return_details"
                  ? null
                  : canUseCachedFinancialReview || (needsFinancialReview && prev.financialReview)
                    ? prev.financialReview
                    : needsFinancialReview
                      ? prev.financialReview
                      : targetStep === "checkin"
                        ? prev.financialReview
                        : null,
            }
          : prev,
      );

      if (targetStep === "checkin") {
        waitingForCheckinReadyRef.current = true;
        // onContentReady may already have fired while save was in flight (warm cache).
        if (readCache("inspections") !== undefined) {
          clearStepTransition();
        }
        return;
      }

      if (targetStep === "return_details" || canUseCachedFinancialReview) {
        clearStepTransition();
        return;
      }
      if (targetStep === "return_charges") {
        await refreshPageData(message, { includeFinancialReview: true });
        return;
      }
      if (nextStep) {
        await refreshPageData(message, { includeFinancialReview: needsFinancialReview });
        return;
      }
      clearStepTransition();
    })();
  }

  function continueToFinalAccount() {
    setTransitionMessage("Saving return charges…");
    void (async () => {
      setError(null);
      const saveRes = await returnChargesRef.current?.saveDraft();
      if (saveRes && !saveRes.ok) {
        setError(saveRes.error);
        setTransitionMessage(null);
        return;
      }

      beginStepTransition("Loading final account…", "final_account");
      const res = await saveHireEndHireDraftAction({
        hireGroupId,
        step: "final_account",
        returnDateYmd,
        returnTimeHm,
        reason,
        notes,
        rentBillingMode: data?.draft.rentBillingMode,
      });
      if (!res.ok) {
        setError(res.error);
        setData((prev) =>
          prev ? { ...prev, draft: { ...prev.draft, step: "return_charges" } } : prev,
        );
        setTransitionMessage(null);
        return;
      }
      setSavedLabel("Saved just now");
      setData((prev) => (prev ? { ...prev, draft: res.draft } : prev));
      await refreshPageData("Loading final account…", { includeFinancialReview: true });
    })();
  }

  async function advanceToReturnChargesAfterCheckin() {
    beginStepTransition("Loading return charges…", "return_charges");
    const res = await saveHireEndHireDraftAction({
      hireGroupId,
      step: "return_charges",
      returnDateYmd,
      returnTimeHm,
      reason,
      notes,
      rentBillingMode: data?.draft.rentBillingMode,
    });
    if (!res.ok) {
      setError(res.error);
      setData((prev) =>
        prev ? { ...prev, draft: { ...prev.draft, step: "checkin" } } : prev,
      );
      setTransitionMessage(null);
      return;
    }
    setSavedLabel("Saved just now");
    router.refresh();
    await refreshPageData("Loading return charges…", {
      includeFinancialReview: true,
      refreshShell: true,
    });
  }

  function onConfirmStart() {
    setStartConfirmOpen(false);
    setTransitionMessage("Starting contract termination…");
    financialReviewKeyRef.current = null;
    startTransition(async () => {
      const res = await startHireEndHireAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setTransitionMessage(null);
        return;
      }
      setSavedLabel("Saved just now");
      invalidateEndHireWorkspaceCaches();
      await refreshPageData("Opening end hire…", { refreshShell: true });
    });
  }

  function onConfirmCancel() {
    setCancelConfirmOpen(false);
    setTransitionMessage("Cancelling end hire…");
    financialReviewKeyRef.current = null;
    startTransition(async () => {
      const res = await cancelHireEndHireAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setTransitionMessage(null);
        return;
      }
      invalidateEndHireWorkspaceCaches();
      await refreshPageData("Restoring active hire…", { refreshShell: true });
    });
  }

  function onSaveAndExit() {
    startTransition(async () => {
      const res = await saveHireEndHireDraftAction({
        hireGroupId,
        returnDateYmd,
        returnTimeHm,
        reason,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/rental/hires/${hireGroupId}`);
    });
  }

  function onConfirmReturn() {
    beginStepTransition("Confirming return and preparing check-in…", "checkin");
    waitingForCheckinReadyRef.current = true;
    void (async () => {
      const res = await confirmHireEndHireReturnAction({
        hireGroupId,
        returnDateYmd,
        returnTimeHm,
        reason,
        notes,
        rentBillingMode: data?.draft.rentBillingMode ?? hireEndHireDefaultRentBillingMode(),
      });
      if (!res.ok) {
        setError(res.error);
        setData((prev) =>
          prev ? { ...prev, draft: { ...prev.draft, step: "financial_review" } } : prev,
        );
        clearStepTransition();
        return;
      }
      setSavedLabel("Saved just now");
      setData((prev) =>
        prev
          ? {
              ...prev,
              status: "terminated",
              draft: res.draft,
              canConfirmReturn: false,
            }
          : prev,
      );
      // Overlay stays until check-in content reports ready (or cache is already warm).
      if (readCache("inspections") !== undefined) {
        clearStepTransition();
      }
      void router.refresh();
    })();
  }

  function onConfirmFinalize() {
    setFinalizeConfirmOpen(false);
    setTransitionMessage("Finalising contract termination…");
    startTransition(async () => {
      const res = await finalizeHireEndHireAction(hireGroupId, depositFinalizePayload ?? undefined);
      if (!res.ok) {
        setError(res.error);
        setTransitionMessage(null);
        return;
      }
      setDepositFinalizePayload(null);
      await refreshPageData("Updating final account…", { refreshShell: true });
    });
  }

  if (!data && !error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
        <span
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
          aria-hidden
        />
        <p className="rph-muted text-sm">Loading end hire…</p>
      </div>
    );
  }
  if (error && !data) {
    return <p className="rph-alert-error text-sm">{error}</p>;
  }
  if (!data) return null;

  const needsDepositOnConfirm =
    !data.isEndHireFinalized && Boolean(data.depositResolution?.canResolveDeposit);
  const finalizeBlockedByDeposit = needsDepositOnConfirm && !depositFinalizePayload;

  const showStepTransition = Boolean(transitionMessage);

  if (!started) {
    return (
      <>
        <div className="relative flex min-h-[28rem] flex-col items-center justify-center gap-4 rounded-2xl border border-rph-border bg-rph-raised px-6 py-16 text-center shadow-sm">
          {showStepTransition && transitionMessage ? (
            <EndHireStepTransitionOverlay message={transitionMessage} />
          ) : null}
          <p className="driver-dash-section-label">Close-out</p>
          <h1 className="text-2xl font-semibold text-rph-fg">End hire</h1>
          <p className="max-w-md text-sm text-rph-fg-secondary">
            Start contract termination to record the return, review the account, complete check-in, then
            settle the final balance.
          </p>
          {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
            disabled={stepBusy || !data.canConfirmReturn}
            onClick={() => setStartConfirmOpen(true)}
          >
            Start contract termination
          </button>
          {!data.canConfirmReturn ? (
            <p className="text-xs text-rph-fg-muted">
              This hire is no longer active. Open End hire again after return was confirmed, or continue
              from check-in.
            </p>
          ) : null}
        </div>
        <ConfirmDialog
          open={startConfirmOpen}
          title="Start ending this contract?"
          description="This marks the hire as Ending hire and starts the close-out wizard. Rent keeps accruing until you confirm the return on the financial review step. You can cancel the process before that confirmation."
          confirmLabel="Start ending contract"
          cancelLabel="Keep hire active"
          variant="danger"
          pending={false}
          onConfirm={onConfirmStart}
          onCancel={() => setStartConfirmOpen(false)}
        />
      </>
    );
  }

  const review = data.financialReview;
  const returnAlreadyConfirmed = data.status === "terminated" || data.status === "completed";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-rph-fg">
            {step === "final_account" ? "Final account" : "End hire"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-rph-fg-secondary">
            {step === "final_account"
              ? data.isEndHireFinalized
                ? "Contract termination is finalised. Review the final account or record any remaining payments."
                : "Review the final account, record payments if needed, then finalise contract termination when ready."
              : "Complete each stage in order. Progress is saved to the company account so another authorised device can continue."}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-right">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <span aria-hidden>✓</span>
            {savedLabel}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 font-semibold text-sky-900 transition-colors hover:bg-sky-100 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100 dark:hover:bg-sky-950/70"
              disabled={stepBusy}
              onClick={onSaveAndExit}
            >
              Save and exit
            </button>
            {data.canCancelEndHire ? (
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-lg border border-red-200 bg-red-50 px-3 font-semibold text-red-800 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                disabled={stepBusy}
                onClick={() => setCancelConfirmOpen(true)}
              >
                Cancel end hire
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="grid gap-2 rounded-2xl border border-rph-border bg-rph-raised p-3 sm:grid-cols-5" aria-label="End hire stages">
        {HIRE_END_HIRE_STEPS.map((item, index) => {
          const status = hireEndHireStepNavStatus(step, furthestStep, item);
          const canNavigate = status === "done" && !stepBusy;
          const cardClass = `rounded-xl border px-3 py-2.5 transition-all duration-200 ease-out ${
            canNavigate ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""
          } ${
            status === "active"
              ? "border-blue-500 bg-blue-50 dark:border-sky-500 dark:bg-sky-950/40"
              : status === "done"
                ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20"
                : "border-rph-border bg-rph-page/40"
          }`;

          const cardBody = (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                {status === "done" ? "✓" : index + 1} · {HIRE_END_HIRE_STEP_LABELS[item]}
              </p>
              <p
                className={`mt-0.5 text-xs ${
                  canNavigate ? "text-rph-link" : "text-rph-fg-secondary"
                }`}
              >
                {status === "locked"
                  ? "Complete previous step"
                  : status === "active"
                    ? "Current"
                    : "Complete"}
              </p>
            </>
          );

          return canNavigate ? (
            <button
              key={item}
              type="button"
              className={`w-full text-left ${cardClass}`}
              onClick={() => saveDraft(item)}
            >
              {cardBody}
            </button>
          ) : (
            <div key={item} className={cardClass}>
              {cardBody}
            </div>
          );
        })}
      </nav>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <div className="relative min-h-[28rem] space-y-4">
        {showStepTransition && transitionMessage ? (
          <EndHireStepTransitionOverlay message={transitionMessage} />
        ) : null}

        <div
          className={`space-y-4 ${showStepTransition ? "pointer-events-none invisible" : ""}`}
          aria-hidden={showStepTransition}
        >
      {step === "return_details" ? (
        <section className="overflow-hidden rounded-2xl border border-rph-border bg-rph-raised shadow-sm">
          <div className="border-b border-rph-border px-5 py-5 sm:px-6">
            <p className="driver-dash-section-label">Step 1</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-rph-fg sm:text-[1.375rem]">
              When was the vehicle returned?
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-rph-fg-secondary">
              This is a proposed return time until Step 2 is confirmed. Saving or leaving this page does
              not stop rent.
            </p>
            {returnAlreadyConfirmed ? (
              <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
                Return was already confirmed. You can review these details here; changing them does not
                alter the recorded contract end.
              </p>
            ) : null}
          </div>

          <div className="bg-rph-page p-4 sm:p-5">
            <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(16rem,1fr)]">
              <EndHireReturnDetailsFormCard
                returnDateYmd={returnDateYmd}
                returnTimeHm={returnTimeHm}
                reason={reason}
                notes={notes}
                returnAlreadyConfirmed={returnAlreadyConfirmed}
                onReturnDateChange={setReturnDateYmd}
                onReturnTimeChange={setReturnTimeHm}
                onReasonChange={setReason}
                onNotesChange={setNotes}
              />
              <EndHireHireDatesCard
                contractEffectiveFromLabel={data.contractEffectiveFromLabel}
                signedActivatedLabel={data.signedActivatedLabel}
                proposedReturnLabel={proposedReturnLabel}
                contractRentStartDayMonthLabel={data.contractRentStartDayMonthLabel}
              />
            </div>
          </div>

          <EndHireStepFooter
            backLabel="Save and exit"
            onBack={onSaveAndExit}
            stepLabel="Step 1 of 5"
            primaryLabel="Review financial position"
            onPrimary={() => saveDraft("financial_review")}
            primaryDisabled={!returnDateYmd || !returnTimeHm || !reason}
            pending={stepBusy}
          />
        </section>
      ) : null}

      {step === "financial_review" ? (
        <section className="overflow-hidden rounded-2xl border border-rph-border bg-rph-raised shadow-sm">
          <div className="border-b border-rph-border px-5 py-5 sm:px-6">
            <p className="driver-dash-section-label">Step 2</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-rph-fg sm:text-[1.375rem]">
              Review the position before check-in
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-rph-fg-secondary">
              Confirm the rent cut-off and actual money received. New return charges are added only
              after the inspection.
            </p>
          </div>
          {review ? (
            <div className="bg-rph-page p-4 sm:p-5">
              <EndHireFinancialReviewStepContent
                review={review}
                rentCutoffLabel={formatRentCutoffLabel(returnDateYmd, returnTimeHm)}
                returnStopLabel={proposedReturnLabel}
                canApprovePayments={data.canApprovePayments}
                onReviewPayment={(item) => {
                  const target = pendingReviewTarget(item, data);
                  if (target) setPaymentReviewTarget(target);
                }}
              />
            </div>
          ) : (
            <p className="bg-rph-page p-5 text-sm text-rph-fg-secondary">
              Could not load the financial review.
            </p>
          )}
          <EndHireStepFooter
            backLabel="Back"
            onBack={() => saveDraft("return_details")}
            stepLabel="Step 2 of 5"
            primaryLabel={
              returnAlreadyConfirmed
                ? "Continue to check-in"
                : "Confirm return, stop rent & start check-in"
            }
            onPrimary={returnAlreadyConfirmed ? () => saveDraft("checkin") : onConfirmReturn}
            primaryDisabled={returnAlreadyConfirmed ? false : !data.canConfirmReturn}
            pending={stepBusy}
          />
        </section>
      ) : null}

      {step === "checkin" ? (
        <section className="overflow-hidden rounded-2xl border border-rph-border bg-rph-raised shadow-sm">
          <div className="border-b border-rph-border px-4 py-4 sm:px-5">
            <p className="driver-dash-section-label">Step 3</p>
            <h2 className="mt-1 text-lg font-semibold text-rph-fg">Vehicle check-in</h2>
            <p className="mt-1 text-sm text-rph-fg-secondary">
              Record the return inspection. When check-in is complete, continue to return charges, then
              review the final account.
            </p>
          </div>
          <div className="p-4 sm:p-5">
            <HireInspectionsWorkspaceClient
              hireGroupId={hireGroupId}
              hireStatus={data.status}
              vehicleLabel={`${shell.vehicleVrm} · ${shell.vehicleLabel}`}
              vehicleId={shell.vehicleId}
              focusKind="checkin"
              audience="staff"
              embedded
              onCheckinComplete={advanceToReturnChargesAfterCheckin}
              onContentReady={onCheckinContentReady}
            />
          </div>
          <EndHireStepFooter
            backLabel="Back to financial review"
            onBack={() => saveDraft("financial_review")}
            stepLabel="Step 3 of 5"
            primaryLabel={
              data.checkinCompleted ? "Continue to return charges" : "Complete check-in above"
            }
            onPrimary={() => saveDraft("return_charges")}
            primaryDisabled={!data.checkinCompleted}
            pending={stepBusy}
          />
        </section>
      ) : null}

      {step === "return_charges" ? (
        <section className="overflow-hidden rounded-2xl border border-rph-border bg-rph-raised shadow-sm">
          <div className="border-b border-rph-border px-5 py-5 sm:px-6">
            <p className="driver-dash-section-label">Step 4</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-rph-fg sm:text-[1.375rem]">
              Decide what should be charged
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-rph-fg-secondary">
              Review inspection findings and choose what should be added to the final account.
            </p>
          </div>
          <div className="bg-rph-page p-4 sm:p-5">
            {data.returnCharges ? (
              <HireReturnChargesSection
                ref={returnChargesRef}
                hireGroupId={hireGroupId}
                data={data.returnCharges}
                readOnly={data.isEndHireFinalized}
                embedded
                depositHeldGbp={
                  data.depositResolution?.depositHeldGbp ??
                  data.financialReview?.depositReceivedGbp ??
                  0
                }
                inspectionEvidenceHref={`/rental/hires/${hireGroupId}/checkin`}
                onContinueReadyChange={setReturnChargesCanContinue}
                onSaved={() => {
                  void refreshPageData("Refreshing return charges…", {
                    includeFinancialReview: true,
                  });
                }}
              />
            ) : (
              <p className="text-sm text-rph-fg-secondary">Loading return charges…</p>
            )}
          </div>
          <EndHireStepFooter
            backLabel="Back to check-in"
            onBack={() => saveDraft("checkin")}
            stepLabel="Step 4 of 5"
            primaryLabel="Post charges & calculate final account"
            onPrimary={continueToFinalAccount}
            primaryDisabled={stepBusy || !returnChargesCanContinue}
            pending={stepBusy}
          />
        </section>
      ) : null}

      {step === "final_account" ? (
        <section className="overflow-hidden rounded-2xl border border-rph-border bg-rph-raised shadow-sm">
          <div className="border-b border-rph-border px-5 py-5 sm:px-6">
            <p className="driver-dash-section-label">Step 5</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-rph-fg sm:text-[1.375rem]">
              Charges, payments and held funds
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-rph-fg-secondary">
              Review the full account including return charges, choose how to handle any held deposit,
              then confirm to post charges and close the hire.
            </p>
          </div>
          <div className="bg-rph-page p-4 sm:p-5">
            {review && data.finalAccountLedger ? (
              <HireEndHireFinalAccountView
                data={data}
                review={review}
                rentCutoffLabel={formatRentCutoffLabel(returnDateYmd, returnTimeHm)}
                returnedAtIso={data.finalAccountLedger.returnedAtIso}
                driverChargeLineItems={data.finalAccountLedger.driverChargeLineItems}
                extraChargeTimedPayments={data.finalAccountLedger.extraChargeTimedPayments}
                settlementBalancePayments={data.finalAccountLedger.settlementBalancePayments}
                onDepositFinalizePayloadChange={setDepositFinalizePayload}
              />
            ) : (
              <p className="text-sm text-rph-fg-secondary">Could not load the final account.</p>
            )}
          </div>
          {!data.isEndHireFinalized ? (
            <EndHireStepFooter
              backLabel="Back to return charges"
              onBack={() => saveDraft("return_charges")}
              stepLabel="Step 5 of 5"
              primaryLabel="Confirm final account"
              onPrimary={() => setFinalizeConfirmOpen(true)}
              primaryDisabled={!data.canFinalizeEndHire || finalizeBlockedByDeposit}
              pending={stepBusy}
            />
          ) : null}
        </section>
      ) : null}

        </div>
      </div>

      <HirePaymentReviewModal
        target={paymentReviewTarget}
        open={paymentReviewTarget != null}
        onClose={() => setPaymentReviewTarget(null)}
        onSuccess={() => {
          void refreshPageData("Refreshing financial review…", { includeFinancialReview: true });
        }}
      />
      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel end hire and restore active contract?"
        description="This discards the end-hire progress for this session, restores the hire to Active, and removes any provisional termination, check-in inspection, and return-charge drafts recorded during this attempt. Finalise on the final account step cannot be undone."
        confirmLabel="Yes, cancel end hire"
        cancelLabel="Keep ending hire"
        variant="danger"
        pending={false}
        onConfirm={onConfirmCancel}
        onCancel={() => setCancelConfirmOpen(false)}
      />
      <ConfirmDialog
        open={finalizeConfirmOpen}
        title="Confirm final account?"
        description="This posts return charges and deposit decisions to the hire balance, marks the contract completed, and closes the end-hire process. Once confirmed, termination cannot be reversed — you cannot cancel ending or restore this hire to active. You can still record payments afterwards."
        confirmLabel="Confirm final account"
        cancelLabel="Not yet"
        variant="danger"
        pending={false}
        onConfirm={onConfirmFinalize}
        onCancel={() => setFinalizeConfirmOpen(false)}
      />
    </div>
  );
}

function orderedAccountSections(
  sections: HireEndHireAccountSection[],
): HireEndHireAccountSection[] {
  const order: HireEndHireAccountSection["id"][] = ["rent", "extra_charges", "deposit"];
  return order
    .map((id) => sections.find((section) => section.id === id))
    .filter((section): section is HireEndHireAccountSection => Boolean(section));
}

function EndHireAccountBreakdownHeader({ review }: { review: HireEndHireFinancialReview }) {
  const balanceLabel =
    review.positionDirection === "company_owes_driver"
      ? "Company owes"
      : review.positionDirection === "driver_owes_company"
        ? "Driver owes"
        : "Balance";
  const statusLabel =
    review.positionDirection === "settled"
      ? "Clear before check-in"
      : review.positionDirection === "company_owes_driver"
        ? "Credit to driver"
        : "Balance remains open";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-rph-border bg-rph-raised px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
          Current account
        </p>
        <p className="text-sm font-semibold text-rph-fg">{review.positionLabel}</p>
        <p className="text-[11px] leading-snug text-rph-fg-secondary">
          Approved payments only · pending submissions shown separately
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="rph-pill text-xs">{statusLabel}</span>
        <p className="text-sm font-semibold tabular-nums text-rph-fg">
          {balanceLabel}{" "}
          <span className="text-rph-fg">{formatGbp(review.owedBeforeCheckinGbp)}</span>
        </p>
      </div>
    </div>
  );
}

function EndHireFinancialAmountLine({ line }: { line: HireEndHireFinancialLine }) {
  const pending = Boolean(line.pendingApproval);
  const emphasis = Boolean(line.subtotal);
  return (
    <li
      className={`flex items-center justify-between gap-2 py-1 ${
        emphasis ? "text-xs" : "text-[11px]"
      }`}
    >
      <span
        className={
          pending
            ? "text-amber-800 dark:text-amber-200"
            : emphasis
              ? "font-medium text-rph-fg"
              : "text-rph-fg-secondary"
        }
      >
        {line.label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          pending
            ? "font-medium text-amber-900 dark:text-amber-100"
            : emphasis
              ? "font-semibold text-rph-fg"
              : "font-medium text-rph-fg"
        }`}
      >
        {pending
          ? formatGbp(line.amountGbp)
          : formatHireEndHireSignedAmount(line.amountGbp, line.signed)}
      </span>
    </li>
  );
}

function EndHireAccountContextFields({
  sectionId,
  fields,
  compact,
}: {
  sectionId: string;
  fields: { label: string; value: string }[];
  compact?: boolean;
}) {
  if (fields.length === 0) return null;
  if (compact) {
    return (
      <ul className="space-y-1">
        {fields.map((field) => (
          <li
            key={`${sectionId}-${field.label}`}
            className="flex items-baseline justify-between gap-2 text-[11px] leading-snug"
          >
            <span className="shrink-0 text-rph-fg-muted">{field.label}</span>
            <span className="min-w-0 text-right font-medium text-rph-fg">{field.value}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((field) => (
        <div key={`${sectionId}-${field.label}`} className="min-w-0">
          <dt className="text-[11px] text-rph-fg-muted">{field.label}</dt>
          <dd className="text-xs font-medium leading-snug text-rph-fg">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EndHireAccountLedger({ lines }: { lines: HireEndHireFinancialLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="divide-y divide-rph-border rounded-lg border border-rph-border bg-rph-page/50 px-2.5 py-0.5">
      {lines.map((line) => (
        <EndHireFinancialAmountLine key={line.id} line={line} />
      ))}
    </ul>
  );
}

function EndHireAccountSectionDetail({
  section,
  paymentsHref,
  layout = "stacked",
  className,
}: {
  section: HireEndHireAccountSection;
  paymentsHref: string;
  layout?: "split" | "stacked";
  className?: string;
}) {
  const { detail } = section;
  const footerValue = formatHireEndHireSectionFooter(section.footer);

  const chargeLines =
    detail.chargeLines && detail.chargeLines.length > 0 ? (
      <ul className="space-y-0.5 rounded-lg border border-rph-border bg-rph-page/50 px-2 py-1.5">
        {detail.chargeLines.map((charge) => (
          <li key={charge.id} className="flex items-start justify-between gap-2 text-[11px] leading-snug">
            <span className="min-w-0 text-rph-fg-secondary">{charge.label}</span>
            <span className="shrink-0 tabular-nums font-medium text-rph-fg">
              {formatGbp(charge.amountGbp)}
            </span>
          </li>
        ))}
        {detail.moreChargeLinesCount && detail.moreChargeLinesCount > 0 ? (
          <li className="text-[11px] text-rph-fg-muted">
            +{detail.moreChargeLinesCount} more on Payments &amp; balance
          </li>
        ) : null}
      </ul>
    ) : null;

  const footnote = detail.footnote ? (
    <p className="text-[11px] leading-snug text-rph-fg-secondary">{detail.footnote}</p>
  ) : null;

  const contextBlock = (
    <EndHireAccountContextFields
      sectionId={section.id}
      fields={detail.context}
      compact={layout === "stacked"}
    />
  );

  const ledgerBlock = <EndHireAccountLedger lines={section.lines} />;

  return (
    <article
      className={`flex h-full flex-col rounded-lg border border-rph-border bg-rph-raised px-3 py-2.5 shadow-sm ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-rph-border pb-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-rph-fg">{section.title}</h3>
            {section.id === "extra_charges" ? (
              <Link
                href={paymentsHref}
                className="text-[11px] font-medium text-rph-link hover:text-rph-link-hover"
              >
                Payments &amp; balance
              </Link>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-rph-fg-muted">{section.footer.label}</p>
        </div>
        <p
          className={`shrink-0 text-right text-sm font-semibold tabular-nums ${
            section.id === "deposit" ? "text-rph-fg-secondary" : "text-rph-fg"
          }`}
        >
          {footerValue}
        </p>
      </header>

      {layout === "split" ? (
        <div className="mt-2 grid flex-1 gap-3 md:grid-cols-2 md:items-start">
          <div className="space-y-2">
            {contextBlock}
            {footnote}
          </div>
          <div className="space-y-2">
            {chargeLines}
            {ledgerBlock}
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-1 flex-col gap-2">
          {contextBlock}
          {chargeLines}
          {ledgerBlock}
          {footnote}
        </div>
      )}
    </article>
  );
}

function CategorySummaryCard({ category }: { category: HireEndHireCategoryCard }) {
  const isDeposit = category.id === "deposit";
  const toneClass =
    !isDeposit && category.balanceGbp > 0.005
      ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20"
      : "border-rph-border bg-rph-page/50";
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-sm font-semibold text-rph-fg">{category.title}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-rph-fg-secondary">{category.chargedLabel ?? "Total charged"}</dt>
          <dd className="tabular-nums font-medium text-rph-fg">{formatGbp(category.chargedGbp)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-rph-fg-secondary">{category.receivedLabel ?? "Total received"}</dt>
          <dd className="tabular-nums font-medium text-rph-fg">{formatGbp(category.receivedGbp)}</dd>
        </div>
        {category.pendingApprovalGbp > 0.005 ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-amber-800 dark:text-amber-200">Pending approval</dt>
            <dd className="tabular-nums font-medium text-amber-900 dark:text-amber-100">
              {formatGbp(category.pendingApprovalGbp)}
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t border-rph-border pt-2">
          <dt className="font-medium text-rph-fg">{category.footer.label}</dt>
          <dd
            className={`tabular-nums font-semibold ${
              isDeposit ? "text-rph-fg-secondary" : "text-rph-fg"
            }`}
          >
            {formatHireEndHireSectionFooter(category.footer)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-rph-fg-secondary">{category.hint}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "warn" | "danger";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20"
      : tone === "danger"
        ? "border-rose-200 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/20"
        : "border-rph-border bg-rph-page/50";
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium text-rph-fg-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-rph-fg">{value}</p>
      <p className="mt-1 text-xs text-rph-fg-secondary">{hint}</p>
    </div>
  );
}
