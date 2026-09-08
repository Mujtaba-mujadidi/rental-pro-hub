"use client";

import type { HireBalancePaymentAccountOption } from "@/app/actions/rental-hire-termination";
import {
  HireDepositResolveModal,
  type HireDepositResolveModalDisposition,
} from "@/components/fleet/hire-payments/hire-deposit-resolve-modal";
import { RphSelect } from "@/components/forms/rph-select";
import { openBalanceDirection } from "@/lib/fleet/hire-open-balance";
import {
  defaultDepositDisposition,
  getDepositDispositionOptions,
  type HireSettlementResolution,
} from "@/lib/fleet/hire-settlement-resolution";
import {
  settlementBalanceLabel,
  type HireDepositDisposition,
  type HireTerminationAccountsSummary,
} from "@/lib/fleet/hire-termination-summary";
import { formatGbp } from "@/lib/fleet/maintenance";
import { useEffect, useMemo, useState } from "react";

/** Payload shape used when End hire finalises deposit in the same commit. */
export type HireDepositFinalizePayload = {
  depositDisposition: HireDepositDisposition;
  depositDispositionReason?: string;
  depositRefundAmountGbp?: number;
  depositRefundPayout?: "paid_now" | "open_balance";
  depositRefundPaymentMethod?: string;
  depositRefundPaymentAccountId?: string;
  depositRefundPaymentReference?: string;
  settlementResolution?: HireSettlementResolution;
  settlementPaymentMethod?: string;
  settlementPaymentAccountId?: string;
  settlementPaymentReference?: string;
};

function actionOptionLabel(disposition: HireDepositResolveModalDisposition): string {
  if (disposition === "apply_to_balance") return "Apply to balance";
  if (disposition === "refund_full") return "Return full deposit";
  if (disposition === "refund_partial") return "Partial refund";
  return "Keep deposit";
}

export function HireDepositDispositionResolveCard({
  hireGroupId,
  terminationSummary,
  depositHeldGbp,
  currentSignedSettlementGbp,
  unpaidChargesGbp = 0,
  paymentAccounts = [],
  defaultPaymentAccountId = null,
  onSuccess,
}: {
  hireGroupId: string;
  terminationSummary: HireTerminationAccountsSummary;
  /** Amount actually received and still held — not the contractual deposit. */
  depositHeldGbp: number;
  currentSignedSettlementGbp: number;
  /** Outstanding extras / return charges used for apply-to-balance preview. */
  unpaidChargesGbp?: number;
  paymentAccounts?: HireBalancePaymentAccountOption[];
  defaultPaymentAccountId?: string | null;
  onSuccess: () => void;
}) {
  const heldGbp = Math.max(0, Number(depositHeldGbp) || 0);
  const currentSigned = Number(currentSignedSettlementGbp) || 0;
  const currentDirection = openBalanceDirection(currentSigned);

  const depositOptions = useMemo(
    () =>
      getDepositDispositionOptions(currentSigned).filter(
        (option) => option.value !== "hold_pending",
      ),
    [currentSigned],
  );

  const recommended = defaultDepositDisposition(currentSigned) as HireDepositResolveModalDisposition;
  const [selectedDisposition, setSelectedDisposition] =
    useState<HireDepositResolveModalDisposition>(recommended);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const selectedStillAllowed = depositOptions.some(
      (option) => option.value === selectedDisposition && option.allowed,
    );
    if (!selectedStillAllowed) {
      setSelectedDisposition(recommended);
    }
  }, [depositOptions, recommended, selectedDisposition]);

  const selectedOption = depositOptions.find((option) => option.value === selectedDisposition);
  const canContinue = Boolean(selectedOption?.allowed);

  return (
    <section className="hire-ended-deposit-review">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="hire-balance-panel-kicker">Deposit review</p>
          <h2 className="mt-1 text-base font-semibold text-rph-fg">
            Deposit held
            <span className="tabular-nums"> · {formatGbp(heldGbp)}</span>
          </h2>
          <p className="mt-1 text-sm text-rph-fg-secondary">
            Open balance{" "}
            <span className="font-medium text-rph-fg">
              {settlementBalanceLabel(currentDirection, Math.abs(currentSigned))}
            </span>
            {terminationSummary.depositGbp > heldGbp + 0.005 ? (
              <span className="text-rph-fg-muted">
                {" "}
                · contract {formatGbp(terminationSummary.depositGbp)}
              </span>
            ) : null}
          </p>
        </div>
        <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
          Awaiting review
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <label className="text-xs font-medium text-rph-fg-muted" htmlFor="deposit-resolve-action">
            Deposit action
          </label>
          <RphSelect
            value={selectedDisposition}
            aria-label="Deposit action"
            options={depositOptions.map((option) => ({
              value: option.value,
              label: option.allowed
                ? actionOptionLabel(option.value as HireDepositResolveModalDisposition)
                : `${actionOptionLabel(option.value as HireDepositResolveModalDisposition)} — ${option.disabledReason ?? "Unavailable"}`,
              disabled: !option.allowed,
            }))}
            onValueChange={(value) =>
              setSelectedDisposition(value as HireDepositResolveModalDisposition)
            }
          />
        </div>
        <button
          type="button"
          className="rph-btn-primary shrink-0"
          disabled={!canContinue}
          title={!canContinue ? selectedOption?.disabledReason : undefined}
          onClick={() => setModalOpen(true)}
        >
          Continue
        </button>
      </div>

      {modalOpen ? (
        <HireDepositResolveModal
          open
          disposition={selectedDisposition}
          hireGroupId={hireGroupId}
          depositHeldGbp={heldGbp}
          currentSignedSettlementGbp={currentSigned}
          unpaidRentGbp={Math.max(0, Number(terminationSummary.signedRentBalanceGbp) || 0)}
          unpaidChargesGbp={Math.max(0, Number(unpaidChargesGbp) || 0)}
          paymentAccounts={paymentAccounts}
          defaultPaymentAccountId={defaultPaymentAccountId}
          onClose={() => setModalOpen(false)}
          onSuccess={onSuccess}
        />
      ) : null}
    </section>
  );
}
