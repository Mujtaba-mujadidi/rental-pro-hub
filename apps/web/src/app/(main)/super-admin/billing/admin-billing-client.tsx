"use client";

import {
  ensureBillingScheduleAction,
  issueInvoiceForScheduleItemAction,
  validateInvoicePaymentAction,
} from "@/app/actions/admin-billing";
import { applyInvoiceDiscountAction, createBillingAmendmentAction, applyBillingAmendmentAction } from "@/app/actions/billing-adjustments";
import { formatUkDate } from "@/lib/datetime/uk";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SubRow = {
  id: string;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  note: string | null;
  submitted_by: string;
  invoices: {
    id: string;
    invoice_number: string;
    parent_company_id: string;
    status: string;
    total: number;
    currency: string;
  };
};

type SchedRow = {
  id: string;
  period_start: string;
  period_end: string;
  amount_due: number;
  currency: string;
  status: string;
  billing_schedules: { parent_company_id: string; contract_id: string | null };
};

export function AdminBillingClient({
  submissions,
  scheduledItems,
}: {
  submissions: SubRow[];
  scheduledItems: SchedRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="space-y-10">
      <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Generate billing schedule</h2>
        <p className="mt-1 text-xs text-slate-500">Creates schedule + future items from the company&apos;s active contract.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="ensure-schedule-co"
            placeholder="Parent company UUID"
            className="rph-input-auth min-w-[12rem] flex-1 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600"
            onClick={() => {
              const el = document.getElementById("ensure-schedule-co") as HTMLInputElement | null;
              const id = el?.value?.trim() ?? "";
              if (!id) return;
              setMsg(null);
              setErr(null);
              startTransition(() => {
                void (async () => {
                  const res = await ensureBillingScheduleAction(id);
                  if (!res.ok) setErr(res.error);
                  else {
                    setMsg("Billing schedule created.");
                    router.refresh();
                  }
                })();
              });
            }}
          >
            Ensure schedule
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Payment validations</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Rejections require a comment. You cannot confirm a submission you created.
        </p>
        {!submissions.length ? (
          <p className="text-sm text-slate-500">No submissions awaiting validation.</p>
        ) : (
          <ul className="space-y-4">
            {submissions.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"
              >
                <p className="font-mono text-sm font-semibold">{s.invoices.invoice_number}</p>
                <p className="text-xs text-slate-500">
                  {formatUkDate(s.payment_date)} · {s.payment_method} · ref {s.reference ?? "—"}
                </p>
                <p className="text-sm">
                  {s.invoices.currency} {Number(s.invoices.total).toFixed(2)}
                </p>
                <form
                  className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    fd.set("submission_id", s.id);
                    setMsg(null);
                    setErr(null);
                    startTransition(() => {
                      void (async () => {
                        const res = await validateInvoicePaymentAction(fd);
                        if (!res.ok) {
                          setErr(res.error);
                          return;
                        }
                        setMsg("Validation saved.");
                        router.refresh();
                      })();
                    });
                  }}
                >
                  <select name="decision" required className="rph-input-auth text-sm">
                    <option value="">Decision…</option>
                    <option value="confirmed_paid">Confirm paid</option>
                    <option value="rejected">Reject</option>
                  </select>
                  <input
                    name="confirmed_payment_method"
                    placeholder="Confirmed method (if paid)"
                    className="rph-input-auth text-sm"
                  />
                  <input name="comment" placeholder="Comment (required if reject)" className="rph-input-auth flex-1 text-sm" />
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-lg bg-rph-rail px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Submit
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Scheduled items → issue invoice</h2>
        {!scheduledItems.length ? (
          <p className="text-sm text-slate-500">No scheduled items. Generate a schedule from a company contract first.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {scheduledItems.map((it) => (
              <li key={it.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <span>
                    {formatUkDate(it.period_start)} → {formatUkDate(it.period_end)}
                  </span>
                  <span className="ml-2 font-mono">
                    {it.currency} {Number(it.amount_due).toFixed(2)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-lg bg-rph-rail px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => {
                      setMsg(null);
                      setErr(null);
                      startTransition(() => {
                        void (async () => {
                          const res = await issueInvoiceForScheduleItemAction(it.id);
                          if (!res.ok) setErr(res.error);
                          else {
                            setMsg("Invoice issued.");
                            router.refresh();
                          }
                        })();
                      });
                    }}
                  >
                    Issue invoice
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-600">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Adjustments & amendments</h2>
        <p className="text-xs text-slate-500">{rentalContractCopy.paymentRejected}</p>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => {
              void (async () => {
                const res = await applyInvoiceDiscountAction(fd);
                if (!res.ok) setErr(res.error);
                else {
                  setMsg("Discount applied.");
                  router.refresh();
                }
              })();
            });
          }}
        >
          <input name="invoice_id" placeholder="Invoice UUID" className="rph-input-auth text-sm sm:col-span-2" required />
          <select name="amount_type" className="rph-input-auth text-sm">
            <option value="fixed">Fixed amount</option>
            <option value="percent">Percent</option>
          </select>
          <input name="amount_value" placeholder="Value" className="rph-input-auth text-sm" required />
          <input name="reason" placeholder="Reason (required)" className="rph-input-auth text-sm sm:col-span-2" required />
          <button type="submit" disabled={pending} className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white dark:bg-slate-200 dark:text-slate-900">
            Apply discount
          </button>
        </form>
        <form
          className="mt-4 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => {
              void (async () => {
                const res = await createBillingAmendmentAction(fd);
                if (!res.ok) setErr(res.error);
                else {
                  setMsg(`Amendment draft ${res.id ?? ""} created. Apply from SQL or extend UI.`);
                  router.refresh();
                }
              })();
            });
          }}
        >
          <input name="contract_id" placeholder="Contract UUID" className="rph-input-auth text-sm sm:col-span-2" required />
          <input type="date" name="effective_date" className="rph-input-auth text-sm" required />
          <input name="reason" placeholder="Reason" className="rph-input-auth text-sm sm:col-span-2" required />
          <input name="new_monthly_amount" placeholder="New monthly amount" className="rph-input-auth text-sm sm:col-span-2" />
          <button type="submit" disabled={pending} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">
            Create billing amendment (draft)
          </button>
        </form>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const id = String(fd.get("amendment_id") ?? "").trim();
            startTransition(() => {
              void (async () => {
                const res = await applyBillingAmendmentAction(id);
                if (!res.ok) setErr(res.error);
                else {
                  setMsg("Amendment applied; future schedule items regenerated.");
                  router.refresh();
                }
              })();
            });
          }}
        >
          <input name="amendment_id" placeholder="Amendment UUID to apply" className="rph-input-auth flex-1 text-sm" />
          <button type="submit" disabled={pending} className="rounded-lg bg-rph-rail px-3 py-2 text-sm font-semibold text-white">
            Apply amendment
          </button>
        </form>
      </section>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
    </div>
  );
}
