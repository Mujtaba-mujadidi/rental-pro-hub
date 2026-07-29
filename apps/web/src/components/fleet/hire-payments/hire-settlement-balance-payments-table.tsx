"use client";

import type { HireBalancePaymentRow } from "@/app/actions/rental-hire-termination";
import { formatUkDateTime } from "@/lib/datetime/uk";
import {
  hireLedgerPaymentTypeLabel,
  summarizeHireSettlementLedger,
  type HireSettlementLedgerSummary,
} from "@/lib/fleet/hire-payments-ledger";
import { formatGbp } from "@/lib/fleet/maintenance";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export type HireSettlementBalancePaymentRow = HireBalancePaymentRow & {
  direction: "received_from_driver" | "paid_to_driver";
};

function LedgerTotals({ summary }: { summary: HireSettlementLedgerSummary }) {
  return (
    <div className="grid gap-3 border-b border-rph-border bg-rph-chrome/40 px-4 py-3 sm:grid-cols-3">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-rph-fg-muted">Money in</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
          {formatGbp(summary.totalReceivedGbp)}
        </p>
        {summary.driverChargeReceivedGbp > 0 ? (
          <p className="text-[10px] text-rph-fg-muted">
            Includes {formatGbp(summary.driverChargeReceivedGbp)} damage charges
          </p>
        ) : null}
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-rph-fg-muted">Money out</p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-rph-fg">
          {formatGbp(summary.totalPaidGbp)}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-rph-fg-muted">
          Net for this hire
        </p>
        <p className="mt-0.5 text-sm font-semibold tabular-nums text-rph-fg">
          {formatGbp(summary.netCashGbp)}
        </p>
      </div>
    </div>
  );
}

export function HireSettlementBalancePaymentsTable({
  payments,
  contractEnded = false,
}: {
  payments: HireSettlementBalancePaymentRow[];
  contractEnded?: boolean;
}) {
  if (!payments.length) return null;

  const summary = summarizeHireSettlementLedger(payments);

  return (
    <section className="overflow-hidden rounded-xl border border-rph-border">
      <div className="border-b border-rph-border bg-rph-chrome px-4 py-3">
        <h2 className="text-sm font-semibold text-rph-fg">
          {contractEnded ? "Money in and out (after contract end)" : "Payments after contract end"}
        </h2>
        <p className="rph-muted mt-0.5 text-xs">
          {contractEnded
            ? "Refunds, deposit returns, and damage charges for this hire only."
            : "Payments recorded after the contract ended."}
        </p>
      </div>
      <LedgerTotals summary={summary} />
      <table className="min-w-full text-sm">
        <thead className="bg-rph-chrome/60 text-left text-xs uppercase tracking-wide text-rph-fg-muted">
          <tr>
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5">Flow</th>
            <th className="px-4 py-2.5">Type</th>
            <th className="px-4 py-2.5">Amount</th>
            <th className="px-4 py-2.5">Method</th>
            <th className="px-4 py-2.5">Account</th>
            <th className="px-4 py-2.5">Reference</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => {
            const isIn = payment.direction === "received_from_driver";
            return (
              <tr key={payment.id} className="border-t border-rph-border">
                <td className="px-4 py-3 text-rph-fg-secondary">{formatUkDateTime(payment.paidAt)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      isIn
                        ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                        : "bg-rph-chrome text-rph-fg-secondary"
                    }`}
                  >
                    {isIn ? "In" : "Out"}
                  </span>
                </td>
                <td className="px-4 py-3 text-rph-fg-secondary">
                  {hireLedgerPaymentTypeLabel({
                    direction: payment.direction,
                    paymentCategory: payment.paymentCategory,
                    notes: payment.notes,
                  })}
                </td>
                <td className="px-4 py-3 font-medium tabular-nums text-rph-fg">
                  {formatGbp(payment.amountGbp)}
                </td>
                <td className="px-4 py-3 text-rph-fg-secondary">
                  {PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
                </td>
                <td className="px-4 py-3 text-rph-fg-secondary">{payment.paymentAccountName ?? "—"}</td>
                <td className="px-4 py-3 text-rph-fg-secondary">{payment.paymentReference ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
