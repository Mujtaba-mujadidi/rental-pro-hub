"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export async function applyInvoiceDiscountAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const invoiceId = nullIfEmpty(formData.get("invoice_id"));
  const reason = nullIfEmpty(formData.get("reason"));
  if (!invoiceId || !reason) return { ok: false, error: "Invoice and reason are required." };

  const amountTypeRaw = nullIfEmpty(formData.get("amount_type")) ?? "fixed";
  const amountType = amountTypeRaw === "percent" ? "percent" : "fixed";
  const valueRaw = nullIfEmpty(formData.get("amount_value"));
  if (valueRaw == null) return { ok: false, error: "Amount value is required." };
  const amountValue = Number.parseFloat(valueRaw);
  if (!Number.isFinite(amountValue) || amountValue <= 0) return { ok: false, error: "Invalid amount." };

  const admin = createSupabaseAdminClient();
  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select("id, subtotal, tax_amount, total, adjustment_summary")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr || !inv) return { ok: false, error: invErr?.message ?? "Invoice not found." };

  const subtotal = Number(inv.subtotal);
  const tax = Number(inv.tax_amount);
  const discount =
    amountType === "percent" ? Math.min(subtotal, (subtotal * amountValue) / 100) : Math.min(subtotal, amountValue);
  const adjustedSubtotal = Math.max(0, subtotal - discount);
  const newTotal = adjustedSubtotal + tax;

  const { error: adjErr } = await admin.from("billing_adjustments").insert({
    target_type: "invoice",
    target_id: invoiceId,
    adjustment_type: "discount",
    amount_type: amountType,
    amount_value: amountValue,
    reason,
    note: nullIfEmpty(formData.get("note")),
    original_amount: subtotal,
    adjusted_amount: adjustedSubtotal,
    created_by: user.id,
  });
  if (adjErr) return { ok: false, error: adjErr.message };

  const prev = Array.isArray(inv.adjustment_summary)
    ? (inv.adjustment_summary as Record<string, unknown>[])
    : [];
  const summary = [
    ...prev,
    {
      type: "discount",
      amount_type: amountType,
      amount_value: amountValue,
      discount_applied: discount,
      reason,
      at: new Date().toISOString(),
    },
  ];

  await admin
    .from("invoices")
    .update({
      subtotal: adjustedSubtotal,
      total: newTotal,
      adjustment_summary: summary,
    })
    .eq("id", invoiceId);

  revalidatePath("/super-admin/billing");
  revalidatePath("/rental/billing");
  return { ok: true };
}

export async function createBillingAmendmentAction(formData: FormData): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const { user } = await requireSuperAdmin();
  const contractId = nullIfEmpty(formData.get("contract_id"));
  const effective_date = nullIfEmpty(formData.get("effective_date"));
  const reason = nullIfEmpty(formData.get("reason"));
  if (!contractId || !effective_date || !reason) return { ok: false, error: "Contract, effective date, and reason are required." };

  let toSnap: Record<string, unknown> = {};
  const snapRaw = nullIfEmpty(formData.get("to_pricing_snapshot_json"));
  if (snapRaw) {
    try {
      toSnap = JSON.parse(snapRaw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "to_pricing_snapshot_json must be valid JSON." };
    }
  } else {
    const amt = nullIfEmpty(formData.get("new_monthly_amount"));
    if (amt) {
      const n = Number.parseFloat(amt);
      if (Number.isFinite(n)) toSnap = { monthly_amount: n, amount: n };
    }
  }

  const admin = createSupabaseAdminClient();
  const { data: fromSnapRow } = await admin
    .from("contract_pricing_snapshots")
    .select("snapshot")
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const fromSnap = (fromSnapRow?.snapshot ?? {}) as Record<string, unknown>;

  const { data: row, error } = await admin
    .from("contract_billing_amendments")
    .insert({
      contract_id: contractId,
      effective_date,
      reason,
      note: nullIfEmpty(formData.get("note")),
      from_pricing_snapshot: fromSnap,
      to_pricing_snapshot: toSnap,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "Could not create amendment." };
  revalidatePath("/super-admin/billing");
  return { ok: true, id: row.id as string };
}

export async function applyBillingAmendmentAction(amendmentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const id = amendmentId?.trim();
  if (!id) return { ok: false, error: "Missing amendment." };
  const admin = createSupabaseAdminClient();

  const { data: am, error: aErr } = await admin
    .from("contract_billing_amendments")
    .select("id, contract_id, effective_date, to_pricing_snapshot, status")
    .eq("id", id)
    .maybeSingle();
  if (aErr || !am) return { ok: false, error: aErr?.message ?? "Amendment not found." };
  if (am.status !== "draft") return { ok: false, error: "Amendment already processed." };

  const contractId = am.contract_id as string;
  const effectiveDate = String(am.effective_date).slice(0, 10);
  const toSnap = (am.to_pricing_snapshot ?? {}) as { amount?: number; monthly_amount?: number };
  const newAmount =
    typeof toSnap.amount === "number"
      ? toSnap.amount
      : typeof toSnap.monthly_amount === "number"
        ? toSnap.monthly_amount
        : 0;

  const { data: sched } = await admin.from("billing_schedules").select("id").eq("contract_id", contractId).limit(1).maybeSingle();
  if (!sched?.id) return { ok: false, error: "No billing schedule for this contract." };

  const { data: futureItems, error: fiErr } = await admin
    .from("billing_schedule_items")
    .select("id, status")
    .eq("schedule_id", sched.id)
    .gte("period_start", effectiveDate)
    .in("status", ["scheduled"]);
  if (fiErr) return { ok: false, error: fiErr.message };
  const ids = (futureItems ?? []).map((r) => r.id as string);
  if (ids.length > 0) {
    await admin.from("billing_schedule_items").delete().in("id", ids);
  }

  const { data: lastItem } = await admin
    .from("billing_schedule_items")
    .select("period_end, currency")
    .eq("schedule_id", sched.id)
    .order("period_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  const startNext = effectiveDate;
  const currency = (lastItem?.currency as string) ?? "GBP";
  const rows: { schedule_id: string; period_start: string; period_end: string; amount_due: number; currency: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const y = Number(startNext.slice(0, 4));
    const m = Number(startNext.slice(5, 7));
    const d = Number(startNext.slice(8, 10));
    const start = new Date(Date.UTC(y, m - 1 + i, d));
    const end = new Date(Date.UTC(y, m - 1 + i + 1, d));
    end.setUTCDate(end.getUTCDate() - 1);
    rows.push({
      schedule_id: sched.id,
      period_start: start.toISOString().slice(0, 10),
      period_end: end.toISOString().slice(0, 10),
      amount_due: newAmount,
      currency,
    });
  }
  const { error: insErr } = await admin.from("billing_schedule_items").insert(rows);
  if (insErr) return { ok: false, error: insErr.message };

  await admin
    .from("contract_billing_amendments")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", id);

  await admin.from("contract_pricing_snapshots").insert({
    contract_id: contractId,
    snapshot: toSnap,
  });

  revalidatePath("/super-admin/billing");
  revalidatePath("/rental/billing");
  return { ok: true };
}
