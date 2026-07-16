"use client";

import { submitInvoicePaymentAction } from "@/app/actions/rental-billing";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { useState, useTransition } from "react";

export function InvoicePaymentForm({ invoiceId, status }: { invoiceId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    const fd = new FormData(e.currentTarget);
    fd.set("invoice_id", invoiceId);
    startTransition(() => {
      void (async () => {
        const res = await submitInvoicePaymentAction(fd);
        if (!res.ok) {
          setErr(res.error);
          return;
        }
        setMsg("Payment details submitted. " + rentalContractCopy.awaitingValidation);
        (e.target as HTMLFormElement).reset();
      })();
    });
  }

  if (status === "paid") return null;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-md flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-900/40"
    >
      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Submit payment</p>
      <input type="date" name="payment_date" required className="rph-input-auth text-sm" />
      <input name="payment_method" required placeholder="Method (e.g. BACS)" className="rph-input-auth text-sm" />
      <input name="reference" placeholder="Reference" className="rph-input-auth text-sm" />
      <textarea name="note" placeholder="Note" rows={2} className="rph-input-auth text-sm" />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-rph-rail px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit payment details"}
      </button>
      {err ? <p className="text-xs text-red-600 dark:text-red-400">{err}</p> : null}
      {msg ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
    </form>
  );
}
