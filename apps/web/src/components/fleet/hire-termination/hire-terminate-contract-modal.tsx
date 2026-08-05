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
  depositDispositionReasonLabel,
  requiresDepositDispositionReason,
} from "@/lib/fleet/hire-rent-settlement";
import {
  availableSettlementResolutions,
  defaultDepositDisposition,
  getDepositDispositionOptions,
  hireSettlementLedgerHelpText,
  settlementResolutionLabel,
  settlementStepRequired,
  type HireSettlementResolution,
} from "@/lib/fleet/hire-settlement-resolution";
import {
  hireTerminationRentBillingDetail,
  hireTerminationRentBillingLabel,
  supportsEndOfPeriodBilling,
  type HireTerminationRentBillingMode,
} from "@/lib/fleet/hire-termination-billing";
import {
  HIRE_DEPOSIT_REFUND_METHODS,
  hireDepositDispositionLabel,
  rentCadenceLabel,
  rentCadencePluralLabel,
  settlementBalanceLabel,
  type HireDepositDisposition,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  hireGroupId: string;
  open: boolean;
  includeDeposit: boolean;
  onClose: () => void;
  onCompleted?: () => void;
};

type TerminationStepId = "verify" | "deposit" | "accounts" | "settle" | "confirm";

const STEP_LABELS: Record<TerminationStepId, string> = {
  verify: "Verify",
  deposit: "Deposit",
  accounts: "Accounts",
  settle: "Settle",
  confirm: "Confirm",
};

function buildStepFlow(showDepositStep: boolean, needsSettlement: boolean): TerminationStepId[] {
  const flow: TerminationStepId[] = ["verify"];
  if (showDepositStep) flow.push("deposit");
  flow.push("accounts");
  if (needsSettlement) flow.push("settle");
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
  depositDisposition,
  compact = false,
}: {
  accounts: HireTerminationAccountsSummary;
  showDepositLines: boolean;
  billingDetail: string | null;
  depositDisposition: HireDepositDisposition;
  compact?: boolean;
}) {
  return (
    <div className={`rph-card space-y-2 text-sm ${compact ? "p-3" : "p-4"}`}>
      {!compact ? <p className="font-semibold text-rph-fg">Accounts summary</p> : null}
      <p className="rph-muted">
        Ends {formatUkDateTimeSeconds(accounts.terminatedAt)}
        {billingDetail ? ` · ${billingDetail}` : null}
      </p>
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
        <div>
          <dt className="rph-muted text-xs">Rent due so far</dt>
          <dd className="font-medium text-rph-fg">£{accounts.accruedRentDueGbp.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="rph-muted text-xs">Rent paid so far</dt>
          <dd className="font-medium text-rph-fg">£{accounts.accruedRentPaidGbp.toFixed(2)}</dd>
        </div>
        {accounts.accruedOverpaymentGbp > 0 ? (
          <div>
            <dt className="rph-muted text-xs">Rent overpayment</dt>
            <dd className="font-medium text-rph-fg">£{accounts.accruedOverpaymentGbp.toFixed(2)}</dd>
          </div>
        ) : null}
        {accounts.prepaidRentCreditGbp > 0 ? (
          <div>
            <dt className="rph-muted text-xs">Rent paid in advance</dt>
            <dd className="font-medium text-rph-fg">£{accounts.prepaidRentCreditGbp.toFixed(2)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="rph-muted text-xs">Rent balance</dt>
          <dd className="font-medium text-rph-fg">
            {accounts.rentCreditGbp > 0
              ? `You owe driver £${accounts.rentCreditGbp.toFixed(2)}`
              : accounts.balanceGbp > 0
                ? `Driver owes £${accounts.balanceGbp.toFixed(2)}`
                : "All clear — no rent owed"}
          </dd>
        </div>
        {showDepositLines ? (
          <>
            <div>
              <dt className="rph-muted text-xs">Deposit held</dt>
              <dd className="font-medium text-rph-fg">£{accounts.depositGbp.toFixed(2)}</dd>
            </div>
            <div>
              <dt className="rph-muted text-xs">Deposit decision</dt>
              <dd className="font-medium text-rph-fg">{hireDepositDispositionLabel(depositDisposition)}</dd>
            </div>
          </>
        ) : null}
      </dl>
      <p className="border-t border-rph-border pt-2 font-semibold text-rph-fg">
        Money owed at end:{" "}
        {settlementBalanceLabel(
          accounts.netSettlementGbp > 0
            ? "driver_owes_company"
            : accounts.netSettlementGbp < 0
              ? "company_owes_driver"
              : "settled",
          accounts.netSettlementGbp,
        )}
      </p>
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
  const [depositDisposition, setDepositDisposition] = useState<HireDepositDisposition>("hold_pending");
  const [depositDispositionReason, setDepositDispositionReason] = useState("");
  const [depositRefundAmountGbp, setDepositRefundAmountGbp] = useState("");
  const [depositUnpaidNote, setDepositUnpaidNote] = useState("");
  const [settlementResolution, setSettlementResolution] =
    useState<HireSettlementResolution>("paid_now");
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState("bank_transfer");
  const [settlementPaymentReference, setSettlementPaymentReference] = useState("");
  const [terminationNotes, setTerminationNotes] = useState("");
  const [confirmedIdentity, setConfirmedIdentity] = useState(false);
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [rentBillingMode, setRentBillingMode] =
    useState<HireTerminationRentBillingMode>("end_of_period");

  const accounts = preview?.accounts;
  const depositPaid = (preview?.depositPaidGbp ?? 0) > 0.005;
  const showDepositStep = Boolean(preview?.includeDeposit);
  const needsSettlement = settlementStepRequired(accounts?.netSettlementGbp ?? 0);
  const driverOwesCompany = (accounts?.netSettlementGbp ?? 0) > 0.005;
  const settlementAmount = accounts ? Math.abs(accounts.netSettlementGbp) : 0;

  const signedRentBalanceGbp = accounts?.signedRentBalanceGbp ?? 0;
  const depositOptions = useMemo(
    () => getDepositDispositionOptions(signedRentBalanceGbp),
    [signedRentBalanceGbp],
  );
  const settlementResolutions = useMemo(
    () => (accounts ? availableSettlementResolutions(accounts.netSettlementGbp) : []),
    [accounts],
  );

  const stepFlow = useMemo(
    () => buildStepFlow(showDepositStep, needsSettlement),
    [showDepositStep, needsSettlement],
  );
  const currentStepId = stepFlow[stepIndex] ?? "verify";
  const stepLabels = useMemo(() => stepFlow.map((id) => STEP_LABELS[id]), [stepFlow]);
  const isLastStep = stepIndex === stepFlow.length - 1;

  const billingBreakdown = accounts?.billingPeriodBreakdown ?? null;
  const showBillingOptions = preview ? supportsEndOfPeriodBilling(preview.rentCadence) : false;
  const billingDetail =
    accounts && preview
      ? hireTerminationRentBillingDetail(rentBillingMode, preview.rentCadence, billingBreakdown)
      : null;
  const needsDepositReason =
    showDepositStep && depositPaid && requiresDepositDispositionReason(depositDisposition);

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
      setDepositDisposition("hold_pending");
      setDepositDispositionReason("");
      setDepositUnpaidNote("");
      setRentBillingMode("end_of_period");
      setSettlementResolution("paid_now");
      setSettlementPaymentMethod("bank_transfer");
      setSettlementPaymentReference("");
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

  useEffect(() => {
    if (!settlementResolutions.includes(settlementResolution)) {
      setSettlementResolution(settlementResolutions[0] ?? "paid_now");
    }
  }, [settlementResolution, settlementResolutions]);

  const canAdvanceFromStep = (): boolean => {
    if (!preview || loadingPreview) return false;
    if (currentStepId === "verify") return confirmedIdentity;
    if (currentStepId === "deposit") {
      if (!depositPaid) return true;
      if (needsDepositReason && !depositDispositionReason.trim()) return false;
      if (depositDisposition === "refund_partial" && !depositRefundAmountGbp.trim()) return false;
      return depositOptions.find((option) => option.value === depositDisposition)?.allowed ?? false;
    }
    if (currentStepId === "settle") {
      if (settlementResolution === "paid_now" && !settlementPaymentMethod) return false;
      return Boolean(settlementResolution);
    }
    if (currentStepId === "confirm") return finalConfirmed;
    return true;
  };

  const goNext = async () => {
    if (!canAdvanceFromStep()) return;
    setError(null);

    if (currentStepId === "verify") {
      const data = await loadPreview({
        rentBillingMode,
        depositDisposition: "hold_pending",
      });
      if (!data) return;
      if (data.includeDeposit) {
        setDepositDisposition(defaultDepositDisposition(data.accounts.signedRentBalanceGbp));
      }
    }

    if (currentStepId === "deposit") {
      const disposition = depositPaid ? depositDisposition : "hold_pending";
      const data = await loadPreview({
        rentBillingMode,
        depositDisposition: disposition,
        depositRefundAmountGbp:
          disposition === "refund_partial" ? Number(depositRefundAmountGbp) : null,
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
      depositDisposition: depositPaid ? depositDisposition : "hold_pending",
      depositDispositionReason: depositPaid
        ? depositDispositionReason
        : depositUnpaidNote || undefined,
      depositRefundAmountGbp:
        depositPaid && depositDisposition === "refund_partial"
          ? Number(depositRefundAmountGbp)
          : null,
      settlementResolution: needsSettlement ? settlementResolution : undefined,
      settlementPaymentMethod:
        needsSettlement && settlementResolution === "paid_now" ? settlementPaymentMethod : undefined,
      settlementPaymentReference:
        needsSettlement && settlementResolution === "paid_now"
          ? settlementPaymentReference
          : undefined,
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
      description="Settle accounts, record any payments, and confirm before ending the contract."
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
        <div className="flex w-full items-center justify-between gap-2">
          <button type="button" className={formModalBtnGhost} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <div className="flex gap-2">
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
        </div>
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
                    Your choice is applied when you continue — figures below are indicative only.
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
                <>
                  <p className="text-sm text-rph-fg">
                    £{preview.depositPaidGbp.toFixed(2)} deposit has been received. Choose what happens
                    to it — payment is recorded on a later step if money is owed either way.
                  </p>
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-rph-fg" htmlFor="deposit-disposition">
                      Deposit decision
                    </label>
                    <select
                      id="deposit-disposition"
                      className="rph-input w-full"
                      value={depositDisposition}
                      onChange={(event) =>
                        setDepositDisposition(event.target.value as HireDepositDisposition)
                      }
                    >
                      {depositOptions.map((option) => (
                        <option key={option.value} value={option.value} disabled={!option.allowed}>
                          {option.label}
                          {!option.allowed && option.disabledReason
                            ? ` — ${option.disabledReason}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {depositDisposition === "hold_pending" ? (
                    <p className="rph-muted text-sm">
                      You can decide about the deposit on the next step. If you hold it, choose what to
                      do with it later on the Payments tab for this hire.
                    </p>
                  ) : null}

                  {depositDisposition === "refund_partial" ? (
                    <div>
                      <label className="rph-meta mb-1 block" htmlFor="refund-amount">
                        Refund amount (£)
                      </label>
                      <input
                        id="refund-amount"
                        className="rph-input w-full"
                        inputMode="decimal"
                        value={depositRefundAmountGbp}
                        onChange={(event) => setDepositRefundAmountGbp(event.target.value)}
                      />
                    </div>
                  ) : null}

                  {needsDepositReason ? (
                    <div>
                      <label className="rph-meta mb-1 block" htmlFor="deposit-reason">
                        {depositDispositionReasonLabel(depositDisposition)}
                      </label>
                      <textarea
                        id="deposit-reason"
                        className="rph-input min-h-20 w-full"
                        value={depositDispositionReason}
                        onChange={(event) => setDepositDispositionReason(event.target.value)}
                        placeholder={
                          depositDisposition === "refund_partial"
                            ? "e.g. damage deduction, agreed retention, outstanding charges…"
                            : "e.g. damage claim pending, outstanding charges, agreed retention…"
                        }
                        required
                      />
                    </div>
                  ) : null}
                </>
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
              depositDisposition={depositDisposition}
            />
          ) : null}

          {currentStepId === "settle" && accounts ? (
            <div className="space-y-4">
              <div className="rph-card border border-rph-border-strong p-4 text-sm">
                <p className="font-semibold text-rph-fg">
                  {driverOwesCompany
                    ? `Driver owes £${settlementAmount.toFixed(2)}`
                    : `You owe driver £${settlementAmount.toFixed(2)}`}
                </p>
                <p className="rph-muted mt-1 text-xs">{hireSettlementLedgerHelpText()}</p>
              </div>

              <div className="space-y-2">
                {settlementResolutions.map((resolution) => (
                  <label
                    key={resolution}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-rph-border p-3 has-[:checked]:border-rph-rail has-[:checked]:bg-rph-raised"
                  >
                    <input
                      type="radio"
                      name="settlement-resolution"
                      className="mt-0.5"
                      checked={settlementResolution === resolution}
                      onChange={() => setSettlementResolution(resolution)}
                    />
                    <span>
                      <span className="block font-medium text-rph-fg">
                        {settlementResolutionLabel(resolution)}
                      </span>
                      <span className="rph-muted mt-0.5 block text-xs">
                        {resolution === "paid_now"
                          ? `Record £${settlementAmount.toFixed(2)} ${driverOwesCompany ? "received from" : "paid to"} the driver and clear the balance`
                          : resolution === "open_balance"
                            ? `Keep £${settlementAmount.toFixed(2)} on the Balances page for phased payment`
                            : "Close the hire with no further payment expected"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {settlementResolution === "paid_now" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="rph-meta mb-1 block" htmlFor="settlement-payment-method">
                      Payment method
                    </label>
                    <select
                      id="settlement-payment-method"
                      className="rph-input w-full"
                      value={settlementPaymentMethod}
                      onChange={(event) => setSettlementPaymentMethod(event.target.value)}
                    >
                      {HIRE_DEPOSIT_REFUND_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="rph-meta mb-1 block" htmlFor="settlement-payment-reference">
                      Payment reference
                    </label>
                    <input
                      id="settlement-payment-reference"
                      className="rph-input w-full"
                      value={settlementPaymentReference}
                      onChange={(event) => setSettlementPaymentReference(event.target.value)}
                      placeholder="Bank reference, receipt number, etc."
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStepId === "confirm" && accounts ? (
            <div className="space-y-4">
              <ContractIdentityCard preview={preview} compact />
              <AccountsSummaryPanel
                accounts={accounts}
                showDepositLines={showDepositStep && depositPaid}
                billingDetail={billingDetail}
                depositDisposition={depositDisposition}
                compact
              />
              {needsSettlement ? (
                <div className="rph-card p-3 text-sm">
                  <p className="font-medium text-rph-fg">
                    Payment: {settlementResolutionLabel(settlementResolution)}
                    {settlementResolution === "paid_now"
                      ? ` · £${settlementAmount.toFixed(2)} via ${settlementPaymentMethod.replace(/_/g, " ")}`
                      : settlementResolution === "open_balance"
                        ? ` · £${settlementAmount.toFixed(2)} on balance sheet`
                        : ` · £${settlementAmount.toFixed(2)} written off`}
                    {settlementResolution === "paid_now" && settlementPaymentReference
                      ? ` · ref ${settlementPaymentReference}`
                      : ""}
                  </p>
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
                  <span className="font-semibold">{preview.driverLabel ?? "—"}</span>. You will be
                  taken to vehicle check-in next.
                </p>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={finalConfirmed}
                    onChange={(event) => setFinalConfirmed(event.target.checked)}
                  />
                  <span className="text-sm text-rph-fg">
                    I confirm the settlement details above are correct and I want to end this hire
                    contract for {preview.vehicleVrm ?? "this vehicle"} / {preview.driverLabel ?? "this driver"}.
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
