"use server";

import { revalidatePath } from "next/cache";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { assertRentalCompanyWritable } from "@/lib/auth/rental-company-write-guard";
import { canSubmitBillingPayment } from "@/lib/auth/rental-permissions";
import { notifySuperAdmins } from "@/lib/platform-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function submitInvoicePaymentAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  const frozen = await assertRentalCompanyWritable(profile);
  if (!frozen.ok) return { ok: false, error: frozen.error };
  if (!canSubmitBillingPayment(profile)) {
    return { ok: false, error: "Only owner, admin, or finance can submit payments." };
  }

  const invoiceId = nullIfEmpty(formData.get("invoice_id"));
  if (!invoiceId) return { ok: false, error: "Missing invoice." };
  const payment_date = nullIfEmpty(formData.get("payment_date"));
  const payment_method = nullIfEmpty(formData.get("payment_method"));
  if (!payment_date || !payment_method) return { ok: false, error: "Payment date and method are required." };

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Server configuration error." };
  }

  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select("id, parent_company_id, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr || !inv) return { ok: false, error: invErr?.message ?? "Invoice not found." };
  if (inv.parent_company_id !== profile.company_id) {
    return { ok: false, error: "Invoice does not belong to your company." };
  }
  const st = String(inv.status ?? "");
  if (st !== "issued" && st !== "due" && st !== "payment_submitted" && st !== "rejected" && st !== "overdue") {
    return { ok: false, error: "This invoice cannot accept a new payment submission in its current state." };
  }

  await admin.from("invoice_payment_submissions").update({ status: "superseded" }).eq("invoice_id", invoiceId).eq("status", "submitted");

  const { error: subErr } = await admin.from("invoice_payment_submissions").insert({
    invoice_id: invoiceId,
    submitted_by: profile.id,
    payment_date,
    payment_method,
    reference: nullIfEmpty(formData.get("reference")),
    note: nullIfEmpty(formData.get("note")),
    proof_storage_path: nullIfEmpty(formData.get("proof_storage_path")),
    status: "submitted",
  });
  if (subErr) return { ok: false, error: subErr.message };

  await admin
    .from("invoices")
    .update({
      status: "payment_submitted",
      payment_validation_status: "awaiting_validation",
    })
    .eq("id", invoiceId);

  await notifySuperAdmins(admin, "payment_submitted", {
    invoice_id: invoiceId,
    parent_company_id: inv.parent_company_id,
    submitted_by: profile.id,
  });

  revalidatePath("/rental/billing");
  revalidatePath("/super-admin/billing");
  return { ok: true };
}
