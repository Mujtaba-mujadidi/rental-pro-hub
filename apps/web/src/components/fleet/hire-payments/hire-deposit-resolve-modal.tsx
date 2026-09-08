"use client";

import {
  resolveHireDepositDispositionAction,
  type HireBalancePaymentAccountOption,
} from "@/app/actions/rental-hire-termination";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import {
  buildDepositResolutionPreview,
  type DepositResolutionPreview,
} from "@/lib/fleet/hire-deposit-resolution";
import {
  depositResolutionShowsSettlementUi,
  type HireSettlementResolution,
} from "@/lib/fleet/hire-settlement-resolution";
import {
  depositDispositionReasonLabel,
  requiresDepositDispositionReason,
} from "@/lib/fleet/hire-rent-settlement";
import {
  HIRE_PAYMENT_METHOD_LABELS,
  settlementPaymentMethodRequiresAccount,
} from "@/lib/fleet/hire-settlement-payment-method";
import {
  HIRE_DEPOSIT_REFUND_METHODS,
  hireDepositDispositionLabel,
  settlementBalanceLabel,
  type HireDepositDisposition,
} from "@/lib/fleet/hire-termination-summary";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useMemo, useState, useTransition } from "react";

export type HireDepositResolveModalDisposition = Exclude<
  HireDepositDisposition,
  "hold_pending"
>;

function modalDescription(disposition: HireDepositResolveModalDisposition): string {
  if (disposition === "apply_to_balance") {
    return "The held deposit is applied to unpaid rent first, then outstanding charges. The amount cannot be changed.";
  }
  if (disposition === "refund_full") {
    return "Return the full held deposit to the driver. This does not clear any open hire debt.";
  }
  if (disposition === "refund_partial") {
    return "Return part of the held deposit. Record why, and how any payout is made.";
  }
  return "Keep the deposit with no refund. Any amount still owed after this stays on Payments.";
}

function DepositAllocationPreview({
  heldGbp,
  preview,
  unpaidRentGbp,
  unpaidChargesGbp,
}: {
  heldGbp: number;
  preview: DepositResolutionPreview;
  unpaidRentGbp: number;
  unpaidChargesGbp: number;
}) {
  const rent = preview.depositAppliedToRentGbp;
  const charges = preview.depositAppliedToChargesGbp;
  const afterSigned = preview.afterSignedSettlementGbp;
  const lines: {
    id: string;
    label: string;
    allocatedGbp: number;
    rowBalanceAfterGbp: number;
    fullyAllocated: boolean;
  }[] = [];
  if (rent > 0.005) {
    const remaining = Math.max(0, unpaidRentGbp - rent);
    lines.push({
      id: "rent",
      label: "Unpaid rent",
      allocatedGbp: rent,
      rowBalanceAfterGbp: remaining,
      fullyAllocated: remaining <= 0.005,
    });
  }
  if (charges > 0.005) {
    const remaining = Math.max(0, unpaidChargesGbp - charges);
    lines.push({
      id: "charges",
      label: "Outstanding charges",
      allocatedGbp: charges,
      rowBalanceAfterGbp: remaining,
      fullyAllocated: remaining <= 0.005,
    });
  }
  const applied = rent + charges;
  const surplus = Math.max(0, heldGbp - applied);

  return (
    <div className="space-y-2 rounded-lg border border-rph-border bg-rph-page p-3">
      <p className="text-sm font-medium text-rph-fg">Allocation preview</p>
      <p className="rph-meta text-xs">
        {lines.length === 1
          ? "This deposit will be applied to the line below."
          : lines.length > 1
            ? `This deposit will be split across ${lines.length} lines (rent first, then charges).`
            : `${formatGbp(heldGbp)} held deposit — nothing to allocate against the open balance.`}
      </p>
      {lines.length ? (
        <ul className="space-y-2 text-sm">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-rph-border pb-2 last:border-0 last:pb-0"
            >
              <span className="text-rph-fg-secondary">
                {line.label}
                <span
                  className={`ml-2 inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                    line.fullyAllocated
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
                      : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  }`}
                >
                  {line.fullyAllocated ? "Full" : "Partial"}
                </span>
              </span>
              <span className="font-medium tabular-nums text-rph-fg">
                {formatGbp(line.allocatedGbp)}
                {line.rowBalanceAfterGbp > 0.005 ? (
                  <span className="rph-meta ml-2 font-normal">
                    {formatGbp(line.rowBalanceAfterGbp)} remaining
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {surplus > 0.005 ? (
        <p className="rph-meta text-xs text-amber-800 dark:text-amber-200">
          {formatGbp(surplus)} surplus after clearing the balance — company may owe the driver.
        </p>
      ) : null}
      <p className="text-sm font-semibold tabular-nums text-rph-fg">
        After: {settlementBalanceLabel(preview.afterDirection, Math.abs(afterSigned))}
      </p>
      {afterSigned > 0.005 ? (
        <p className="rph-meta text-xs">Remaining debt stays on Payments to collect later.</p>
      ) : null}
    </div>
  );
}

function PayoutFields({
  amountGbp,
  amountPending = false,
  helpText,
  payoutValue,
  onPayoutChange,
  payoutOptions,
  method,
  onMethodChange,
  accountId,
  onAccountChange,
  showAccount,
  paymentAccounts,
  reference,
  onReferenceChange,
}: {
  amountGbp: number;
  /** When true, amount is not confirmed yet (e.g. partial refund before entry). */
  amountPending?: boolean;
  helpText: string;
  payoutValue: string;
  onPayoutChange: (value: string) => void;
  payoutOptions: { value: string; label: string }[];
  method: string;
  onMethodChange: (value: string) => void;
  accountId: string;
  onAccountChange: (value: string) => void;
  showAccount: boolean;
  paymentAccounts: HireBalancePaymentAccountOption[];
  reference: string;
  onReferenceChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-rph-fg-secondary">
        Deposit refund{" "}
        <span className="font-semibold tabular-nums text-rph-fg">
          {amountPending ? `up to ${formatGbp(amountGbp)}` : formatGbp(amountGbp)}
        </span>
        . {helpText}
      </p>
      <FormModalField label="Payout">
        <FormModalSelect
          value={payoutValue}
          aria-label="Payout"
          options={payoutOptions}
          onValueChange={onPayoutChange}
        />
      </FormModalField>
      {payoutValue === "paid_now" ? (
        <>
          <FormModalField label="Payment method">
            <FormModalSelect
              value={method}
              aria-label="Refund method"
              options={HIRE_DEPOSIT_REFUND_METHODS.map((m) => ({
                value: m,
                label: HIRE_PAYMENT_METHOD_LABELS[m] ?? m.replace(/_/g, " "),
              }))}
              onValueChange={onMethodChange}
            />
          </FormModalField>
          {showAccount ? (
            <FormModalField label="Paid from">
              <FormModalSelect
                value={accountId || "__none__"}
                placeholder="Select payment account…"
                aria-label="Paid from account"
                options={[
                  { value: "__none__", label: "Select payment account…" },
                  ...paymentAccounts.map((account) => ({
                    value: account.id,
                    label: `${account.name}${account.isDefault ? " (hire default)" : ""}`,
                  })),
                ]}
                onValueChange={(next) => onAccountChange(next === "__none__" ? "" : next)}
              />
              {!paymentAccounts.length ? (
                <p className="mt-1 text-xs text-rph-fg-muted">Add an account in settings.</p>
              ) : null}
            </FormModalField>
          ) : (
            <p className="rph-muted text-xs">No bank account needed for cash payments.</p>
          )}
          <FormModalField label="Reference (optional)">
            <input
              className="rph-input w-full"
              value={reference}
              onChange={(event) => onReferenceChange(event.target.value)}
              placeholder="Bank reference or note"
            />
          </FormModalField>
        </>
      ) : null}
    </div>
  );
}

export function HireDepositResolveModal({
  open,
  disposition,
  hireGroupId,
  depositHeldGbp,
  currentSignedSettlementGbp,
  unpaidRentGbp,
  unpaidChargesGbp,
  paymentAccounts = [],
  defaultPaymentAccountId = null,
  onClose,
  onSuccess,
}: {
  open: boolean;
  disposition: HireDepositResolveModalDisposition;
  hireGroupId: string;
  depositHeldGbp: number;
  currentSignedSettlementGbp: number;
  unpaidRentGbp: number;
  unpaidChargesGbp: number;
  paymentAccounts?: HireBalancePaymentAccountOption[];
  defaultPaymentAccountId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const heldGbp = Math.max(0, Number(depositHeldGbp) || 0);
  const openDriverBalanceGbp = Math.max(0, Number(currentSignedSettlementGbp) || 0);
  const rentGbp = Math.max(0, Number(unpaidRentGbp) || 0);
  const chargesGbp = Math.max(0, Number(unpaidChargesGbp) || 0);

  const defaultAccountId =
    defaultPaymentAccountId ??
    paymentAccounts.find((account) => account.isDefault)?.id ??
    paymentAccounts[0]?.id ??
    "";

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);

  const [depositDispositionReason, setDepositDispositionReason] = useState("");
  const [depositRefundAmountGbp, setDepositRefundAmountGbp] = useState("");
  const [settlementResolution, setSettlementResolution] =
    useState<HireSettlementResolution>("open_balance");
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState("bank_transfer");
  const [settlementPaymentAccountId, setSettlementPaymentAccountId] = useState(defaultAccountId);
  const [settlementPaymentReference, setSettlementPaymentReference] = useState("");
  const [depositRefundPayout, setDepositRefundPayout] = useState<"paid_now" | "open_balance">(
    "open_balance",
  );
  const [depositRefundPaymentMethod, setDepositRefundPaymentMethod] = useState("bank_transfer");
  const [depositRefundPaymentAccountId, setDepositRefundPaymentAccountId] =
    useState(defaultAccountId);
  const [depositRefundPaymentReference, setDepositRefundPaymentReference] = useState("");
  const [confirmRefundWhileOwes, setConfirmRefundWhileOwes] = useState(false);

  const showDepositRefundAccount = settlementPaymentMethodRequiresAccount(depositRefundPaymentMethod);
  const showSettlementPaymentAccount = settlementPaymentMethodRequiresAccount(settlementPaymentMethod);
  const needsDepositReason = requiresDepositDispositionReason(disposition);

  const preview = useMemo(
    () =>
      buildDepositResolutionPreview({
        currentSignedSettlementGbp,
        depositHeldGbp: heldGbp,
        disposition,
        refundAmountGbp:
          disposition === "refund_partial" && depositRefundAmountGbp.trim()
            ? Number(depositRefundAmountGbp)
            : undefined,
        unpaidRentGbp: rentGbp,
        unpaidChargesGbp: chargesGbp,
      }),
    [
      currentSignedSettlementGbp,
      heldGbp,
      disposition,
      depositRefundAmountGbp,
      rentGbp,
      chargesGbp,
    ],
  );

  const refundDueGbp = preview.depositRefundDueGbp;
  const driverStillOwes = preview.afterSignedSettlementGbp > 0.005;
  const companyOwesAfter = preview.afterSignedSettlementGbp < -0.005;
  // Partial refund: show payout controls immediately (before amount is entered).
  const showSeparateRefundPayout =
    disposition === "refund_partial"
      ? openDriverBalanceGbp > 0.005
      : refundDueGbp > 0.005 && driverStillOwes;
  const showRefundAsSettlement =
    disposition === "refund_partial"
      ? openDriverBalanceGbp <= 0.005
      : companyOwesAfter &&
        depositResolutionShowsSettlementUi({
          disposition,
          afterSignedSettlementGbp: preview.afterSignedSettlementGbp,
        });
  const settlementPayoutOptions =
    preview.settlementResolutions.length > 0
      ? preview.settlementResolutions
      : (["paid_now", "open_balance"] as HireSettlementResolution[]);
  const effectiveSettlementResolution = settlementPayoutOptions.includes(settlementResolution)
    ? settlementResolution
    : (settlementPayoutOptions[0] ?? "open_balance");
  const retainedDepositGbp = Math.max(0, heldGbp - refundDueGbp);
  const refundFullWhileDriverOwes =
    disposition === "refund_full" && openDriverBalanceGbp > 0.005;
  const payoutAmountGbp = refundDueGbp > 0.005 ? refundDueGbp : heldGbp;
  const payoutAmountPending =
    disposition === "refund_partial" && !(refundDueGbp > 0.005);

  const dirty =
    Boolean(depositDispositionReason.trim()) ||
    Boolean(depositRefundAmountGbp.trim()) ||
    depositRefundPayout !== "open_balance" ||
    settlementResolution !== "open_balance" ||
    Boolean(settlementPaymentReference.trim()) ||
    Boolean(depositRefundPaymentReference.trim()) ||
    confirmRefundWhileOwes;

  const refundPayNowValid =
    !showSeparateRefundPayout ||
    depositRefundPayout === "open_balance" ||
    (Boolean(depositRefundPaymentMethod.trim()) &&
      (!showDepositRefundAccount || Boolean(depositRefundPaymentAccountId)));
  const settlementPayNowValid =
    !showRefundAsSettlement ||
    effectiveSettlementResolution !== "paid_now" ||
    (Boolean(settlementPaymentMethod.trim()) &&
      (!showSettlementPaymentAccount || Boolean(settlementPaymentAccountId)));

  const canSubmit =
    (!needsDepositReason || Boolean(depositDispositionReason.trim())) &&
    (disposition !== "refund_partial" ||
      (Boolean(depositRefundAmountGbp.trim()) && refundDueGbp > 0.005)) &&
    refundPayNowValid &&
    (!showRefundAsSettlement || settlementPayoutOptions.includes(effectiveSettlementResolution)) &&
    settlementPayNowValid &&
    (!refundFullWhileDriverOwes || confirmRefundWhileOwes);

  function resetAndClose() {
    setError(null);
    setDiscardOpen(false);
    setDepositDispositionReason("");
    setDepositRefundAmountGbp("");
    setSettlementResolution("open_balance");
    setSettlementPaymentMethod("bank_transfer");
    setSettlementPaymentAccountId(defaultAccountId);
    setSettlementPaymentReference("");
    setDepositRefundPayout("open_balance");
    setDepositRefundPaymentMethod("bank_transfer");
    setDepositRefundPaymentAccountId(defaultAccountId);
    setDepositRefundPaymentReference("");
    setConfirmRefundWhileOwes(false);
    onClose();
  }

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    resetAndClose();
  }

  function submit() {
    startTransition(async () => {
      setError(null);
      const res = await resolveHireDepositDispositionAction({
        hireGroupId,
        depositDisposition: disposition,
        depositDispositionReason: depositDispositionReason || undefined,
        depositRefundAmountGbp:
          disposition === "refund_partial" ? Number(depositRefundAmountGbp) : undefined,
        depositRefundPayout: showSeparateRefundPayout ? depositRefundPayout : undefined,
        depositRefundPaymentMethod:
          showSeparateRefundPayout && depositRefundPayout === "paid_now"
            ? depositRefundPaymentMethod
            : undefined,
        depositRefundPaymentAccountId:
          showSeparateRefundPayout &&
          depositRefundPayout === "paid_now" &&
          showDepositRefundAccount
            ? depositRefundPaymentAccountId || undefined
            : undefined,
        depositRefundPaymentReference:
          showSeparateRefundPayout && depositRefundPayout === "paid_now"
            ? depositRefundPaymentReference || undefined
            : undefined,
        settlementResolution: showRefundAsSettlement
          ? effectiveSettlementResolution
          : driverStillOwes
            ? "open_balance"
            : undefined,
        settlementPaymentMethod:
          showRefundAsSettlement && effectiveSettlementResolution === "paid_now"
            ? settlementPaymentMethod
            : undefined,
        settlementPaymentAccountId:
          showRefundAsSettlement &&
          effectiveSettlementResolution === "paid_now" &&
          showSettlementPaymentAccount
            ? settlementPaymentAccountId || undefined
            : undefined,
        settlementPaymentReference:
          showRefundAsSettlement && effectiveSettlementResolution === "paid_now"
            ? settlementPaymentReference || undefined
            : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess();
      resetAndClose();
    });
  }

  const allocationPreview =
    disposition === "apply_to_balance" ? (
      <DepositAllocationPreview
        heldGbp={heldGbp}
        preview={preview}
        unpaidRentGbp={rentGbp}
        unpaidChargesGbp={chargesGbp}
      />
    ) : null;

  const fields = (
    <div className="space-y-4">
      <FormModalField label="Deposit amount">
        <input
          className="rph-input w-full tabular-nums"
          value={heldGbp.toFixed(2)}
          readOnly
          disabled
          aria-label="Deposit amount"
        />
      </FormModalField>

      {openDriverBalanceGbp > 0.005 ? (
        <p className="text-sm text-rph-fg-secondary">
          Open balance{" "}
          <span className="font-medium tabular-nums text-rph-fg">
            {formatGbp(openDriverBalanceGbp)}
          </span>{" "}
          owed by driver
        </p>
      ) : null}

      {refundFullWhileDriverOwes ? (
        <div className="rph-alert-warn space-y-3" role="alert">
          <div>
            <p className="font-semibold">
              Driver still owes {formatGbp(openDriverBalanceGbp)}
            </p>
            <p className="mt-1 text-[13px] leading-snug opacity-90">
              Returning the full deposit does not clear that balance. The deposit is paid back to
              the driver and the open hire debt stays on Payments to collect later.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-amber-300/80 bg-rph-raised/70 px-2.5 py-2 dark:border-amber-800/60">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmRefundWhileOwes}
              onChange={(event) => setConfirmRefundWhileOwes(event.target.checked)}
            />
            <span>
              <span className="text-sm font-semibold text-rph-fg">
                I understand — refund the deposit and leave the debt open
              </span>
              <span className="mt-0.5 block text-xs text-rph-fg-secondary">
                Confirm before returning the full deposit while the driver still owes.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {disposition === "refund_partial" ? (
        <FormModalField label="Refund amount (£)">
          <input
            className="rph-input w-full"
            inputMode="decimal"
            value={depositRefundAmountGbp}
            onChange={(event) => setDepositRefundAmountGbp(event.target.value)}
            placeholder={`Max ${heldGbp.toFixed(2)}`}
          />
        </FormModalField>
      ) : null}

      {needsDepositReason ? (
        <FormModalField label={depositDispositionReasonLabel(disposition)}>
          <textarea
            className="rph-input min-h-20 w-full"
            value={depositDispositionReason}
            onChange={(event) => setDepositDispositionReason(event.target.value)}
          />
        </FormModalField>
      ) : null}

      {disposition !== "apply_to_balance" &&
      disposition !== "forfeit" &&
      !showSeparateRefundPayout &&
      !showRefundAsSettlement &&
      refundDueGbp > 0.005 ? (
        <p className="text-sm text-rph-fg-secondary">
          Refund due {formatGbp(refundDueGbp)}
          {retainedDepositGbp > 0.005
            ? ` · company keeps ${formatGbp(retainedDepositGbp)}`
            : ""}
          . After:{" "}
          <span className="font-medium text-rph-fg">
            {settlementBalanceLabel(
              preview.afterDirection,
              Math.abs(preview.afterSignedSettlementGbp),
            )}
          </span>
        </p>
      ) : null}

      {showSeparateRefundPayout ? (
        <PayoutFields
          amountGbp={payoutAmountGbp}
          amountPending={payoutAmountPending}
          helpText={`Payout to the driver${
            !payoutAmountPending && retainedDepositGbp > 0.005
              ? ` · company keeps ${formatGbp(retainedDepositGbp)}`
              : ""
          }. Separate from hire debt.`}
          payoutValue={depositRefundPayout}
          onPayoutChange={(value) =>
            setDepositRefundPayout(value as "paid_now" | "open_balance")
          }
          payoutOptions={[
            { value: "open_balance", label: "Pay later" },
            { value: "paid_now", label: "Pay now — record payout" },
          ]}
          method={depositRefundPaymentMethod}
          onMethodChange={(next) => {
            setDepositRefundPaymentMethod(next);
            if (!settlementPaymentMethodRequiresAccount(next)) {
              setDepositRefundPaymentAccountId("");
            }
          }}
          accountId={depositRefundPaymentAccountId}
          onAccountChange={setDepositRefundPaymentAccountId}
          showAccount={showDepositRefundAccount}
          paymentAccounts={paymentAccounts}
          reference={depositRefundPaymentReference}
          onReferenceChange={setDepositRefundPaymentReference}
        />
      ) : null}

      {showRefundAsSettlement ? (
        <PayoutFields
          amountGbp={
            payoutAmountPending
              ? heldGbp
              : Math.abs(preview.afterSignedSettlementGbp) > 0.005
                ? Math.abs(preview.afterSignedSettlementGbp)
                : payoutAmountGbp
          }
          amountPending={payoutAmountPending}
          helpText="How you pay this amount back to the driver."
          payoutValue={effectiveSettlementResolution}
          onPayoutChange={(value) =>
            setSettlementResolution(value as HireSettlementResolution)
          }
          payoutOptions={settlementPayoutOptions.map((resolution) => ({
            value: resolution,
            label: resolution === "paid_now" ? "Pay now — record payout" : "Pay later",
          }))}
          method={settlementPaymentMethod}
          onMethodChange={(next) => {
            setSettlementPaymentMethod(next);
            if (!settlementPaymentMethodRequiresAccount(next)) {
              setSettlementPaymentAccountId("");
            }
          }}
          accountId={settlementPaymentAccountId}
          onAccountChange={setSettlementPaymentAccountId}
          showAccount={showSettlementPaymentAccount}
          paymentAccounts={paymentAccounts}
          reference={settlementPaymentReference}
          onReferenceChange={setSettlementPaymentReference}
        />
      ) : null}

      {disposition === "forfeit" ? (
        <p className="text-sm text-rph-fg-secondary">
          After:{" "}
          <span className="font-medium text-rph-fg">
            {settlementBalanceLabel(
              preview.afterDirection,
              Math.abs(preview.afterSignedSettlementGbp),
            )}
          </span>
        </p>
      ) : null}

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
    </div>
  );

  return (
    <FormModalShell
      open={open}
      titleId="hire-deposit-resolve-modal-title"
      title={hireDepositDispositionLabel(disposition)}
      description={modalDescription(disposition)}
      showDraftActions={false}
      allowMaximize
      pending={pending}
      pendingMessage="Resolving deposit…"
      isDirty={dirty}
      onRequestClose={requestClose}
      onMaximizedChange={setMaximized}
      discardConfirmOpen={discardOpen}
      onConfirmDiscard={resetAndClose}
      onCancelDiscard={() => setDiscardOpen(false)}
      maxWidthClass="max-w-2xl"
      footer={
        <>
          <button type="button" className={formModalBtnGhost} disabled={pending} onClick={requestClose}>
            Cancel
          </button>
          <button
            type="button"
            className={formModalBtnContinue}
            disabled={pending || !canSubmit}
            onClick={submit}
          >
            {pending ? "Resolving…" : `Confirm — ${hireDepositDispositionLabel(disposition)}`}
          </button>
        </>
      }
    >
      {maximized && disposition === "apply_to_balance" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
          {fields}
          {allocationPreview}
        </div>
      ) : (
        <div className="space-y-4">
          {fields}
          {allocationPreview}
        </div>
      )}
    </FormModalShell>
  );
}
