/**
 * One-off heal (plain Node, no tsx): deposit→rent credit wrongly on deposit row.
 * Run from apps/web: node ../../supabase/manual/heal_deposit_credit_misapplied_to_deposit_row.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "apps/web/.env.local"),
    resolve(__dirname, "../../apps/web/.env.local"),
  ];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, "utf8");
      const out = {};
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
      }
      if (out.NEXT_PUBLIC_SUPABASE_URL) return out;
    } catch {
      // continue
    }
  }
  throw new Error("Could not load apps/web/.env.local");
}

function roundGbp(n) {
  return Math.round(n * 100) / 100;
}

function netDue(base, discount) {
  return roundGbp(Math.max(0, Number(base) - Number(discount || 0)));
}

function paidOf(row) {
  if (row.approved_amount_gbp != null && Number(row.approved_amount_gbp) >= 0) {
    return roundGbp(Number(row.approved_amount_gbp));
  }
  if (row.payment_status === "approved") return netDue(row.base_amount_gbp, row.discount_total);
  return 0;
}

function allocateRentCredit(creditGbp, rows, accrualYmd) {
  let remaining = roundGbp(Math.max(0, creditGbp));
  const allocations = [];
  const eligible = rows
    .filter((r) => r.row_kind === "rent")
    .filter((r) => String(r.period_start) <= accrualYmd)
    .filter((r) => r.payment_status !== "pending_approval")
    .map((r) => {
      const due = netDue(r.base_amount_gbp, r.discount_total);
      const paid = paidOf(r);
      return { ...r, balance: roundGbp(due - paid) };
    })
    .filter((r) => r.balance > 0.005)
    .sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)) || a.sort_order - b.sort_order);

  for (const row of eligible) {
    if (remaining <= 0.005) break;
    const allocated = roundGbp(Math.min(remaining, row.balance));
    remaining = roundGbp(remaining - allocated);
    allocations.push({
      rowId: row.id,
      fromStatus: row.payment_status,
      priorPaid: paidOf(row),
      allocatedGbp: allocated,
      approvedAmount: roundGbp(paidOf(row) + allocated),
    });
  }
  return allocations;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role env");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: badEvents, error: evErr } = await admin
    .from("vehicle_hire_payment_status_events")
    .select("id, schedule_row_id, amendment_payload, actor_user_id, created_at")
    .eq("comment", "Deposit applied to rent at contract end")
    .eq("event_kind", "status_change");
  if (evErr) throw evErr;

  const rowIds = [...new Set((badEvents ?? []).map((e) => e.schedule_row_id))];
  if (!rowIds.length) {
    console.log("No deposit-applied events found.");
    return;
  }

  const { data: scheduleRows, error: schErr } = await admin
    .from("vehicle_hire_payment_schedule")
    .select("id, hire_group_id, row_kind, approved_amount_gbp, payment_status, base_amount_gbp")
    .in("id", rowIds);
  if (schErr) throw schErr;
  const rowById = new Map((scheduleRows ?? []).map((r) => [r.id, r]));

  const depositBad = (badEvents ?? []).filter((e) => rowById.get(e.schedule_row_id)?.row_kind === "deposit");
  if (!depositBad.length) {
    console.log("No misapplied deposit-row credits found.");
    return;
  }

  for (const event of depositBad) {
    const row = rowById.get(event.schedule_row_id);
    const hireGroupId = row.hire_group_id;
    const payload = event.amendment_payload ?? {};
    const applied = Number(payload.depositAppliedGbp ?? 0);
    if (!Number.isFinite(applied) || applied <= 0.005) continue;

    const currentApproved = Number(row.approved_amount_gbp ?? 0);
    const restoredApproved = roundGbp(currentApproved - applied);
    if (restoredApproved < -0.005) {
      throw new Error(`Refusing heal for ${hireGroupId}: negative restored deposit ${restoredApproved}`);
    }

    console.log("Healing hire", hireGroupId, {
      eventId: event.id,
      currentApproved,
      restoredApproved,
      creditToRent: applied,
    });

    const { error: delErr } = await admin
      .from("vehicle_hire_payment_status_events")
      .delete()
      .eq("id", event.id);
    if (delErr) throw delErr;

    const { error: depUpdErr } = await admin
      .from("vehicle_hire_payment_schedule")
      .update({ payment_status: "approved", approved_amount_gbp: restoredApproved })
      .eq("id", row.id);
    if (depUpdErr) throw depUpdErr;

    const { data: group, error: gErr } = await admin
      .from("vehicle_hire_groups")
      .select("termination_settlement, terminated_at, ended_at")
      .eq("id", hireGroupId)
      .maybeSingle();
    if (gErr) throw gErr;

    const termination = group?.termination_settlement ?? {};
    const accrualYmd =
      (group?.terminated_at || group?.ended_at || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const signedRent = Number(termination.signedRentBalanceGbp ?? applied);
    const creditGbp = roundGbp(Math.min(applied, Math.max(0, signedRent)));

    const { data: allRows, error: allErr } = await admin
      .from("vehicle_hire_payment_schedule")
      .select(
        "id, period_start, period_end, row_kind, base_amount_gbp, payment_status, approved_amount_gbp, sort_order, vehicle_hire_schedule_discounts(amount_gbp)",
      )
      .eq("hire_group_id", hireGroupId)
      .order("sort_order", { ascending: true });
    if (allErr) throw allErr;

    const mapped = (allRows ?? []).map((r) => ({
      ...r,
      discount_total: (r.vehicle_hire_schedule_discounts ?? []).reduce(
        (s, d) => s + Number(d.amount_gbp || 0),
        0,
      ),
    }));

    const allocations = allocateRentCredit(creditGbp, mapped, accrualYmd);
    if (!allocations.length) {
      console.log("No rent rows to credit for", hireGroupId);
      continue;
    }

    for (const line of allocations) {
      const { error: evInsErr } = await admin.from("vehicle_hire_payment_status_events").insert({
        schedule_row_id: line.rowId,
        event_kind: "status_change",
        from_status: line.fromStatus,
        to_status: "approved",
        comment: "Deposit applied to rent at contract end",
        amendment_payload: {
          depositAppliedGbp: line.allocatedGbp,
          approvedAmountGbp: line.approvedAmount,
        },
        actor_user_id: event.actor_user_id,
        actor_role: "company_staff",
      });
      if (evInsErr) throw evInsErr;

      const { error: updErr } = await admin
        .from("vehicle_hire_payment_schedule")
        .update({
          payment_status: "approved",
          approved_amount_gbp: line.approvedAmount,
        })
        .eq("id", line.rowId);
      if (updErr) throw updErr;
    }

    console.log(
      "Persisted rent credit",
      roundGbp(allocations.reduce((s, a) => s + a.allocatedGbp, 0)),
      "across",
      allocations.length,
      "rent rows",
    );
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
