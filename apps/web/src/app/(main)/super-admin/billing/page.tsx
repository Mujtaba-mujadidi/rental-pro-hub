import { createClient } from "@/lib/supabase/server";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import { AdminBillingClient } from "./admin-billing-client";

export default async function SuperAdminBillingPage() {
  const supabase = await createClient();
  const { data: submissions } = await supabase
    .from("invoice_payment_submissions")
    .select(
      "id, payment_date, payment_method, reference, note, submitted_by, invoices!inner(id, invoice_number, parent_company_id, status, total, currency)",
    )
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(80);

  const { data: scheduledItems } = await supabase
    .from("billing_schedule_items")
    .select(
      "id, period_start, period_end, amount_due, currency, status, billing_schedules(parent_company_id, contract_id)",
    )
    .eq("status", "scheduled")
    .order("period_start", { ascending: true })
    .limit(80);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="rph-h1">Billing</h1>
        <p className="rph-muted mt-2 max-w-3xl text-sm">{rentalContractCopy.noSelfConfirmPaid}</p>
      </div>
      <AdminBillingClient
        submissions={(submissions ?? []) as never}
        scheduledItems={(scheduledItems ?? []) as never}
      />
    </div>
  );
}
