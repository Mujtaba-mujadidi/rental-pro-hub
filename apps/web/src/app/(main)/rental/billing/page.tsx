import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { InvoicePaymentForm } from "./invoice-payment-form";

export default async function RentalBillingPage() {
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id ?? "";
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, total, currency, due_date, billing_period_start, billing_period_end, payment_validation_status",
    )
    .eq("parent_company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: scheds } = await supabase.from("billing_schedules").select("id").eq("parent_company_id", companyId);
  const scheduleIds = (scheds ?? []).map((s) => s.id);
  const { data: items } =
    scheduleIds.length > 0
      ? await supabase
          .from("billing_schedule_items")
          .select("id, period_start, period_end, amount_due, currency, status, schedule_id")
          .in("schedule_id", scheduleIds)
          .order("period_start", { ascending: true })
          .limit(60)
      : { data: [] as never[] };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="rph-h1">Billing</h1>
        <p className="rph-lead mt-2 max-w-2xl">{rentalContractCopy.submitPaymentIntro}</p>
        <p className="rph-muted mt-2 max-w-2xl text-sm">{rentalContractCopy.awaitingValidation}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Invoices</h2>
        {!invoices?.length ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{inv.invoice_number}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {inv.billing_period_start} → {inv.billing_period_end} · Due {inv.due_date ?? "—"}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {inv.currency} {Number(inv.total).toFixed(2)} · {inv.status}
                    {inv.payment_validation_status ? ` · ${inv.payment_validation_status}` : ""}
                  </p>
                </div>
                {inv.status === "issued" ||
                inv.status === "due" ||
                inv.status === "payment_submitted" ||
                inv.status === "rejected" ||
                inv.status === "overdue" ? (
                  <InvoicePaymentForm invoiceId={inv.id} status={inv.status} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Schedule items</h2>
        {!items?.length ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No schedule items yet. Platform staff generate these.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
            {items.map((it) => (
              <li key={it.id} className="flex justify-between gap-4 p-3">
                <span>
                  {it.period_start} → {it.period_end}
                </span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {it.currency} {Number(it.amount_due).toFixed(2)} · {it.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
