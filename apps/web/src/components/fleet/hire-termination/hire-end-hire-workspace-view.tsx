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
import { HireDepositDispositionResolveCard, type HireDepositFinalizePayload } from "@/components/fleet/hire-payments/hire-deposit-disposition-resolve-card";
import { HireReturnChargesSection, type HireReturnChargesSectionHandle } from "@/components/fleet/hire-termination/hire-return-charges-section";
import { defaultDepositDisposition } from "@/lib/fleet/hire-settlement-resolution";
import {
  hireDepositDispositionLabel,
  settlementBalanceLabel,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
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
  hireEndHireDefaultRentBillingMode,
  hireEndHireStepNeedsFinancialReview,
  type HireEndHireStep,
} from "@/lib/fleet/hire-end-hire";
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
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

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
  const [depositFinalizePayload, setDepositFinalizePayload] =
    useState<HireDepositFinalizePayload | null>(null);
  const returnChargesRef = useRef<HireReturnChargesSectionHandle>(null);
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

  async function refreshPageData(
    message: string,
    options?: { refreshShell?: boolean; includeFinancialReview?: boolean },
  ) {
    setTransitionMessage(message);
    try {
      if (options?.refreshShell) router.refresh();
      const includeFinancialReview =
        options?.includeFinancialReview ??
        (data?.draft.step != null && hireEndHireStepNeedsFinancialReview(data.draft.step));
      const res = await loadHireEndHirePageAction(hireGroupId, { includeFinancialReview });
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
      const currentStep = data?.draft.step ?? "return_details";
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
        setTransitionMessage(null);
        return;
      }
      setSavedLabel("Saved just now");

      const targetStep = nextStep ?? res.draft.step;
      const needsFinancialReview = hireEndHireStepNeedsFinancialReview(targetStep);
      const hasCachedFinancialReview = Boolean(data?.financialReview);
      const canUseCachedFinancialReview =
        needsFinancialReview &&
        hasCachedFinancialReview &&
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

      if (targetStep === "return_details" || canUseCachedFinancialReview || targetStep === "checkin" || targetStep === "return_charges") {
        setTransitionMessage(null);
        return;
      }
      if (nextStep) {
        await refreshPageData(message, { includeFinancialReview: needsFinancialReview });
        return;
      }
      setTransitionMessage(null);
    });
  }

  function continueToFinalAccount() {
    startTransition(async () => {
      setError(null);
      setTransitionMessage("Saving return charges…");
      const saveRes = await returnChargesRef.current?.saveDraft();
      if (saveRes && !saveRes.ok) {
        setError(saveRes.error);
        setTransitionMessage(null);
        return;
      }

      setTransitionMessage("Loading final account…");
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
        setTransitionMessage(null);
        return;
      }
      setSavedLabel("Saved just now");
      setData((prev) => (prev ? { ...prev, draft: res.draft } : prev));
      await refreshPageData("Loading final account…", { includeFinancialReview: true });
    });
  }

  async function advanceToReturnChargesAfterCheckin() {
    setTransitionMessage("Loading return charges…");
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
        rentBillingMode: data?.draft.rentBillingMode ?? hireEndHireDefaultRentBillingMode(),
      });
      if (!res.ok) {
        setError(res.error);
        setTransitionMessage(null);
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
      setTransitionMessage(null);
      void router.refresh();
    });
  }

  function onConfirmFinalize() {
    startTransition(async () => {
      setTransitionMessage("Finalising contract termination…");
      const res = await finalizeHireEndHireAction(hireGroupId, depositFinalizePayload ?? undefined);
      if (!res.ok) {
        setError(res.error);
        setFinalizeConfirmOpen(false);
        setTransitionMessage(null);
        return;
      }
      setFinalizeConfirmOpen(false);
      setDepositFinalizePayload(null);
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

  const needsDepositOnConfirm =
    !data.isEndHireFinalized &&
    Boolean(data.depositResolution?.canResolveDeposit) &&
    !data.depositResolution?.depositDisposition;
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
  const returnAlreadyConfirmed = data.status === "terminated" || data.status === "completed";

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

      <nav className="grid gap-2 rounded-2xl border border-rph-border bg-rph-raised p-3 sm:grid-cols-5" aria-label="End hire stages">
        {HIRE_END_HIRE_STEPS.map((item, index) => {
          const status = stepStatus(step, item);
          const canGoBack = status === "done" && !pending;
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
              {canGoBack ? (
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => saveDraft(item)}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                    ✓ · {HIRE_END_HIRE_STEP_LABELS[item]}
                  </p>
                  <p className="mt-0.5 text-xs text-rph-link hover:text-rph-link-hover">
                    Go back to this step
                  </p>
                </button>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-rph-fg-muted">
                    {status === "done" ? "✓" : index + 1} · {HIRE_END_HIRE_STEP_LABELS[item]}
                  </p>
                  <p className="mt-0.5 text-xs text-rph-fg-secondary">
                    {status === "locked"
                      ? "Complete previous step"
                      : status === "done"
                        ? "Complete"
                        : "Current"}
                  </p>
                </>
              )}
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
            {returnAlreadyConfirmed ? (
              <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
                Return was already confirmed. You can review these details here; changing them does not
                alter the recorded contract end.
              </p>
            ) : null}
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
            stepLabel="Step 1 of 5"
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

              <div className="rounded-2xl border border-rph-border bg-rph-page/40 p-3 sm:p-4">
                <EndHireAccountBreakdownHeader review={review} />

                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {orderedAccountSections(review.accountSections).map((section) => (
                    <EndHireAccountSectionDetail
                      key={section.id}
                      section={section}
                      paymentsHref={`/rental/hires/${hireGroupId}/payments`}
                      layout={section.id === "rent" ? "split" : "stacked"}
                      className={section.id === "rent" ? "lg:col-span-2" : undefined}
                    />
                  ))}
                </div>

                {review.depositUnpaid ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-snug text-red-950 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100">
                    The {formatGbp(review.depositRequiredGbp)} contractual deposit was not paid. It
                    cannot be applied to rent, used for damage or refunded, and is not included in the
                    pre-check-in balance above.
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
            stepLabel="Step 2 of 5"
            primaryLabel={returnAlreadyConfirmed ? "Continue to check-in" : "Vehicle check-in"}
            onPrimary={
              returnAlreadyConfirmed ? () => saveDraft("checkin") : onConfirmReturn
            }
            primaryDisabled={returnAlreadyConfirmed ? false : !data.canConfirmReturn}
            pending={pending}
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
              hireStatus={shell.status}
              vehicleLabel={`${shell.vehicleVrm} · ${shell.vehicleLabel}`}
              vehicleId={shell.vehicleId}
              focusKind="checkin"
              audience="staff"
              onCheckinComplete={advanceToReturnChargesAfterCheckin}
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
            pending={pending}
          />
        </section>
      ) : null}

      {step === "return_charges" ? (
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-rph-border bg-rph-raised shadow-sm">
            <div className="border-b border-rph-border px-4 py-4 sm:px-5">
              <p className="driver-dash-section-label">Step 4</p>
              <h2 className="mt-1 text-lg font-semibold text-rph-fg">Return charges</h2>
              <p className="mt-1 text-sm text-rph-fg-secondary">
                Review what check-in recorded and choose whether to charge. Your choices are applied to
                the balance when you confirm the final account on the next step.
              </p>
            </div>
            <div className="p-4 sm:p-5">
              {data.returnCharges ? (
                <HireReturnChargesSection
                  ref={returnChargesRef}
                  hireGroupId={hireGroupId}
                  data={data.returnCharges}
                  readOnly={data.isEndHireFinalized}
                  embedded
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
              primaryLabel="Continue to final account"
              onPrimary={continueToFinalAccount}
              primaryDisabled={pending}
              pending={pending}
            />
          </div>
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
                Final account — review balance, deposit, then confirm
              </p>
              <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                Review the full account position below. Choose what to do with any held deposit, then
                confirm to post return charges and deposit decisions to the balance sheet and close the
                hire. Record any cash payments afterwards from Payments.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rph-rail px-4 py-4 text-white sm:px-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/70">
                Balance with company
              </p>
              <p className="mt-1 text-xl font-semibold">
                {settlementBalanceLabel(
                  data.settlementBalanceDirection === "company_owes_driver"
                    ? "company_owes_driver"
                    : data.settlementBalanceDirection === "driver_owes_company"
                      ? "driver_owes_company"
                      : data.openBalanceGbp > 0.005
                        ? "driver_owes_company"
                        : "settled",
                  data.openBalanceGbp,
                )}
              </p>
              <p className="mt-1 text-sm text-white/80">
                {data.depositResolution && data.depositResolution.depositHeldGbp > 0.005
                  ? `Deposit held with company: ${formatGbp(data.depositResolution.depositHeldGbp)}.`
                  : review
                    ? `Contract deposit: ${formatGbp(review.depositReceivedGbp)} received of ${formatGbp(review.depositRequiredGbp)}.`
                    : "Review return charges and deposit before finalising."}
                {data.depositResolution?.canResolveDeposit &&
                data.depositResolution.currentSignedSettlementGbp > 0.005
                  ? ` Recommended: ${hireDepositDispositionLabel(defaultDepositDisposition(data.depositResolution.currentSignedSettlementGbp))}.`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/rental/hires/${hireGroupId}/payments`}
                className="inline-flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
              >
                Record payment
              </Link>
              <Link
                href={`/rental/balances/${hireGroupId}`}
                className="inline-flex h-10 items-center rounded-lg border border-white/30 bg-transparent px-4 text-sm font-medium text-white hover:bg-white/10"
              >
                Open balances
              </Link>
            </div>
          </div>
          {data.returnCharges &&
          !data.isEndHireFinalized &&
          data.returnCharges.returnChargesDraftSavedAt &&
          !data.returnCharges.returnChargesAppliedAt ? (
            <div className="rounded-xl border border-sky-300 bg-sky-50/80 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/25 dark:text-sky-100">
              <p className="font-medium">Return charges ready to post</p>
              <p className="mt-1 text-sky-900 dark:text-sky-200">
                Saved on step 4 — confirming the final account will add these charges to the hire balance.
              </p>
            </div>
          ) : null}
          {data.returnCharges &&
          (data.returnCharges.newDamages.some((d) => d.chargeResolution === "review_later") ||
            data.returnCharges.fuelReviewLater ||
            data.returnCharges.accessoryReviewsLater.length > 0) ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100">
              <p className="font-medium">Marked for later review</p>
              <p className="mt-1 text-amber-900 dark:text-amber-200">
                These items will not be charged now. Decide later from Payments & balance whether to bill
                the driver.
                {data.returnCharges.newDamages.filter((d) => d.chargeResolution === "review_later")
                  .length > 0
                  ? ` Damage: ${
                      data.returnCharges.newDamages.filter((d) => d.chargeResolution === "review_later")
                        .length
                    }.`
                  : ""}
                {data.returnCharges.fuelReviewLater ? " Fuel difference." : ""}
                {data.returnCharges.accessoryReviewsLater.length > 0
                  ? ` Missing kit: ${data.returnCharges.accessoryReviewsLater.length}.`
                  : ""}
              </p>
            </div>
          ) : null}
          {data.depositResolution?.canResolveDeposit &&
          data.depositResolution.terminationSummary &&
          !data.isEndHireFinalized ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-rph-fg">Deposit decision</p>
              {data.depositResolution.currentSignedSettlementGbp > 0.005 ? (
                <p className="rounded-xl border border-emerald-300 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                  Recommended: use the held deposit (
                  {formatGbp(data.depositResolution.depositHeldGbp)}) to clear what the driver owes.
                </p>
              ) : data.depositResolution.currentSignedSettlementGbp < -0.005 ? (
                <p className="rounded-xl border border-rph-border bg-rph-raised px-4 py-3 text-sm text-rph-fg-secondary">
                  Company holds a credit for the driver. Recommended default is to return the deposit
                  unless you need to hold it.
                </p>
              ) : (
                <p className="rounded-xl border border-rph-border bg-rph-raised px-4 py-3 text-sm text-rph-fg-secondary">
                  Account is clear. Choose whether to return or hold the deposit.
                </p>
              )}
              <HireDepositDispositionResolveCard
                hireGroupId={hireGroupId}
                terminationSummary={data.depositResolution.terminationSummary}
                depositHeldGbp={data.depositResolution.depositHeldGbp}
                currentSignedSettlementGbp={data.depositResolution.currentSignedSettlementGbp}
                deferSubmit
                onFinalizePayloadChange={setDepositFinalizePayload}
                onSuccess={() => {
                  void refreshPageData("Refreshing deposit decision…", {
                    includeFinancialReview: true,
                  });
                }}
              />
            </div>
          ) : data.depositResolution?.depositDisposition ? (
            <div className="rounded-2xl border border-rph-border bg-rph-raised p-4 shadow-sm sm:p-5">
              <p className="text-sm font-semibold text-rph-fg">Deposit</p>
              <p className="mt-1 text-sm text-rph-fg-secondary">
                {hireDepositDispositionLabel(
                  data.depositResolution.depositDisposition as
                    | "apply_to_balance"
                    | "refund_full"
                    | "refund_partial"
                    | "forfeit"
                    | "hold_pending",
                )}
                {data.depositResolution.depositHeldGbp > 0.005
                  ? ` · Held ${formatGbp(data.depositResolution.depositHeldGbp)}`
                  : ""}
              </p>
            </div>
          ) : null}
          <div className="rounded-2xl border border-rph-border bg-rph-raised p-4 shadow-sm sm:p-5">
            {review ? (
              <>
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

                <div className="rounded-2xl border border-rph-border bg-rph-page/40 p-3 sm:p-4">
                  <EndHireAccountBreakdownHeader review={review} />
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {orderedAccountSections(review.accountSections).map((section) => (
                      <EndHireAccountSectionDetail
                        key={section.id}
                        section={section}
                        paymentsHref={`/rental/hires/${hireGroupId}/payments`}
                        layout={section.id === "rent" ? "split" : "stacked"}
                        className={section.id === "rent" ? "lg:col-span-2" : undefined}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-rph-fg-secondary">Could not load the account breakdown.</p>
            )}
            <p className="mt-4 text-sm text-rph-fg-secondary">
              Confirming posts return charges and deposit decisions to the balance. Record settlement
              payments afterwards from Payments & balance.
            </p>
          </div>
          {!data.isEndHireFinalized ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rph-border bg-rph-raised px-4 py-4 shadow-sm sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-rph-fg">Ready to close this hire?</p>
                <p className="mt-1 text-sm text-rph-fg-secondary">
                  Confirming posts charges and deposit to the balance and marks the contract completed.
                  You can still record payments afterwards, but you cannot undo termination.
                  {!data.canFinalizeEndHire &&
                  data.returnCharges &&
                  !data.returnCharges.returnChargesReady
                    ? " Go back to return charges and save your decisions first."
                    : finalizeBlockedByDeposit
                      ? " Choose a deposit action above before confirming."
                      : ""}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:opacity-50"
                disabled={pending || !data.canFinalizeEndHire || finalizeBlockedByDeposit}
                onClick={() => setFinalizeConfirmOpen(true)}
              >
                Confirm final account
              </button>
            </div>
          ) : null}
          {!data.isEndHireFinalized ? (
            <EndHireStepFooter
              backLabel="Back to return charges"
              onBack={() => saveDraft("return_charges")}
              stepLabel="Step 5 of 5"
              primaryLabel="Confirm final account"
              onPrimary={() => setFinalizeConfirmOpen(true)}
              primaryDisabled={!data.canFinalizeEndHire || finalizeBlockedByDeposit}
              pending={pending}
            />
          ) : null}
        </section>
      ) : null}

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
        title="Confirm final account?"
        description="This posts return charges and deposit decisions to the hire balance, marks the contract completed, and closes the end-hire process. Once confirmed, termination cannot be reversed — you cannot cancel ending or restore this hire to active. You can still record payments afterwards."
        confirmLabel="Confirm final account"
        cancelLabel="Not yet"
        variant="danger"
        pending={pending}
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
