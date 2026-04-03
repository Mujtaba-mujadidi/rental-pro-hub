"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { notifyCompanyFinanceRoles } from "@/lib/platform-notifications";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function monthPeriod(startStr: string, index: number): { start: string; end: string } {
  const parts = startStr.split("-").map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const start = new Date(Date.UTC(y, m - 1 + index, d));
  const end = new Date(Date.UTC(y, m - 1 + index + 1, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function getRecurringAmount(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  contractId: string,
): Promise<number> {
  const { data: c } = await admin.from("company_contracts").select("current_version_id").eq("id", contractId).maybeSingle();
  if (!c?.current_version_id) return 0;
  const { data: v } = await admin
    .from("company_contract_versions")
    .select("pricing_snapshot, commercial_snapshot")
    .eq("id", c.current_version_id)
    .maybeSingle();
  const ps = (v?.pricing_snapshot ?? {}) as { amount?: number };
  if (typeof ps.amount === "number" && Number.isFinite(ps.amount)) return ps.amount;
  const cs = (v?.commercial_snapshot ?? {}) as { recurring_amount?: number };
  if (typeof cs.recurring_amount === "number" && Number.isFinite(cs.recurring_amount)) return cs.recurring_amount;
  return 0;
}

function makeInvoiceNumber(): string {
  const y = new Date().getFullYear();
  const r = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `INV-${y}-${r}`;
}

export async function ensureBillingScheduleAction(parentCompanyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const id = parentCompanyId?.trim();
  if (!id) return { ok: false, error: "Missing company." };
  const admin = createSupabaseAdminClient();

  const { data: contract, error: cErr } = await admin
    .from("company_contracts")
    .select("id, billing_frequency, start_date, currency, status")
    .eq("parent_company_id", id)
    .maybeSingle();
  if (cErr || !contract?.id) return { ok: false, error: cErr?.message ?? "Contract not found." };
  if (contract.status !== "active" && contract.status !== "signed_by_customer") {
    return { ok: false, error: "Contract must be active before generating a billing schedule." };
  }

  const { data: existing } = await admin.from("billing_schedules").select("id").eq("contract_id", contract.id).limit(1).maybeSingle();
  if (existing?.id) return { ok: true };

  const startRaw = contract.start_date as string | null;
  const start = startRaw && startRaw.length >= 10 ? startRaw.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const freqRaw = (contract.billing_frequency as string | null) ?? "monthly";
  const frequency =
    freqRaw === "weekly" || freqRaw === "quarterly" || freqRaw === "annual" || freqRaw === "custom" ? freqRaw : "monthly";

  const { data: sched, error: sErr } = await admin
    .from("billing_schedules")
    .insert({
      contract_id: contract.id,
      parent_company_id: id,
      frequency,
      start_date: start,
      is_ongoing: true,
    })
    .select("id")
    .single();
  if (sErr || !sched?.id) return { ok: false, error: sErr?.message ?? "Could not create schedule." };

  const amount = await getRecurringAmount(admin, contract.id);
  const currency = (contract.currency as string) ?? "GBP";
  const periods = frequency === "weekly" ? 26 : frequency === "quarterly" ? 4 : frequency === "annual" ? 2 : 12;
  const rows: { schedule_id: string; period_start: string; period_end: string; amount_due: number; currency: string }[] = [];
  for (let i = 0; i < periods; i++) {
    const { start: ps, end: pe } = monthPeriod(start, i);
    rows.push({
      schedule_id: sched.id,
      period_start: ps,
      period_end: pe,
      amount_due: amount,
      currency,
    });
  }
  const { error: iErr } = await admin.from("billing_schedule_items").insert(rows);
  if (iErr) return { ok: false, error: iErr.message };

  revalidatePath("/super-admin/billing");
  revalidatePath("/rental/billing");
  return { ok: true };
}

export async function issueInvoiceForScheduleItemAction(
  scheduleItemId: string,
): Promise<{ ok: true; invoiceId?: string } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const sid = scheduleItemId?.trim();
  if (!sid) return { ok: false, error: "Missing schedule item." };
  const admin = createSupabaseAdminClient();

  const { data: item, error: itemErr } = await admin
    .from("billing_schedule_items")
    .select("id, schedule_id, period_start, period_end, amount_due, currency, status")
    .eq("id", sid)
    .maybeSingle();
  if (itemErr || !item) return { ok: false, error: itemErr?.message ?? "Schedule item not found." };
  if (item.status !== "scheduled") return { ok: false, error: "Item is not in scheduled state." };

  const { data: sched, error: schErr } = await admin
    .from("billing_schedules")
    .select("id, contract_id, parent_company_id")
    .eq("id", item.schedule_id)
    .maybeSingle();
  if (schErr || !sched) return { ok: false, error: schErr?.message ?? "Schedule not found." };

  let invoiceNumber = makeInvoiceNumber();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        parent_company_id: sched.parent_company_id,
        contract_id: sched.contract_id,
        billing_schedule_item_id: item.id,
        billing_period_start: item.period_start,
        billing_period_end: item.period_end,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: new Date().toISOString().slice(0, 10),
        status: "issued",
        subtotal: item.amount_due,
        tax_amount: 0,
        total: item.amount_due,
        currency: item.currency,
        generated_by: user.id,
        pricing_snapshot: { amount: item.amount_due },
      })
      .select("id")
      .single();
    if (!invErr && inv?.id) {
      await admin.from("billing_schedule_items").update({ status: "invoiced" }).eq("id", item.id);
      revalidatePath("/super-admin/billing");
      revalidatePath("/rental/billing");
      return { ok: true, invoiceId: inv.id };
    }
    if (invErr?.message?.includes("unique") || invErr?.code === "23505") {
      invoiceNumber = makeInvoiceNumber();
      continue;
    }
    return { ok: false, error: invErr?.message ?? "Could not create invoice." };
  }
  return { ok: false, error: "Could not allocate a unique invoice number." };
}

export async function validateInvoicePaymentAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const submissionId = String(formData.get("submission_id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const comment = String(formData.get("comment") ?? "").trim();
  if (!submissionId) return { ok: false, error: "Missing submission." };
  if (decision !== "confirmed_paid" && decision !== "rejected") {
    return { ok: false, error: "Invalid decision." };
  }
  if (decision === "rejected" && !comment) {
    return { ok: false, error: "A comment is required when rejecting a payment." };
  }

  const admin = createSupabaseAdminClient();
  const { data: sub, error: sErr } = await admin
    .from("invoice_payment_submissions")
    .select("id, invoice_id, submitted_by, status")
    .eq("id", submissionId)
    .maybeSingle();
  if (sErr || !sub) return { ok: false, error: sErr?.message ?? "Submission not found." };
  if (sub.status !== "submitted") return { ok: false, error: "Submission is not active." };
  if (sub.submitted_by === user.id) {
    return { ok: false, error: "You cannot validate a payment you submitted." };
  }

  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select("id, parent_company_id, status")
    .eq("id", sub.invoice_id)
    .maybeSingle();
  if (invErr || !inv) return { ok: false, error: invErr?.message ?? "Invoice not found." };

  const { error: vErr } = await admin.from("invoice_payment_validations").insert({
    submission_id: submissionId,
    validated_by: user.id,
    decision,
    comment: comment || null,
    confirmed_payment_method: decision === "confirmed_paid" ? String(formData.get("confirmed_payment_method") ?? "").trim() || null : null,
  });
  if (vErr) return { ok: false, error: vErr.message };

  if (decision === "confirmed_paid") {
    await admin
      .from("invoices")
      .update({
        status: "paid",
        payment_validation_status: "confirmed_paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", inv.id);
    await notifyCompanyFinanceRoles(admin, inv.parent_company_id as string, "payment_validated", {
      invoice_id: inv.id,
      decision: "confirmed_paid",
    });
  } else {
    await admin
      .from("invoices")
      .update({
        status: "rejected",
        payment_validation_status: "rejected",
      })
      .eq("id", inv.id);
    await notifyCompanyFinanceRoles(admin, inv.parent_company_id as string, "payment_validated", {
      invoice_id: inv.id,
      decision: "rejected",
      comment,
    });
  }

  revalidatePath("/super-admin/billing");
  revalidatePath("/rental/billing");
  return { ok: true };
}
