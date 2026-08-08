"use client";

import { RphSelect } from "@/components/forms/rph-select";
import { recordHireBalancePaymentAction } from "@/app/actions/rental-hire-termination";
import type { HireBalancePaymentAccountOption } from "@/app/actions/rental-hire-termination";
import { settlementBalanceLabel } from "@/lib/fleet/hire-termination-summary";
import type { HireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import { formatGbp } from "@/lib/fleet/maintenance";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export function HireSettlementBalancePaymentCard({
  hireGroupId,
  settlementBalance,
  paymentAccounts,
  defaultPaymentAccountId,
  onSuccess,
}: {
  hireGroupId: string;
  settlementBalance: HireWorkspaceSettlementBalance;
  paymentAccounts: HireBalancePaymentAccountOption[];
  defaultPaymentAccountId: string | null;
  onSuccess: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentAccountId, setPaymentAccountId] = useState("");

  const openBalanceGbp = settlementBalance.openBalanceGbp;

  useEffect(() => {
    setPaymentAccountId((current) => {
      if (current) return current;
      return (
        defaultPaymentAccountId ??
        paymentAccounts.find((account) => account.isDefault)?.id ??
        paymentAccounts[0]?.id ??
        ""
      );
    });
  }, [defaultPaymentAccountId, paymentAccounts]);

  const useRemainingBalance = () => {
    setPaymentAmount(openBalanceGbp.toFixed(2));
    setError(null);
  };

  const recordPayment = (amountGbp: number) => {
    startTransition(async () => {
      setError(null);
      const res = await recordHireBalancePaymentAction({
        hireGroupId,
        amountGbp,
        paymentMethod,
        paymentAccountId: paymentAccountId || null,
        paymentReference,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPaymentAmount("");
      setPaymentReference("");
      onSuccess();
    });
  };

  const submitForm = () => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    recordPayment(amount);
  };

  const clearRemainingBalance = () => {
    if (!paymentAccountId) {
      setError("Select the bank account used for this payment.");
      return;
    }
    recordPayment(openBalanceGbp);
  };

  return (
    <section className="rph-card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-rph-fg">Pay final balance</h2>
          <p className="rph-muted mt-1 text-sm">
            Outstanding:{" "}
            <span className="font-medium text-rph-fg">
              {settlementBalanceLabel(
                settlementBalance.settlementDirection,
                settlementBalance.openBalanceGbp,
              )}
            </span>
          </p>
        </div>
        <Link href={`/rental/balances/${hireGroupId}`} className="rph-link text-sm">
          Full balance workspace
        </Link>
      </div>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-medium text-rph-fg-muted">Amount (£)</span>
          <div className="flex gap-2">
            <input
              className="rph-input min-w-0 flex-1"
              inputMode="decimal"
              placeholder="0.00"
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
            />
            <button
              type="button"
              className="rph-btn-ghost shrink-0 whitespace-nowrap px-3 text-xs"
              onClick={useRemainingBalance}
              disabled={pending}
            >
              Remaining ({formatGbp(openBalanceGbp)})
            </button>
          </div>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-rph-fg-muted">Method</span>
          <RphSelect
            value={paymentMethod}
            aria-label="Payment method"
            options={Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            onValueChange={setPaymentMethod}
          />
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-rph-fg-muted">Payment account</span>
          <RphSelect
            value={paymentAccountId || "__none__"}
            placeholder="Select payment account…"
            aria-label="Payment account"
            options={[
              { value: "__none__", label: "Select payment account…" },
              ...paymentAccounts.map((account) => ({
                value: account.id,
                label: `${account.name}${account.isDefault ? " (hire default)" : ""}`,
              })),
            ]}
            onValueChange={(value) => setPaymentAccountId(value === "__none__" ? "" : value)}
          />
        </label>

        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-rph-fg-muted">Reference (optional)</span>
          <input
            className="rph-input w-full"
            placeholder="Payment reference"
            value={paymentReference}
            onChange={(event) => setPaymentReference(event.target.value)}
          />
        </label>
      </div>

      {!paymentAccounts.length ? (
        <p className="rph-muted text-xs">No active payment accounts. Add one in rental settings.</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rph-btn-primary"
          onClick={clearRemainingBalance}
          disabled={pending || !paymentAccounts.length || !paymentAccountId}
        >
          {pending ? "Recording…" : `Clear remaining balance (${formatGbp(openBalanceGbp)})`}
        </button>
        <button
          type="button"
          className="rph-btn-ghost"
          onClick={submitForm}
          disabled={pending || !paymentAmount.trim() || !paymentAccountId}
        >
          Record partial payment
        </button>
      </div>
    </section>
  );
}
