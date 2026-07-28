"use client";

import type { HireBalancePaymentRow } from "@/app/actions/rental-hire-termination";
import { formatUkDateTime } from "@/lib/datetime/uk";
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

function paymentDirectionLabel(direction: HireSettlementBalancePaymentRow["direction"]): string {
  return direction === "received_from_driver" ? "Received from driver" : "Paid to driver";
}

export function HireSettlementBalancePaymentsTable({
  payments,
}: {
  payments: HireSettlementBalancePaymentRow[];
}) {
  if (!payments.length) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-rph-border">
      <div className="border-b border-rph-border bg-rph-chrome px-4 py-3">
        <h2 className="text-sm font-semibold text-rph-fg">Settlement balance payments</h2>
        <p className="rph-muted mt-0.5 text-xs">
          Payments recorded against the final settlement balance after contract end.
        </p>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-rph-chrome/60 text-left text-xs uppercase tracking-wide text-rph-fg-muted">
          <tr>
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5">Type</th>
            <th className="px-4 py-2.5">Amount</th>
            <th className="px-4 py-2.5">Method</th>
            <th className="px-4 py-2.5">Account</th>
            <th className="px-4 py-2.5">Reference</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id} className="border-t border-rph-border">
              <td className="px-4 py-3 text-rph-fg-secondary">{formatUkDateTime(payment.paidAt)}</td>
              <td className="px-4 py-3 text-rph-fg-secondary">
                {paymentDirectionLabel(payment.direction)}
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
          ))}
        </tbody>
      </table>
    </section>
  );
}
