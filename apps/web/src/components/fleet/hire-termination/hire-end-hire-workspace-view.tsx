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
import {
  HirePaymentReviewModal,
  type HirePaymentReviewTarget,
} from "@/components/fleet/hire-payments/hire-payment-review-modal";
import { RphSelect } from "@/components/forms/rph-select";
import { formatUkDateAtTime, formatUkDateTime } from "@/lib/datetime/uk";
import {
  HIRE_END_HIRE_RETURN_REASON_OPTIONS,
  HIRE_END_HIRE_STEP_LABELS,
  HIRE_END_HIRE_STEPS,
  type HireEndHireStep,
} from "@/lib/fleet/hire-end-hire";
import {
  formatHireEndHireSignedAmount,
  type HireEndHireCategoryCard,
  type HireEndHirePendingApprovalItem,
} from "@/lib/fleet/hire-end-hire-financial";
import { formatGbp } from "@/lib/fleet/maintenance";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

function stepStatus(
  current: HireEndHireStep,
  step: HireEndHireStep,
): "done" | "active" | "locked" {
  const currentIdx = HIRE_END_HIRE_STEPS.indexOf(current);
  const stepIdx = HIRE_END_HIRE_STEPS.indexOf(step);
  if (stepIdx < currentIdx) return "done";
  if (stepIdx === currentIdx) return "active";
  return "locked";
}

function endHireBadgeLabel(data: HireEndHirePageData): string {
  if (data.isEndHireFinalized) return "Termination finalised";
  if (data.checkinCompleted) return "Check-in complete";
  if (data.status === "terminated") return "Contract ended";
  if (data.status === "ending") return "Ending hire";
  return "Active hire";
}

function stepTransitionLabel(step: HireEndHireStep): string {
  switch (step) {
    case "financial_review":
      return "Loading financial review…";
    case "return_details":
      return "Loading return details…";
    case "checkin":
      return "Loading check-in…";
    case "final_account":
      return "Loading final account…";
    default:
      return "Loading…";
  }
}

function EndHireStepTransitionOverlay({ message }: { message: string }) {
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-rph-page/85 backdrop-blur-[1px]"
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
        <span className="text-center text-xs text-rph-fg-muted sm:text-left">{stepLabel}</span>
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
  const { shell } = useHireWorkspace();
  const router = useRouter();
  const [data, setData] = useState<HireEndHirePageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedLabel, setSavedLabel] = useState("Not saved yet");
  const [pending, startTransition] = useTransition();
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  const [startConfirmOpen, setStartConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [paymentReviewTarget, setPaymentReviewTarget] = useState<HirePaymentReviewTarget | null>(null);

  const [returnDateYmd, setReturnDateYmd] = useState("");
  const [returnTimeHm, setReturnTimeHm] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  function applyPageData(page: HireEndHirePageData) {
    setData(page);
    setReturnDateYmd(page.draft.returnDateYmd);
    setReturnTimeHm(page.draft.returnTimeHm);
    setReason(page.draft.reason);
    setNotes(page.draft.notes);
    if (page.draft.updatedAt) {
      setSavedLabel(`Saved ${formatUkDateTime(page.draft.updatedAt)}`);
    }
  }

  async function refreshPageData(message: string, options?: { refreshShell?: boolean }) {
    setTransitionMessage(message);
    try {
      if (options?.refreshShell) router.refresh();
      const res = await loadHireEndHirePageAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setError(null);
      applyPageData(res.data);
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
  const started = data?.draft.started === true;

  const proposedReturnLabel = useMemo(() => {
    if (!returnDateYmd) return "—";
    return formatUkDateAtTime(returnDateYmd, returnTimeHm || "00:00");
  }, [returnDateYmd, returnTimeHm]);

  function saveDraft(nextStep?: HireEndHireStep) {
    startTransition(async () => {
      const message = nextStep ? stepTransitionLabel(nextStep) : "Saving…";
      setTransitionMessage(message);
      const res = await saveHireEndHireDraftAction({
        hireGroupId,
        step: nextStep,
        returnDateYmd,
        returnTimeHm,
        reason,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        setTransitionMessage(null);
        return;
      }
      setSavedLabel("Saved just now");
      setData((prev) => (prev ? { ...prev, draft: res.draft } : prev));
      if (nextStep) {
        await refreshPageData(message);
      } else {
        setTransitionMessage(null);
      }
    });
  }

  function onConfirmStart() {
    startTransition(async () => {
      setTransitionMessage("Starting contract termination…");
      const res = await startHireEndHireAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setStartConfirmOpen(false);
        setTransitionMessage(null);
        return;
      }
      setStartConfirmOpen(false);
      setSavedLabel("Saved just now");
      await refreshPageData("Opening end hire…", { refreshShell: true });
    });
  }

  function onConfirmCancel() {
    startTransition(async () => {
      setTransitionMessage("Cancelling end hire…");
      const res = await cancelHireEndHireAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setCancelConfirmOpen(false);
        setTransitionMessage(null);
        return;
      }
      setCancelConfirmOpen(false);
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
    startTransition(async () => {
      setTransitionMessage("Confirming return and preparing check-in…");
      const res = await confirmHireEndHireReturnAction({
        hireGroupId,
        returnDateYmd,
        returnTimeHm,
        reason,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        setTransitionMessage(null);
        return;
      }
      await refreshPageData(stepTransitionLabel("checkin"), { refreshShell: true });
    });
  }

  function onConfirmFinalize() {
    startTransition(async () => {
      setTransitionMessage("Finalising contract termination…");
      const res = await finalizeHireEndHireAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setFinalizeConfirmOpen(false);
        setTransitionMessage(null);
        return;
      }
      setFinalizeConfirmOpen(false);
      await refreshPageData("Updating final account…", { refreshShell: true });
    });
  }

  if (!data && !error) {
    return <p className="rph-muted text-sm">Loading end hire…</p>;
  }
  if (error && !data) {
    return <p className="rph-alert-error text-sm">{error}</p>;
  }
  if (!data) return null;

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
            disabled={pending || !data.canConfirmReturn}
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
          pending={pending}
          onConfirm={onConfirmStart}
          onCancel={() => setStartConfirmOpen(false)}
        />
      </>
    );
  }

  const review = data.financialReview;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rph-pill rph-pill-active">{endHireBadgeLabel(data)}</span>
            <span className="text-xs text-rph-fg-muted">
              Hire #{data.hireGroupIdShort} · {data.vehicleVrm}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-rph-fg">
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <span aria-hidden>✓</span>
            {savedLabel}
          </span>
          {data.canCancelEndHire ? (
            <button
              type="button"
              className="rph-btn-ghost h-10 px-3 text-red-700 hover:text-red-800 dark:text-red-300"
              disabled={pending}
              onClick={() => setCancelConfirmOpen(true)}
            >
              Cancel ending
            </button>
          ) : null}
          <button type="button" className="rph-btn-ghost h-10 px-3" disabled={pending} onClick={onSaveAndExit}>
            Save and exit
          </button>
        </div>
      </header>

      <nav className="grid gap-2 rounded-2xl border border-rph-border bg-rph-raised p-3 sm:grid-cols-4" aria-label="End hire stages">
        {HIRE_END_HIRE_STEPS.map((item, index) => {
          const status = stepStatus(step, item);
          return (
            <div
              key={item}
              className={`rounded-xl border px-3 py-2.5 ${
                status === "active"
                  ? "border-blue-500 bg-blue-50 dark:border-sky-500 dark:bg-sky-950/40"
                  : status === "done"
                    ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/20"
                    : "border-rph-border bg-rph-page/40"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                {status === "done" ? "✓" : index + 1} · {HIRE_END_HIRE_STEP_LABELS[item]}
              </p>
              <p className="mt-0.5 text-xs text-rph-fg-secondary">
                {status === "locked" ? "Complete previous step" : status === "done" ? "Complete" : "Current"}
              </p>
            </div>
          );
        })}
      </nav>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <div className="relative space-y-4">
        {showStepTransition && transitionMessage ? (
          <EndHireStepTransitionOverlay message={transitionMessage} />
        ) : null}

      {step === "return_details" ? (
        <section className="overflow-hidden rounded-2xl border border-rph-border bg-rph-raised shadow-sm">
          <div className="border-b border-rph-border px-4 py-4 sm:px-5">
            <p className="driver-dash-section-label">Step 1</p>
            <h2 className="mt-1 text-lg font-semibold text-rph-fg">When was the vehicle returned?</h2>
            <p className="mt-1 text-sm text-rph-fg-secondary">
              This timestamp stops rent accrual when you confirm the return, but does not settle the
              account.
            </p>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem] sm:p-5">
            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-rph-fg-muted">Return date</span>
                <input
                  type="date"
                  className="rph-input w-full"
                  value={returnDateYmd}
                  onChange={(e) => setReturnDateYmd(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-rph-fg-muted">Return time</span>
                <input
                  type="time"
                  className="rph-input w-full"
                  value={returnTimeHm}
                  onChange={(e) => setReturnTimeHm(e.target.value)}
                />
              </label>
              <div className="space-y-1">
                <span className="text-xs font-medium text-rph-fg-muted">Reason for ending</span>
                <RphSelect
                  value={reason}
                  onValueChange={setReason}
                  placeholder="Select reason"
                  options={HIRE_END_HIRE_RETURN_REASON_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
              </div>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-rph-fg-muted">Internal note</span>
                <textarea
                  className="rph-input min-h-28 w-full"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Vehicle returned to company location."
                />
              </label>
            </div>
            <aside className="rounded-xl border border-rph-border bg-rph-page/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                Hire dates
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-rph-fg-muted">Contract effective from</dt>
                  <dd className="font-medium text-rph-fg">{data.contractEffectiveFromLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-rph-fg-muted">Signed / activated</dt>
                  <dd className="font-medium text-rph-fg">{data.signedActivatedLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-rph-fg-muted">Proposed return</dt>
                  <dd className="font-medium text-rph-fg">{proposedReturnLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-rph-fg-muted">Rent charged through</dt>
                  <dd className="font-medium text-rph-fg">
                    {returnDateYmd ? formatUkDateAtTime(returnDateYmd, "00:00").split(",")[0] : "—"}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
                Signed date and hire start can differ. Rent is calculated from the contract&apos;s
                effective start, not the signature time.
              </p>
            </aside>
          </div>
          <EndHireStepFooter
            backLabel="Save and exit"
            onBack={onSaveAndExit}
            stepLabel="Step 1 of 4"
            primaryLabel="Review financial position"
            onPrimary={() => saveDraft("financial_review")}
            primaryDisabled={!returnDateYmd || !returnTimeHm || !reason}
            pending={pending}
          />
        </section>
      ) : null}

      {step === "financial_review" ? (
        <section className="overflow-hidden rounded-2xl border border-rph-border bg-rph-raised shadow-sm">
          <div className="border-b border-rph-border px-4 py-4 sm:px-5">
            <p className="driver-dash-section-label">Step 2</p>
            <h2 className="mt-1 text-lg font-semibold text-rph-fg">Review the position before check-in</h2>
          </div>
          {review ? (
            <div className="space-y-4 p-4 sm:p-5">
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
                          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                            {item.label}
                          </p>
                          <p className="text-xs text-amber-900 dark:text-amber-200">
                            Driver submitted {formatGbp(item.submittedGbp)} — awaiting approval
                          </p>
                        </div>
                        {data.canApprovePayments ? (
                          <button
                            type="button"
                            className="rph-btn-primary h-9 w-full shrink-0 px-3 text-sm sm:w-auto"
                            onClick={() => {
                              const target = pendingReviewTarget(item, data);
                              if (target) setPaymentReviewTarget(target);
                            }}
                          >
                            Review payment
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-3">
                {review.categories.map((category) => (
                  <CategorySummaryCard key={category.id} category={category} />
                ))}
              </div>

              <div className="rounded-xl border border-rph-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rph-border px-4 py-3">
                  <div>
                    <p className="driver-dash-section-label">Current account</p>
                    <p className="mt-1 text-base font-semibold text-rph-fg">{review.positionLabel}</p>
                    <p className="mt-1 text-xs text-rph-fg-secondary">
                      Approved payments only. Pending amounts are shown for awareness and do not reduce
                      the balance. Extra-charge line detail is on Payments &amp; balance.
                    </p>
                  </div>
                  <span className="rph-pill">
                    {review.positionDirection === "settled"
                      ? "Clear before check-in"
                      : review.positionDirection === "company_owes_driver"
                        ? "Credit to driver"
                        : "Balance remains open"}
                  </span>
                </div>

                <div className="divide-y divide-rph-border">
                  {review.accountSections.map((section) => (
                    <div key={section.id} className="px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                        {section.title}
                      </p>
                      <ul className="mt-2 space-y-2">
                        {section.lines.map((line) => (
                          <li
                            key={line.id}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span
                              className={
                                line.pendingApproval
                                  ? "text-amber-800 dark:text-amber-200"
                                  : "text-rph-fg-secondary"
                              }
                            >
                              {line.label}
                            </span>
                            <span
                              className={`tabular-nums font-medium ${
                                line.pendingApproval
                                  ? "text-amber-900 dark:text-amber-100"
                                  : "text-rph-fg"
                              }`}
                            >
                              {line.pendingApproval
                                ? formatGbp(line.amountGbp)
                                : formatHireEndHireSignedAmount(line.amountGbp, line.signed)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-rph-border bg-rph-page/40 px-4 py-3 text-sm font-semibold">
                  <span>
                    {review.positionDirection === "company_owes_driver"
                      ? "Company owes"
                      : review.positionDirection === "driver_owes_company"
                        ? "Driver owes"
                        : "Balance"}
                  </span>
                  <span className="tabular-nums">{formatGbp(review.owedBeforeCheckinGbp)}</span>
                </div>

                {review.depositUnpaid ? (
                  <p className="border-t border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-950 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100">
                    The {formatGbp(review.depositRequiredGbp)} contractual deposit was not paid. It
                    cannot be applied to rent, used for damage or refunded, and is not included in the
                    amount above. The final account must show deposit received as {formatGbp(0)}.
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="p-5 text-sm text-rph-fg-secondary">Could not load the financial review.</p>
          )}
          <EndHireStepFooter
            backLabel="Back"
            onBack={() => saveDraft("return_details")}
            stepLabel="Step 2 of 4"
            primaryLabel="Vehicle check-in"
            onPrimary={onConfirmReturn}
            primaryDisabled={!data.canConfirmReturn}
            pending={pending}
          />
        </section>
      ) : null}

      {step === "checkin" ? (
        <section className="space-y-3">
          <div className="rounded-2xl border border-rph-border bg-rph-raised px-4 py-4 shadow-sm sm:px-5">
            <p className="driver-dash-section-label">Step 3</p>
            <h2 className="mt-1 text-lg font-semibold text-rph-fg">Vehicle check-in</h2>
            <p className="mt-1 text-sm text-rph-fg-secondary">
              Record the return inspection. When check-in is complete, continue to the final account and
              finalise contract termination when you are ready.
            </p>
          </div>
          <HireInspectionsWorkspaceClient
            hireGroupId={hireGroupId}
            hireStatus={shell.status}
            vehicleLabel={`${shell.vehicleVrm} · ${shell.vehicleLabel}`}
            vehicleId={shell.vehicleId}
            focusKind="checkin"
            audience="staff"
          />
          {data.checkinCompleted ? (
            <div className="flex justify-end">
              <button
                type="button"
                className="rph-btn-primary h-10 px-4"
                disabled={pending}
                onClick={() => saveDraft("final_account")}
              >
                Continue to final account
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === "final_account" ? (
        <section className="space-y-4">
          {data.isEndHireFinalized ? (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 px-4 py-4 dark:border-emerald-800 dark:bg-emerald-950/30 sm:px-5">
              <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                Contract termination finalised
              </p>
              <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
                This hire is complete. The end-hire process can no longer be cancelled or reversed.
                {data.openBalanceGbp > 0.005
                  ? " Any open balance remains on the company Balances list until settled."
                  : " The account is clear."}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-300 bg-amber-50/80 px-4 py-4 dark:border-amber-900/50 dark:bg-amber-950/25 sm:px-5">
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Final account — termination not yet finalised
              </p>
              <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                Review payments and adjustments below. You can still cancel the end-hire process until you
                finalise contract termination. Once finalised, this step cannot be reversed.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rph-rail px-4 py-4 text-white sm:px-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Current position</p>
              <p className="mt-1 text-xl font-semibold">
                {data.openBalanceGbp > 0.005
                  ? `Driver owes ${formatGbp(data.openBalanceGbp)}`
                  : "Account is clear"}
              </p>
              <p className="mt-1 text-sm text-white/80">
                Record payment now or leave this account open for collection on Balances.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/rental/hires/${hireGroupId}/payments`}
                className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
              >
                Record final payment
              </Link>
              <Link
                href={`/rental/balances/${hireGroupId}`}
                className="inline-flex h-10 items-center rounded-lg border border-white/30 bg-transparent px-4 text-sm font-medium text-white hover:bg-white/10"
              >
                Leave balance open
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-rph-border bg-rph-raised p-4 shadow-sm sm:p-5">
            {review ? (
              <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Total charges"
                  value={formatGbp(review.rentChargedGbp + review.extraChargesPostedGbp)}
                  hint="Rent and extras"
                />
                <KpiCard
                  label="Money received"
                  value={formatGbp(review.rentReceivedGbp + review.extraChargesReceivedGbp)}
                  hint="Rent and extra-charge payments"
                />
                <KpiCard
                  label="Deposit received"
                  value={formatGbp(review.depositReceivedGbp)}
                  hint={review.depositUnpaid ? "Unpaid" : "Held"}
                />
                <KpiCard
                  label="Current balance"
                  value={formatGbp(data.openBalanceGbp)}
                  hint={data.openBalanceGbp > 0.005 ? "Open" : "Clear"}
                  tone={data.openBalanceGbp > 0.005 ? "warn" : "neutral"}
                />
              </div>
            ) : null}
            <p className="text-sm text-rph-fg-secondary">
              Open balances stay on the company Balances list until settled. Use Payments & balance to
              record settlement payments, resolve the deposit, or add adjustments.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/rental/hires/${hireGroupId}/payments`} className="rph-btn-primary h-10 px-4">
                Record payment
              </Link>
              <Link href={`/rental/hires/${hireGroupId}/payments`} className="rph-btn-ghost h-10 px-4">
                Add adjustment
              </Link>
              <Link href={`/rental/balances/${hireGroupId}`} className="rph-btn-ghost h-10 px-4">
                Open balances
              </Link>
            </div>
          </div>
          {!data.isEndHireFinalized ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rph-border bg-rph-raised px-4 py-4 shadow-sm sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-rph-fg">Ready to close this hire?</p>
                <p className="mt-1 text-sm text-rph-fg-secondary">
                  Finalising marks the contract as completed. You can still record payments afterwards, but
                  you cannot undo termination or return to an active hire.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
                disabled={pending || !data.canFinalizeEndHire}
                onClick={() => setFinalizeConfirmOpen(true)}
              >
                Finalise contract termination
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      </div>

      <HirePaymentReviewModal
        target={paymentReviewTarget}
        open={paymentReviewTarget != null}
        onClose={() => setPaymentReviewTarget(null)}
        onSuccess={() => {
          void refreshPageData("Refreshing financial review…");
        }}
      />
      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Cancel ending this contract?"
        description="This reverses the end-hire process and restores the hire to Active. If return was already confirmed, provisional termination is undone. If check-in was completed, that check-in inspection and any check-in damage charges are removed. Cancel is unavailable after you finalise contract termination on the final account step."
        confirmLabel="Cancel ending"
        cancelLabel="Keep ending"
        variant="danger"
        pending={pending}
        onConfirm={onConfirmCancel}
        onCancel={() => setCancelConfirmOpen(false)}
      />
      <ConfirmDialog
        open={finalizeConfirmOpen}
        title="Finalise contract termination?"
        description="This marks the hire as completed and closes the end-hire process. Once finalised, contract termination cannot be reversed — you cannot cancel ending, undo check-in, or restore this hire to active. You can still record payments and settle any open balance afterwards."
        confirmLabel="Finalise termination"
        cancelLabel="Not yet"
        variant="danger"
        pending={pending}
        onConfirm={onConfirmFinalize}
        onCancel={() => setFinalizeConfirmOpen(false)}
      />
    </div>
  );
}

function CategorySummaryCard({ category }: { category: HireEndHireCategoryCard }) {
  const toneClass =
    category.balanceGbp > 0.005
      ? "border-amber-200 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/20"
      : "border-rph-border bg-rph-page/50";
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-sm font-semibold text-rph-fg">{category.title}</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-rph-fg-secondary">Total charged</dt>
          <dd className="tabular-nums font-medium text-rph-fg">{formatGbp(category.chargedGbp)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-rph-fg-secondary">Total received</dt>
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
          <dt className="font-medium text-rph-fg">Balance</dt>
          <dd className="tabular-nums font-semibold text-rph-fg">{formatGbp(category.balanceGbp)}</dd>
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
