"use client";

import {
  addHireBalanceNoteAction,
  loadHireSettlementWorkspaceAction,
  recordHireBalancePaymentAction,
  type HireBalancePaymentRow,
  type HireSettlementWorkspaceData,
} from "@/app/actions/rental-hire-termination";
import { formatGbp } from "@/lib/fleet/maintenance";
import { settlementBalanceLabel } from "@/lib/fleet/hire-termination-summary";
import { formatUkDateTime } from "@/lib/datetime/uk";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export function HireSettlementWorkspacePanel({
  hireGroupId,
  embedded = false,
}: {
  hireGroupId: string;
  embedded?: boolean;
}) {
  const [data, setData] = useState<HireSettlementWorkspaceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [noteBody, setNoteBody] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentAccountId, setPaymentAccountId] = useState("");

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadHireSettlementWorkspaceAction(hireGroupId);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
      setPaymentAccountId((current) => {
        if (current) return current;
        return (
          res.data.defaultPaymentAccountId ??
          res.data.paymentAccounts.find((account) => account.isDefault)?.id ??
          res.data.paymentAccounts[0]?.id ??
          ""
        );
      });
      setError(null);
    });
  }, [hireGroupId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const addNote = () => {
    startTransition(async () => {
      const res = await addHireBalanceNoteAction({ hireGroupId, body: noteBody });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNoteBody("");
      reload();
    });
  };

  const recordPayment = () => {
    startTransition(async () => {
      const res = await recordHireBalancePaymentAction({
        hireGroupId,
        amountGbp: Number(paymentAmount),
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
      reload();
    });
  };

  if (!data && pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading settlement…</p>
      </div>
    );
  }

  if (error && !data) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data) return null;

  const settled = data.settlementDirection === "settled";

  return (
    <div className="space-y-4">
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/rental/balances" className="text-sm font-medium text-rph-link hover:text-rph-link-hover">
              ← Open balances
            </Link>
            <h1 className="rph-h1 mt-2">Settlement balance</h1>
            <p className="rph-muted mt-1 text-sm">
              {data.vehicleVrm} · {data.driverLabel ?? "Driver"}
              {data.terminatedAt ? ` · Ended ${formatUkDateTime(data.terminatedAt)}` : null}
            </p>
          </div>
          <Link href={`/rental/hires/${hireGroupId}`} className="rph-btn-ghost">
            Hire workspace
          </Link>
        </div>
      ) : (
        <div>
          <h1 className="rph-h1">Balance after contract end</h1>
          <p className="rph-muted mt-1 text-sm">
            Money still owed or to be refunded
            {data.terminatedAt ? ` on ${formatUkDateTime(data.terminatedAt)}` : ""}.
          </p>
        </div>
      )}

      <section className="rph-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-rph-fg-muted">Still owed</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-rph-fg">
          {settled
            ? "All clear — nothing owed"
            : settlementBalanceLabel(data.settlementDirection, data.openBalanceGbp)}
        </p>
      </section>

      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      <SettlementPaymentsTable payments={data.payments} />

      {data.driverChargeLineItems.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-rph-border">
          <div className="border-b border-rph-border bg-rph-chrome px-4 py-3">
            <h2 className="text-sm font-semibold text-rph-fg">Driver charges</h2>
            <p className="rph-muted mt-0.5 text-xs">
              Itemised charges from check-in and other driver income.
            </p>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-rph-chrome/60 text-left text-xs uppercase tracking-wide text-rph-fg-muted">
              <tr>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5">Amount</th>
                <th className="px-4 py-2.5">Resolution</th>
                <th className="px-4 py-2.5">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.driverChargeLineItems.map((item) => (
                <tr key={item.id} className="border-t border-rph-border">
                  <td className="px-4 py-3 text-rph-fg-secondary">{item.chargeTypeLabel}</td>
                  <td className="px-4 py-3 text-rph-fg-secondary">{item.description ?? "—"}</td>
                  <td className="px-4 py-3 font-medium tabular-nums text-rph-fg">
                    {formatGbp(item.amountGbp)}
                  </td>
                  <td className="px-4 py-3 text-rph-fg-secondary">{item.resolutionLabel}</td>
                  <td className="px-4 py-3 text-rph-fg-secondary">
                    {item.createdAt ? formatUkDateTime(item.createdAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {data.notes.length ? (
        <section className="overflow-hidden rounded-xl border border-rph-border">
          <div className="border-b border-rph-border bg-rph-chrome px-4 py-3">
            <h2 className="text-sm font-semibold text-rph-fg">Notes</h2>
          </div>
          <ul className="divide-y divide-rph-border">
            {data.notes.map((note) => (
              <li key={note.id} className="px-4 py-3 text-sm text-rph-fg-secondary">
                <p>{note.body}</p>
                <p className="rph-muted mt-1 text-xs">{formatUkDateTime(note.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.canWrite && !settled ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rph-card space-y-3 p-4">
            <h2 className="text-sm font-semibold text-rph-fg">Add note</h2>
            <textarea
              className="rph-input min-h-20 w-full"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
            />
            <button
              type="button"
              className="rph-btn-ghost"
              onClick={addNote}
              disabled={pending || !noteBody.trim()}
            >
              Save note
            </button>
          </section>

          <section className="rph-card space-y-3 p-4">
            <h2 className="text-sm font-semibold text-rph-fg">Record payment</h2>
            <input
              className="rph-input w-full"
              inputMode="decimal"
              placeholder="Amount (£)"
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
            />
            <select
              className="rph-input w-full"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="rph-input w-full"
              value={paymentAccountId}
              onChange={(event) => setPaymentAccountId(event.target.value)}
            >
              <option value="">Select payment account…</option>
              {data.paymentAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.isDefault ? " (hire default)" : ""}
                </option>
              ))}
            </select>
            <input
              className="rph-input w-full"
              placeholder="Reference"
              value={paymentReference}
              onChange={(event) => setPaymentReference(event.target.value)}
            />
            <button
              type="button"
              className="rph-btn-primary"
              onClick={recordPayment}
              disabled={pending || !paymentAmount.trim() || !paymentAccountId}
            >
              Record payment
            </button>
            {!data.paymentAccounts.length ? (
              <p className="rph-muted text-xs">
                No active payment accounts for this company. Add one in rental settings.
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SettlementPaymentsTable({ payments }: { payments: HireBalancePaymentRow[] }) {
  if (!payments.length) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-rph-border">
      <div className="border-b border-rph-border bg-rph-chrome px-4 py-3">
        <h2 className="text-sm font-semibold text-rph-fg">Recorded payments</h2>
      </div>
      <table className="min-w-full text-sm">
        <thead className="bg-rph-chrome/60 text-left text-xs uppercase tracking-wide text-rph-fg-muted">
          <tr>
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5">Amount</th>
            <th className="px-4 py-2.5">Method</th>
            <th className="px-4 py-2.5">Account</th>
            <th className="px-4 py-2.5">Reference</th>
            <th className="px-4 py-2.5">Category</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id} className="border-t border-rph-border">
              <td className="px-4 py-3 text-rph-fg-secondary">{formatUkDateTime(payment.paidAt)}</td>
              <td className="px-4 py-3 font-medium tabular-nums text-rph-fg">
                {formatGbp(payment.amountGbp)}
              </td>
              <td className="px-4 py-3 text-rph-fg-secondary">
                {PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod}
              </td>
              <td className="px-4 py-3 text-rph-fg-secondary">{payment.paymentAccountName ?? "—"}</td>
              <td className="px-4 py-3 text-rph-fg-secondary">{payment.paymentReference ?? "—"}</td>
              <td className="px-4 py-3 text-rph-fg-secondary">
                {payment.paymentCategory === "driver_charge" ? "Driver charge" : "Settlement"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
