"use client";

import {
  loadHireTerminationPreviewAction,
  terminateHireGroupAction,
  type HireTerminationPreview,
} from "@/app/actions/rental-hire-termination";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import {
  formModalBtnContinue,
  formModalBtnGhost,
  formModalBtnSecondary,
} from "@/components/forms/form-modal-actions";
import { FormModalStepProgress } from "@/components/forms/form-modal-step-progress";
import { formatUkDate, formatUkDateTimeSeconds } from "@/lib/datetime/uk";
import {
  hireTerminationRentBillingDetail,
  hireTerminationRentBillingLabel,
  supportsEndOfPeriodBilling,
  type HireTerminationRentBillingMode,
} from "@/lib/fleet/hire-termination-billing";
import {
  hireDepositDispositionLabel,
  overallTerminationPositionGbp,
  rentCadenceLabel,
  rentCadencePluralLabel,
  settlementBalanceLabel,
  type HireDepositDisposition,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import { PROVISIONAL_TERMINATION_SETTLEMENT_RESOLUTION } from "@/lib/fleet/hire-settlement-finalization";
import { settlementResolutionLabel, settlementStepRequired } from "@/lib/fleet/hire-settlement-resolution";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  hireGroupId: string;
  open: boolean;
  includeDeposit: boolean;
  onClose: () => void;
  onCompleted?: () => void;
};

type TerminationStepId = "verify" | "deposit" | "accounts" | "confirm";

const STEP_LABELS: Record<TerminationStepId, string> = {
  verify: "Verify",
  deposit: "Deposit",
  accounts: "Accounts",
  confirm: "Confirm",
};

function buildStepFlow(showDepositStep: boolean): TerminationStepId[] {
  const flow: TerminationStepId[] = ["verify"];
  if (showDepositStep) flow.push("deposit");
  flow.push("accounts");
  flow.push("confirm");
  return flow;
}

function ContractIdentityCard({
  preview,
  compact = false,
}: {
  preview: HireTerminationPreview;
  compact?: boolean;
}) {
  return (
    <div className={`rph-card ${compact ? "p-3" : "space-y-3 p-4"} border border-rph-border-strong text-sm`}>
      {!compact ? <p className="font-semibold text-rph-fg">Contract</p> : null}
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="rph-muted text-xs">Vehicle</dt>
          <dd className="font-medium text-rph-fg">
            {preview.vehicleVrm ?? "—"}
            {preview.vehicleLabel ? ` · ${preview.vehicleLabel}` : ""}
          </dd>
        </div>
        <div>
          <dt className="rph-muted text-xs">Hire start</dt>
          <dd className="font-medium text-rph-fg">{preview.hireStartDateLabel}</dd>
        </div>
        <div>
          <dt className="rph-muted text-xs">Driver</dt>
          <dd className="font-medium text-rph-fg">{preview.driverName ?? "—"}</dd>
        </div>
        <div>
          <dt className="rph-muted text-xs">Email</dt>
          <dd className="font-medium text-rph-fg">{preview.driverEmail ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

function AccountsSummaryPanel({
  accounts,
  showDepositLines,
  billingDetail,
  pendingExtraApprovalGbp = 0,
  compact = false,
}: {
  accounts: HireTerminationAccountsSummary;
  showDepositLines: boolean;
  billingDetail: string | null;
  pendingExtraApprovalGbp?: number;
  compact?: boolean;
}) {
  const extrasGbp = accounts.outstandingExtraChargesGbp ?? 0;
  const overallGbp = overallTerminationPositionGbp(accounts);
  const rentPositionLabel = settlementBalanceLabel(
    accounts.signedRentBalanceGbp > 0.005
      ? "driver_owes_company"
      : accounts.signedRentBalanceGbp < -0.005
        ? "company_owes_driver"
        : "settled",
    accounts.signedRentBalanceGbp,
  );
  const overallLabel = settlementBalanceLabel(
    overallGbp > 0.005 ? "driver_owes_company" : overallGbp < -0.005 ? "company_owes_driver" : "settled",
    overallGbp,
  );

  return (
    <div className={`rph-card space-y-3 text-sm ${compact ? "p-3" : "p-4"}`}>
      {!compact ? <p className="font-semibold text-rph-fg">Accounts at end of hire</p> : null}
      <p className="rph-muted text-xs">
        Ends {formatUkDateTimeSeconds(accounts.terminatedAt)}
        {billingDetail ? ` · ${billingDetail}` : null}
      </p>

      <div className="space-y-2 rounded-lg border border-rph-border bg-rph-page/40 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Rent</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="rph-muted text-xs">Time on hire</dt>
            <dd className="font-medium text-rph-fg">
              {accounts.durationDays} day{accounts.durationDays === 1 ? "" : "s"} · {accounts.billedPeriods}{" "}
              {rentCadencePluralLabel(accounts.rentCadence)}
            </dd>
          </div>
          <div>
            <dt className="rph-muted text-xs">Rent rate</dt>
            <dd className="font-medium text-rph-fg">
              £{accounts.rentAmountGbp.toFixed(2)} per {rentCadenceLabel(accounts.rentCadence)}
            </dd>
          </div>
          {(accounts.totalDiscountGbp ?? 0) > 0.005 ? (
            <>
              <div>
                <dt className="rph-muted text-xs">Rent due so far</dt>
                <dd className="font-medium text-rph-fg">
                  £{(accounts.rentGrossAccruedGbp ?? accounts.accruedRentDueGbp).toFixed(2)}
                </dd>
                <dd className="rph-muted mt-0.5 text-xs">Before discount</dd>
              </div>
              <div>
                <dt className="rph-muted text-xs">Discount</dt>
                <dd className="font-medium text-rph-fg">
                  −£{accounts.totalDiscountGbp.toFixed(2)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="rph-muted text-xs">Rent due so far after discount</dt>
                <dd className="font-semibold text-rph-fg">
                  £{accounts.accruedRentDueGbp.toFixed(2)}
                </dd>
              </div>
            </>
          ) : (
            <div>
              <dt className="rph-muted text-xs">Rent due so far</dt>
              <dd className="font-medium text-rph-fg">£{accounts.accruedRentDueGbp.toFixed(2)}</dd>
            </div>
          )}
          <div>
            <dt className="rph-muted text-xs">Rent paid so far</dt>
            <dd className="font-medium text-rph-fg">£{accounts.accruedRentPaidGbp.toFixed(2)}</dd>
          </div>
          {accounts.accruedOverpaymentGbp > 0.005 ? (
            <div>
              <dt className="rph-muted text-xs">Rent overpayment</dt>
              <dd className="font-medium text-rph-fg">£{accounts.accruedOverpaymentGbp.toFixed(2)}</dd>
            </div>
          ) : null}
          {accounts.prepaidRentCreditGbp > 0.005 ? (
            <div>
              <dt className="rph-muted text-xs">Rent paid in advance</dt>
              <dd className="font-medium text-rph-fg">£{accounts.prepaidRentCreditGbp.toFixed(2)}</dd>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <dt className="rph-muted text-xs">Rent balance</dt>
            <dd className="font-semibold text-rph-fg">{rentPositionLabel}</dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2 rounded-lg border border-rph-border bg-rph-page/40 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Extra charges</p>
        {extrasGbp > 0.005 ? (
          <>
            <p className="font-semibold text-rph-fg">£{extrasGbp.toFixed(2)} still outstanding</p>
            <p className="rph-muted text-xs">
              Damage, admin and other charges not yet paid. These are included in the overall position
              below and stay on Payments after the contract ends.
            </p>
            {pendingExtraApprovalGbp > 0.005 ? (
              <p className="rph-alert-warn text-xs">
                £{pendingExtraApprovalGbp.toFixed(2)} has been submitted for approval. It still counts as
                outstanding until it is approved.
              </p>
            ) : null}
          </>
        ) : (
          <p className="font-medium text-rph-fg">None outstanding</p>
        )}
      </div>

      {showDepositLines ? (
        <div className="space-y-2 rounded-lg border border-rph-border bg-rph-page/40 px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Deposit</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="rph-muted text-xs">Held</dt>
              <dd className="font-medium text-rph-fg">£{accounts.depositGbp.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="rph-muted text-xs">Decision</dt>
              <dd className="font-medium text-rph-fg">{hireDepositDispositionLabel("hold_pending")}</dd>
            </div>
          </dl>
          <p className="rph-muted text-xs">
            Deposit is not applied yet. After vehicle check-in you choose refund, apply to balance, or
            keep on Payments.
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-rph-border-strong px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-rph-fg-muted">Overall position</p>
        <p className="mt-1 text-base font-semibold text-rph-fg">{overallLabel}</p>
        <p className="rph-muted mt-1 text-xs">
          Rent balance
          {extrasGbp > 0.005 ? ` + £${extrasGbp.toFixed(2)} extras` : ""}
          {showDepositLines ? " · deposit held separately until check-in" : ""}. Final settlement is
          completed on Payments after check-in.
        </p>
      </div>
    </div>
  );
}

export function HireTerminateContractModal({
  hireGroupId,
  open,
  includeDeposit,
  onClose,
  onCompleted,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<HireTerminationPreview | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [depositUnpaidNote, setDepositUnpaidNote] = useState("");
  const [terminationNotes, setTerminationNotes] = useState("");
  const [confirmedIdentity, setConfirmedIdentity] = useState(false);
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [rentBillingMode, setRentBillingMode] =
    useState<HireTerminationRentBillingMode>("end_of_period");

  const accounts = preview?.accounts;
  const depositPaid = (preview?.depositPaidGbp ?? 0) > 0.005;
  const showDepositStep = Boolean(preview?.includeDeposit);
  const overallPositionGbp = accounts ? overallTerminationPositionGbp(accounts) : 0;
  const needsSettlement = settlementStepRequired(overallPositionGbp);
  const settlementAmount = Math.abs(overallPositionGbp);

  const stepFlow = useMemo(() => buildStepFlow(showDepositStep), [showDepositStep]);
  const currentStepId = stepFlow[stepIndex] ?? "verify";
  const stepLabels = useMemo(() => stepFlow.map((id) => STEP_LABELS[id]), [stepFlow]);
  const isLastStep = stepIndex === stepFlow.length - 1;

  const billingBreakdown = accounts?.billingPeriodBreakdown ?? null;
  const showBillingOptions = preview ? supportsEndOfPeriodBilling(preview.rentCadence) : false;
  const billingDetail =
    accounts && preview
      ? hireTerminationRentBillingDetail(rentBillingMode, preview.rentCadence, billingBreakdown)
      : null;

  const loadPreview = useCallback(
    async (input: {
      rentBillingMode: HireTerminationRentBillingMode;
      depositDisposition: HireDepositDisposition;
      depositRefundAmountGbp?: number | null;
    }): Promise<HireTerminationPreview | null> => {
      setLoadingPreview(true);
      const res = await loadHireTerminationPreviewAction(
        hireGroupId,
        input.depositDisposition,
        input.depositRefundAmountGbp,
        input.rentBillingMode,
      );
      setLoadingPreview(false);
      if (!res.ok) {
        setError(res.error);
        setPreview(null);
        return null;
      }
      setPreview(res.data);
      setError(null);
      return res.data;
    },
    [hireGroupId],
  );

  useEffect(() => {
    if (!open) {
      setStepIndex(0);
      setConfirmedIdentity(false);
      setFinalConfirmed(false);
      setDepositUnpaidNote("");
      setRentBillingMode("end_of_period");
      setPreview(null);
      setLoadingPreview(false);
      setError(null);
      return;
    }
    setLoadingPreview(true);
    void loadPreview({
      rentBillingMode: "end_of_period",
      depositDisposition: "hold_pending",
    });
  }, [open, loadPreview]);

  useEffect(() => {
    if (stepIndex >= stepFlow.length) {
      setStepIndex(Math.max(0, stepFlow.length - 1));
    }
  }, [stepFlow.length, stepIndex]);

  const canAdvanceFromStep = (): boolean => {
    if (!preview || loadingPreview) return false;
    if (currentStepId === "verify") return confirmedIdentity;
    if (currentStepId === "confirm") return finalConfirmed;
    return true;
  };

  const goNext = async () => {
    if (!canAdvanceFromStep()) return;
    setError(null);

    // Preview is loaded on open. Only recalculate when the rent billing choice changed —
    // deposit is always hold_pending until check-in, so Deposit → Accounts needs no server round-trip.
    if (currentStepId === "verify" && preview?.accounts.rentBillingMode !== rentBillingMode) {
      const data = await loadPreview({
        rentBillingMode,
        depositDisposition: "hold_pending",
      });
      if (!data) return;
    }

    if (isLastStep) {
      void submit();
      return;
    }
    setStepIndex((index) => Math.min(index + 1, stepFlow.length - 1));
  };

  const goBack = () => {
    setError(null);
    setStepIndex((index) => Math.max(0, index - 1));
  };

  const submit = async () => {
    if (!preview) return;
    setSubmitting(true);
    const res = await terminateHireGroupAction({
      hireGroupId,
      confirmedIdentity,
      finalConfirmed,
      rentBillingMode,
      terminationNotes: [terminationNotes, !depositPaid && depositUnpaidNote ? depositUnpaidNote : ""]
        .filter(Boolean)
        .join("\n\n"),
      depositDisposition: "hold_pending",
      depositDispositionReason: depositPaid ? undefined : depositUnpaidNote || undefined,
      depositRefundAmountGbp: null,
      settlementResolution: needsSettlement ? PROVISIONAL_TERMINATION_SETTLEMENT_RESOLUTION : undefined,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCompleted?.();
    onClose();
    router.push(res.checkInHref);
  };

  const stepBusy = loadingPreview;
  const showModalLoader = open && !preview && !error;

  return (
    <FormModalShell
      open={open}
      titleId="terminate-hire-title"
      title="End hire contract"
      description="Stop rent accrual and hold the deposit until vehicle check-in. Final settlement is completed on Payments after check-in."
      pending={submitting}
      pendingMessage="Ending contract…"
      allowMaximize
      maxWidthClass="max-w-3xl"
      panelHeightClass="h-[min(90vh,52rem)]"
      showDraftActions={false}
      onRequestClose={onClose}
      discardConfirmOpen={false}
      onConfirmDiscard={onClose}
      onCancelDiscard={onClose}
      headerExtra={
        preview ? <FormModalStepProgress step={stepIndex} labels={stepLabels} /> : null
      }
      footer={
        <>
          <button type="button" className={formModalBtnGhost} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <div className="rph-modal-footer-end">
            {stepIndex > 0 ? (
              <button
                type="button"
                className={formModalBtnSecondary}
                onClick={goBack}
                disabled={submitting || stepBusy}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              className={formModalBtnContinue}
              onClick={() => void goNext()}
              disabled={submitting || stepBusy || !preview || !canAdvanceFromStep()}
            >
              {stepBusy ? "Calculating…" : isLastStep ? "End contract" : "Continue"}
            </button>
          </div>
        </>
      }
    >
      {error ? <p className="rph-alert-error mb-3 text-sm">{error}</p> : null}
      {showModalLoader ? (
        <div
          className="flex min-h-[20rem] flex-col items-center justify-center gap-3 py-16"
          role="status"
          aria-live="polite"
        >
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
          <p className="text-sm text-rph-fg-secondary">Loading settlement summary…</p>
        </div>
      ) : !preview ? (
        <p className="rph-muted text-sm">Unable to load settlement summary.</p>
      ) : (
        <div className="relative min-h-[20rem] space-y-4">
          {stepBusy ? (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-rph-page/80"
              role="status"
              aria-live="polite"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
                <p className="text-sm text-rph-fg-secondary">Calculating…</p>
              </div>
            </div>
          ) : null}
          {currentStepId === "verify" ? (
            <>
              <ContractIdentityCard preview={preview} />
              <label className="flex cursor-pointer items-start gap-2 px-1 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmedIdentity}
                  onChange={(event) => setConfirmedIdentity(event.target.checked)}
                />
                <span className="text-rph-fg">
                  I confirm this is the correct hire contract for the vehicle and driver shown above.
                </span>
              </label>

              {showBillingOptions ? (
                <div className="rph-card space-y-3 p-4 text-sm">
                  <p className="font-semibold text-rph-fg">Rent billing for final period</p>
                  <p className="rph-muted text-xs">
                    If you change this, accounts are recalculated when you continue.
                  </p>
                  <div className="space-y-2">
                    {(["actual", "end_of_period"] as const).map((mode) => (
                      <label
                        key={mode}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-rph-border p-3 has-[:checked]:border-rph-rail has-[:checked]:bg-rph-raised"
                      >
                        <input
                          type="radio"
                          name="rent-billing-mode"
                          className="mt-0.5"
                          checked={rentBillingMode === mode}
                          onChange={() => setRentBillingMode(mode)}
                        />
                        <span>
                          <span className="block font-medium text-rph-fg">
                            {hireTerminationRentBillingLabel(mode, preview.rentCadence)}
                          </span>
                          {billingBreakdown ? (
                            <span className="rph-muted mt-0.5 block text-xs">
                              {mode === "actual"
                                ? `${billingBreakdown.daysUsed} of ${billingBreakdown.daysInPeriod} days · £${billingBreakdown.actualDueGbp.toFixed(2)}`
                                : `Full period to ${formatUkDate(billingBreakdown.periodEnd)} · £${billingBreakdown.endOfPeriodDueGbp.toFixed(2)}`}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <label className="rph-meta mb-1 block" htmlFor="termination-notes">
                  Notes (optional)
                </label>
                <textarea
                  id="termination-notes"
                  className="rph-input min-h-20 w-full"
                  value={terminationNotes}
                  onChange={(event) => setTerminationNotes(event.target.value)}
                />
              </div>
            </>
          ) : null}

          {currentStepId === "deposit" ? (
            <div className="space-y-4">
              {depositPaid ? (
                <div className="rph-card space-y-2 border border-rph-border-strong p-4 text-sm">
                  <p className="font-medium text-rph-fg">
                    £{preview.depositPaidGbp.toFixed(2)} deposit will be held
                  </p>
                  <p className="rph-muted text-xs">
                    {hireDepositDispositionLabel("hold_pending")}. After vehicle check-in, choose
                    whether to return it, apply it to rent or charges, or keep it on the Payments
                    tab for this hire.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rph-card p-4 text-sm">
                    <p className="font-medium text-rph-fg">Deposit not yet received</p>
                    <p className="rph-muted mt-1 text-xs">
                      £{accounts?.depositGbp.toFixed(2) ?? "0.00"} deposit is on the contract but has not
                      been paid. No deposit decision is needed — add a note if helpful and continue.
                    </p>
                  </div>
                  <div>
                    <label className="rph-meta mb-1 block" htmlFor="deposit-unpaid-note">
                      Note (optional)
                    </label>
                    <textarea
                      id="deposit-unpaid-note"
                      className="rph-input min-h-20 w-full"
                      value={depositUnpaidNote}
                      onChange={(event) => setDepositUnpaidNote(event.target.value)}
                      placeholder="e.g. deposit still outstanding, agreed to collect separately…"
                    />
                  </div>
                </>
              )}
            </div>
          ) : null}

          {currentStepId === "accounts" && accounts ? (
            <AccountsSummaryPanel
              accounts={accounts}
              showDepositLines={showDepositStep && depositPaid}
              billingDetail={billingDetail}
              pendingExtraApprovalGbp={preview.extraChargePendingApprovalGbp}
            />
          ) : null}

          {currentStepId === "confirm" && accounts ? (
            <div className="space-y-4">
              <ContractIdentityCard preview={preview} compact />
              <AccountsSummaryPanel
                accounts={accounts}
                showDepositLines={showDepositStep && depositPaid}
                billingDetail={billingDetail}
                pendingExtraApprovalGbp={preview.extraChargePendingApprovalGbp}
                compact
              />
              {needsSettlement ? (
                <div className="rph-card p-3 text-sm">
                  <p className="font-medium text-rph-fg">
                    Overall balance: {settlementResolutionLabel(PROVISIONAL_TERMINATION_SETTLEMENT_RESOLUTION)}
                    {" · "}£{settlementAmount.toFixed(2)} tracked until check-in is complete
                  </p>
                  {(accounts.outstandingExtraChargesGbp ?? 0) > 0.005 ? (
                    <p className="rph-muted mt-1 text-xs">
                      Includes £{accounts.outstandingExtraChargesGbp.toFixed(2)} outstanding extra charges.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="rph-card space-y-3 border border-rph-border-strong p-4 text-sm">
                <p className="font-semibold text-rph-fg">Confirm and end contract</p>
                <p className="text-rph-fg">
                  You are ending the hire for{" "}
                  <span className="font-semibold">
                    {preview.vehicleVrm ?? "vehicle"}
                    {preview.vehicleLabel ? ` (${preview.vehicleLabel})` : ""}
                  </span>{" "}
                  with driver{" "}
                  <span className="font-semibold">{preview.driverLabel ?? "—"}</span>. Rent stops
                  today. You will complete vehicle check-in next, then finalise the deposit and any
                  rent or extra-charge balance on Payments.
                </p>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={finalConfirmed}
                    onChange={(event) => setFinalConfirmed(event.target.checked)}
                  />
                  <span className="text-sm text-rph-fg">
                    I confirm the overall position above is correct and I want to end this hire contract
                    for {preview.vehicleVrm ?? "this vehicle"} / {preview.driverLabel ?? "this driver"}.
                  </span>
                </label>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </FormModalShell>
  );
}
