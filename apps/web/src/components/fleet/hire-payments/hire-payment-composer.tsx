"use client";

import type { HirePaymentAccountDisplay, HirePaymentPageRow } from "@/app/actions/hire-payments";
import { formatUkDate, ukTodayYmd } from "@/lib/datetime/uk";
import { allocatePaymentAcrossRows } from "@/lib/fleet/hire-payment-allocation";
import { defaultHirePaymentApplyTo, type HirePaymentApplyTo } from "@/lib/fleet/hire-active-balance-display";
import { accruedRentOutstandingGbp, payBalanceToDateGbp } from "@/lib/fleet/hire-active-payments-display";
import {
  allocateExtraChargePaymentAcrossRows,
  type ExtraChargePaymentAllocationRow,
} from "@/lib/fleet/hire-driver-charge-payment";
import type { HirePaymentScheduleRowInput } from "@/lib/fleet/hire-payment-summary";
import { formatGbp } from "@/lib/fleet/maintenance";
import {
  HIRE_PAYMENT_METHOD_LABELS,
  settlementPaymentMethodRequiresAccount,
} from "@/lib/fleet/hire-settlement-payment-method";
import { HIRE_DEPOSIT_REFUND_METHODS } from "@/lib/fleet/hire-termination-summary";
import { FormModalSelect } from "@/components/forms/form-modal-select";
import { formModalBtnContinue, formModalBtnGhost } from "@/components/forms/form-modal-actions";
import { FormModalShell } from "@/components/forms/form-modal-shell";
import { FormModalField } from "@/components/forms/form-modal-step-progress";
import type { HireBalancePaymentAccountOption } from "@/app/actions/rental-hire-termination";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

function parseAmountInput(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/£/g, "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function toAllocationInputs(rows: readonly HirePaymentPageRow[]): HirePaymentScheduleRowInput[] {
  return rows.map((row) => ({
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind,
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: row.pendingSubmittedGbp,
    sortOrder: row.sortOrder,
  }));
}

export type HirePaymentComposerSubmitInput = {
  amountGbp: number;
  paymentReference: string;
  paymentMethod?: string;
  paymentAccountId?: string | null;
  paidOnYmd?: string;
  notes?: string;
  allocationKind: HirePaymentApplyTo;
};

export function HirePaymentComposer({
  scheduleRows = [],
  scheduleBalanceGbp = 0,
  paymentAccount,
  staffPaymentAccounts,
  defaultStaffPaymentAccountId,
  canSubmit,
  submitLabel,
  triggerLabel = "Record payment",
  triggerClassName = "rph-btn-primary h-9 px-3 text-sm",
  asDriver = false,
  allocationKind = "schedule",
  allowAllocationChoice = false,
  preferredAllocationKind,
  outstandingExtraChargesGbp = 0,
  extraChargeRows = [],
  extraChargesSelectable,
  onAllocationChange,
  onSubmit,
  onSuccess,
  busy,
}: {
  /** Kept for call-site consistency; submit auth still uses hireGroupId in onSubmit. */
  hireGroupId: string;
  /** Authorised schedule rows already loaded for this hire — used for instant local preview. */
  scheduleRows?: readonly HirePaymentPageRow[];
  /** Full sheet outstanding — used to enable recording when prepayment is possible. */
  scheduleBalanceGbp?: number;
  paymentAccount: HirePaymentAccountDisplay | null;
  staffPaymentAccounts?: HireBalancePaymentAccountOption[];
  defaultStaffPaymentAccountId?: string | null;
  canSubmit: boolean;
  submitLabel: string;
  triggerLabel?: string;
  triggerClassName?: string;
  asDriver?: boolean;
  allocationKind?: HirePaymentApplyTo;
  /** Account statement / shared record: let staff choose rent vs extra charges. */
  allowAllocationChoice?: boolean;
  preferredAllocationKind?: HirePaymentApplyTo;
  outstandingExtraChargesGbp?: number;
  extraChargeRows?: readonly ExtraChargePaymentAllocationRow[];
  extraChargesSelectable?: boolean;
  onAllocationChange?: (rowIds: string[]) => void;
  onSubmit: (input: HirePaymentComposerSubmitInput) => Promise<{ ok: boolean; error?: string }>;
  onSuccess?: () => void;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentAccountId, setPaymentAccountId] = useState(
    () => defaultStaffPaymentAccountId ?? staffPaymentAccounts?.[0]?.id ?? "",
  );
  const [paidOn, setPaidOn] = useState(ukTodayYmd());
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitPending, startSubmit] = useTransition();
  const extraOutstandingGbp = Math.max(0, outstandingExtraChargesGbp);
  const extrasSelectable =
    extraChargesSelectable ?? extraOutstandingGbp > 0.005;
  const dueRentGbp = useMemo(() => accruedRentOutstandingGbp(scheduleRows), [scheduleRows]);
  const rentSelectable = allowAllocationChoice ? dueRentGbp > 0.005 : scheduleBalanceGbp > 0.005;
  const defaultApplyTo = allowAllocationChoice
    ? defaultHirePaymentApplyTo({
        rentOutstandingGbp: dueRentGbp,
        extraOutstandingGbp,
        extraChargesSelectable: extrasSelectable,
        preferred: preferredAllocationKind,
      })
    : allocationKind;
  const [chosenKind, setChosenKind] = useState<HirePaymentApplyTo>(defaultApplyTo);

  const allocationInputs = useMemo(() => toAllocationInputs(scheduleRows), [scheduleRows]);
  const effectiveKind = allowAllocationChoice ? chosenKind : allocationKind;
  const isExtraCharges = effectiveKind === "extra_charges";
  const balanceShortcutGbp = useMemo(
    () => (isExtraCharges ? extraOutstandingGbp : payBalanceToDateGbp(scheduleRows)),
    [extraOutstandingGbp, isExtraCharges, scheduleRows],
  );
  const scheduleAllocation = useMemo(() => {
    if (!open || isExtraCharges) return null;
    const parsed = parseAmountInput(amount);
    if (!parsed) return null;
    return allocatePaymentAcrossRows(parsed, allocationInputs, ukTodayYmd());
  }, [allocationInputs, amount, isExtraCharges, open]);
  const extraAllocation = useMemo(() => {
    if (!open || !isExtraCharges) return null;
    const parsed = parseAmountInput(amount);
    if (!parsed) return null;
    return allocateExtraChargePaymentAcrossRows(parsed, extraChargeRows);
  }, [amount, extraChargeRows, isExtraCharges, open]);
  const highlightedIds = useMemo(
    () =>
      isExtraCharges
        ? extraAllocation?.allocations.map((line) => line.rowId) ?? []
        : scheduleAllocation?.allocations.map((line) => line.rowId) ?? [],
    [extraAllocation, isExtraCharges, scheduleAllocation],
  );

  const closeModal = useCallback(() => {
    setOpen(false);
    setMaximized(false);
    setDiscardOpen(false);
    setAmount("");
    setReference("");
    setPaymentMethod("bank_transfer");
    setPaymentAccountId(defaultStaffPaymentAccountId ?? staffPaymentAccounts?.[0]?.id ?? "");
    setPaidOn(ukTodayYmd());
    setNotes("");
    setSubmitError(null);
    setChosenKind(defaultApplyTo);
    onAllocationChange?.([]);
  }, [defaultApplyTo, defaultStaffPaymentAccountId, onAllocationChange, staffPaymentAccounts]);

  useEffect(() => {
    if (!allowAllocationChoice) return;
    if (chosenKind === "extra_charges" && !extrasSelectable && rentSelectable) {
      setChosenKind("schedule");
    } else if (chosenKind === "schedule" && !rentSelectable && extrasSelectable) {
      setChosenKind("extra_charges");
    }
  }, [allowAllocationChoice, chosenKind, extrasSelectable, rentSelectable]);

  useEffect(() => {
    if (!open) return;
    if (!highlightedIds.length) {
      onAllocationChange?.([]);
      return;
    }
    const highlightTimer = setTimeout(() => {
      onAllocationChange?.(highlightedIds);
    }, 250);
    return () => clearTimeout(highlightTimer);
  }, [highlightedIds, onAllocationChange, open]);

  const dirty =
    Boolean(amount.trim()) ||
    Boolean(reference.trim()) ||
    Boolean(notes.trim()) ||
    paymentMethod !== "bank_transfer" ||
    paidOn !== ukTodayYmd() ||
    (allowAllocationChoice && chosenKind !== defaultApplyTo);

  const requestClose = useCallback(() => {
    if (submitPending) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    closeModal();
  }, [closeModal, dirty, submitPending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitPending && !discardOpen) requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [discardOpen, open, requestClose, submitPending]);

  function handleSubmit() {
    const parsed = parseAmountInput(amount);
    if (!parsed) {
      setSubmitError("Enter a valid payment amount.");
      return;
    }
    if (isExtraCharges) {
      if (parsed - extraOutstandingGbp > 0.005) {
        setSubmitError("Amount exceeds outstanding extra charges.");
        return;
      }
      if (!extraAllocation?.allocations.length) {
        setSubmitError("No outstanding extra charges to allocate this payment to.");
        return;
      }
    } else if (!scheduleAllocation?.allocations.length) {
      setSubmitError("No outstanding balance to allocate this payment to.");
      return;
    }
    if (!asDriver && settlementPaymentMethodRequiresAccount(paymentMethod) && !paymentAccountId) {
      setSubmitError("Select the payment account this money was paid into.");
      return;
    }
    setSubmitError(null);
    startSubmit(async () => {
      const res = await onSubmit({
        amountGbp: parsed,
        paymentReference: reference,
        allocationKind: effectiveKind,
        ...(asDriver
          ? {}
          : {
              paymentMethod,
              paymentAccountId: settlementPaymentMethodRequiresAccount(paymentMethod)
                ? paymentAccountId
                : null,
              paidOnYmd: paidOn,
              notes,
            }),
      });
      if (!res.ok) {
        setSubmitError(res.error ?? "Could not submit payment.");
        return;
      }
      closeModal();
      onSuccess?.();
    });
  }

  const fieldsDisabled = busy || submitPending || !canSubmit;
  const parsedAmount = parseAmountInput(amount);
  const submitDisabled = isExtraCharges
    ? fieldsDisabled || parsedAmount == null || !extraAllocation?.allocations.length
    : fieldsDisabled || !scheduleAllocation?.allocations.length;
  const triggerDisabled =
    fieldsDisabled ||
    (allowAllocationChoice
      ? !rentSelectable && !extrasSelectable
      : isExtraCharges
        ? extraOutstandingGbp <= 0.005
        : scheduleBalanceGbp <= 0);

  if (!canSubmit) return null;

  const description = isExtraCharges
    ? asDriver
      ? "Enter the amount paid — we allocate it to outstanding extra charges in date order. The company will review this before it is marked paid."
      : "Enter the amount paid — we allocate it to outstanding extra charges in date order, including partial cover on the last charge."
    : "Enter the amount paid — we allocate it to outstanding periods in date order, including future periods where the payment covers them in full or in part.";

  const allocationPreview =
    !isExtraCharges && scheduleAllocation?.allocations.length ? (
      <AllocationPreview
        kind="schedule"
        lines={scheduleAllocation.allocations.map((line) => ({
          rowId: line.rowId,
          label:
            line.rowKind === "deposit"
              ? "Deposit"
              : `${formatUkDate(line.periodStart)} – ${formatUkDate(line.periodEnd)}`,
          allocatedGbp: line.allocatedGbp,
          rowBalanceAfterGbp: line.rowBalanceAfterGbp,
          fullyAllocated: line.fullyAllocated,
        }))}
        unallocatedGbp={scheduleAllocation.unallocatedGbp}
        totalOutstandingGbp={scheduleAllocation.totalOutstandingGbp}
      />
    ) : isExtraCharges && extraAllocation?.allocations.length ? (
      <AllocationPreview
        kind="extra_charges"
        lines={extraAllocation.allocations}
        unallocatedGbp={extraAllocation.unallocatedGbp}
        totalOutstandingGbp={extraAllocation.totalOutstandingGbp}
      />
    ) : null;

  const fields = (
    <div className="space-y-4">
      {allowAllocationChoice ? (
        <FormModalField label="Apply payment to">
          <FormModalSelect
            value={effectiveKind}
            aria-label="Apply payment to"
            disabled={fieldsDisabled}
            options={[
              {
                value: "schedule",
                label: rentSelectable
                  ? `Hire rent (${formatGbp(dueRentGbp)} due)`
                  : "Hire rent (nothing due)",
                disabled: !rentSelectable,
              },
              {
                value: "extra_charges",
                label: extrasSelectable
                  ? `Extra charges (${formatGbp(extraOutstandingGbp)} outstanding)`
                  : extraOutstandingGbp > 0.005
                    ? "Extra charges (payment pending approval)"
                    : "Extra charges (nothing outstanding)",
                disabled: !extrasSelectable,
              },
            ]}
            onValueChange={(value) => {
              setChosenKind(value as HirePaymentApplyTo);
              setSubmitError(null);
            }}
          />
        </FormModalField>
      ) : null}

      {paymentAccount ? (
        <div className="rounded-lg border border-rph-border bg-rph-page px-3 py-2 text-sm">
          <p className="font-medium text-rph-fg">Pay to: {paymentAccount.name}</p>
          {paymentAccount.payeeName ? (
            <p className="text-rph-fg-secondary">{paymentAccount.payeeName}</p>
          ) : null}
          {paymentAccount.sortCode || paymentAccount.accountNumberMasked ? (
            <p className="rph-meta text-xs">
              {[paymentAccount.sortCode, paymentAccount.accountNumberMasked].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <FormModalField label="Amount (£)" className="min-w-[10rem] flex-1">
          <input
            className="rph-input w-full tabular-nums"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            disabled={fieldsDisabled}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormModalField>
        <button
          type="button"
          className="rph-btn-ghost h-10 shrink-0 px-3 text-xs"
          disabled={fieldsDisabled || balanceShortcutGbp <= 0}
          onClick={() => setAmount(balanceShortcutGbp.toFixed(2))}
        >
          Pay {isExtraCharges ? "outstanding extras" : "balance to date"} ({formatGbp(balanceShortcutGbp)})
        </button>
      </div>

      <FormModalField label="Payment reference (optional)">
        <input
          className="rph-input w-full"
          value={reference}
          disabled={fieldsDisabled}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Bank reference or note"
        />
      </FormModalField>

      {!asDriver ? (
        <>
          <FormModalField label="Payment method">
            <FormModalSelect
              value={paymentMethod}
              aria-label="Payment method"
              disabled={fieldsDisabled}
              options={HIRE_DEPOSIT_REFUND_METHODS.map((value) => ({
                value,
                label: HIRE_PAYMENT_METHOD_LABELS[value],
              }))}
              onValueChange={(value) => {
                setPaymentMethod(value);
                if (!settlementPaymentMethodRequiresAccount(value)) setPaymentAccountId("");
              }}
            />
          </FormModalField>
          {settlementPaymentMethodRequiresAccount(paymentMethod) ? (
            <FormModalField label="Paid into">
              <FormModalSelect
                value={paymentAccountId || "__none__"}
                aria-label="Paid into account"
                disabled={fieldsDisabled}
                options={[
                  { value: "__none__", label: "Select payment account…" },
                  ...(staffPaymentAccounts ?? []).map((account) => ({
                    value: account.id,
                    label: `${account.name}${account.isDefault ? " (hire default)" : ""}`,
                  })),
                ]}
                onValueChange={(value) => setPaymentAccountId(value === "__none__" ? "" : value)}
              />
            </FormModalField>
          ) : (
            <p className="rph-muted text-xs">No bank account needed for cash payments.</p>
          )}
          <FormModalField label="Date">
            <input
              type="date"
              className="rph-input w-full"
              value={paidOn}
              disabled={fieldsDisabled}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </FormModalField>
          <FormModalField label="Description (optional)">
            <textarea
              className="rph-input min-h-20 w-full"
              value={notes}
              disabled={fieldsDisabled}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormModalField>
        </>
      ) : null}

      {submitError ? <p className="rph-alert-error text-sm">{submitError}</p> : null}
    </div>
  );

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        disabled={triggerDisabled}
        onClick={() => {
          setChosenKind(defaultApplyTo);
          setOpen(true);
          if (defaultApplyTo === "extra_charges" && extraOutstandingGbp > 0.005 && !amount) {
            setAmount(extraOutstandingGbp.toFixed(2));
          }
        }}
      >
        {triggerLabel}
      </button>

      <FormModalShell
        open={open}
        titleId="hire-payment-modal-title"
        title={triggerLabel}
        description={description}
        showDraftActions={false}
        allowMaximize
        pending={submitPending}
        pendingMessage="Submitting…"
        isDirty={dirty}
        onRequestClose={requestClose}
        onMaximizedChange={setMaximized}
        discardConfirmOpen={discardOpen}
        onConfirmDiscard={closeModal}
        onCancelDiscard={() => setDiscardOpen(false)}
        maxWidthClass="max-w-2xl"
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <button type="button" className={formModalBtnGhost} disabled={fieldsDisabled} onClick={requestClose}>
              Cancel
            </button>
            <button
              type="button"
              className={formModalBtnContinue}
              disabled={submitDisabled}
              onClick={handleSubmit}
            >
              {submitPending ? "Submitting…" : submitLabel}
            </button>
          </div>
        }
      >
        {maximized ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
            {fields}
            {allocationPreview ?? (
              <p className="text-sm text-rph-fg-secondary">Enter an amount to see how this payment will be allocated.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {fields}
            {allocationPreview}
          </div>
        )}
      </FormModalShell>
    </>
  );
}

function AllocationPreview({
  kind,
  lines,
  unallocatedGbp,
  totalOutstandingGbp,
}: {
  kind: "schedule" | "extra_charges";
  lines: readonly {
    rowId: string;
    label: string;
    allocatedGbp: number;
    rowBalanceAfterGbp: number;
    fullyAllocated: boolean;
  }[];
  unallocatedGbp: number;
  totalOutstandingGbp: number;
}) {
  const noun = kind === "extra_charges" ? "charge" : "period";
  return (
    <div className="space-y-2 rounded-lg border border-rph-border bg-rph-page p-3">
      <p className="text-sm font-medium text-rph-fg">Allocation preview</p>
      <p className="rph-meta text-xs">
        {lines.length === 1
          ? `This payment will be applied to the ${noun} below.`
          : `This payment will be split across ${lines.length} ${noun}s (highlighted in the table).`}
      </p>
      <ul className="space-y-2 text-sm">
        {lines.map((line) => (
          <li
            key={line.rowId}
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
      {unallocatedGbp > 0.005 ? (
        <p className="rph-meta text-xs text-amber-800 dark:text-amber-200">
          {formatGbp(unallocatedGbp)} exceeds the outstanding {kind === "extra_charges" ? "extra charges" : "sheet balance"} (
          {formatGbp(totalOutstandingGbp)}) and will not be allocated.
        </p>
      ) : null}
    </div>
  );
}
