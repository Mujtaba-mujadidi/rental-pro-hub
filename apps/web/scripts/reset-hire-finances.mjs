/**
 * Destructive: wipe hire payment / charge / settlement ledger so a hire looks finance-fresh.
 * Keeps: hire group, schedule row skeleton (reset to unpaid), agreements, inspections, vehicle.
 *
 * Usage (from apps/web):
 *   CONFIRM=YES VRM=KE18FSX node scripts/reset-hire-finances.mjs
 *   CONFIRM=YES HIRE_GROUP_ID=<uuid> node scripts/reset-hire-finances.mjs
 *   CONFIRM=YES ALL=YES node scripts/reset-hire-finances.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FINANCE_GROUP_EVENT_TYPES = new Set([
  "driver_charge_added",
  "driver_charge_amended",
  "driver_charge_voided",
  "driver_charge_removed",
  "driver_charge_payment_submitted",
  "driver_charge_payment_approved",
  "driver_charge_payment_rejected",
  "driver_charge_payment_recorded",
  "payment_submitted",
  "payment_approved",
  "payment_rejected",
  "payment_amended",
  "schedule_discount_applied",
  "balance_payment_recorded",
  "settlement_recorded",
  "deposit_disposition_recorded",
  "end_hire_started",
  "end_hire_step_saved",
  "end_hire_finalised",
  "end_hire_cancelled",
  "hire_terminated",
  "hire_completed",
]);

function loadEnvLocal() {
  const path = resolve(__dirname, "../.env.local");
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function requireServiceClient() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function emptyStoragePrefix(sb, bucket, prefix = "") {
  const listed = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (listed.error) return;
  const entries = listed.data ?? [];
  const files = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id == null) {
      await emptyStoragePrefix(sb, bucket, path);
    } else {
      files.push(path);
    }
  }
  if (files.length) {
    const { error } = await sb.storage.from(bucket).remove(files);
    if (error) console.log(`  storage ${bucket}: ${error.message}`);
    else console.log(`  storage ${bucket}/${prefix}: removed ${files.length}`);
  }
}

async function resolveHireGroups(sb) {
  if (process.env.ALL === "YES") {
    const { data, error } = await sb
      .from("vehicle_hire_groups")
      .select("id, status, vehicle_id, parent_company_id");
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const hireGroupId = process.env.HIRE_GROUP_ID?.trim();
  const vrm = process.env.VRM?.trim();
  if (!hireGroupId && !vrm) {
    throw new Error("Pass VRM=… or HIRE_GROUP_ID=… or ALL=YES");
  }

  if (hireGroupId) {
    const { data, error } = await sb
      .from("vehicle_hire_groups")
      .select("id, status, vehicle_id, parent_company_id")
      .eq("id", hireGroupId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`No hire group ${hireGroupId}`);
    return [data];
  }

  const { data: vehicle, error: vErr } = await sb
    .from("vehicles")
    .select("id, vrm")
    .ilike("vrm", vrm)
    .maybeSingle();
  if (vErr) throw new Error(vErr.message);
  if (!vehicle) throw new Error(`No vehicle with VRM ${vrm}`);

  const { data, error } = await sb
    .from("vehicle_hire_groups")
    .select("id, status, vehicle_id, parent_company_id")
    .eq("vehicle_id", vehicle.id);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(`No hire groups for ${vehicle.vrm}`);
  console.log(`VRM ${vehicle.vrm} → ${data.length} hire group(s)`);
  return data;
}

async function resetOneHire(sb, group) {
  const hireId = group.id;
  console.log(`\n=== Hire ${hireId} (status=${group.status}) ===`);

  const { data: scheduleRows, error: sErr } = await sb
    .from("vehicle_hire_payment_schedule")
    .select("id")
    .eq("hire_group_id", hireId);
  if (sErr) throw new Error(sErr.message);
  const scheduleIds = (scheduleRows ?? []).map((r) => r.id);
  console.log(`  schedule rows: ${scheduleIds.length}`);

  // Order: allocations → balance payments → charges → status events → discounts → reset schedule → summary → events → group fields
  for (const [table, filter] of [
    ["vehicle_hire_payment_allocations", (q) => q.eq("hire_group_id", hireId)],
    ["vehicle_hire_balance_payments", (q) => q.eq("hire_group_id", hireId)],
    ["vehicle_hire_driver_charge_line_items", (q) => q.eq("hire_group_id", hireId)],
    ["vehicle_hire_financial_summary", (q) => q.eq("hire_group_id", hireId)],
  ]) {
    const { count: before } = await filter(
      sb.from(table).select("id", { count: "exact", head: true }),
    );
    if (!before) {
      console.log(`  ${table}: 0`);
      continue;
    }
    const { error } = await filter(sb.from(table).delete());
    if (error) {
      if (table === "vehicle_hire_payment_allocations" || table === "vehicle_hire_financial_summary") {
        console.log(`  ${table}: skip (${error.message})`);
        continue;
      }
      throw new Error(`${table}: ${error.message}`);
    }
    console.log(`  ${table}: deleted ${before}`);
  }

  if (scheduleIds.length) {
    const { count: eventBefore } = await sb
      .from("vehicle_hire_payment_status_events")
      .select("id", { count: "exact", head: true })
      .in("schedule_row_id", scheduleIds);
    if (eventBefore) {
      const { error } = await sb
        .from("vehicle_hire_payment_status_events")
        .delete()
        .in("schedule_row_id", scheduleIds);
      if (error) throw new Error(`payment_status_events: ${error.message}`);
      console.log(`  vehicle_hire_payment_status_events: deleted ${eventBefore}`);
    } else {
      console.log("  vehicle_hire_payment_status_events: 0");
    }

    const { count: discBefore } = await sb
      .from("vehicle_hire_schedule_discounts")
      .select("id", { count: "exact", head: true })
      .in("schedule_row_id", scheduleIds);
    if (discBefore) {
      const { error } = await sb
        .from("vehicle_hire_schedule_discounts")
        .delete()
        .in("schedule_row_id", scheduleIds);
      if (error) throw new Error(`schedule_discounts: ${error.message}`);
      console.log(`  vehicle_hire_schedule_discounts: deleted ${discBefore}`);
    } else {
      console.log("  vehicle_hire_schedule_discounts: 0");
    }

    const { error: resetErr } = await sb
      .from("vehicle_hire_payment_schedule")
      .update({
        payment_status: "not_received",
        approved_amount_gbp: null,
        received_payment_account_id: null,
        received_payment_method_id: null,
      })
      .eq("hire_group_id", hireId);
    if (resetErr) throw new Error(`schedule reset: ${resetErr.message}`);
    console.log("  schedule rows → not_received / cleared approvals");
  }

  const { data: events, error: eErr } = await sb
    .from("vehicle_hire_group_events")
    .select("id, event_type")
    .eq("hire_group_id", hireId);
  if (eErr) throw new Error(eErr.message);
  const financeEventIds = (events ?? [])
    .filter((e) => FINANCE_GROUP_EVENT_TYPES.has(e.event_type))
    .map((e) => e.id);
  if (financeEventIds.length) {
    const { error } = await sb
      .from("vehicle_hire_group_events")
      .delete()
      .in("id", financeEventIds);
    if (error) throw new Error(`group_events: ${error.message}`);
    console.log(`  finance group events: deleted ${financeEventIds.length}`);
  } else {
    console.log("  finance group events: 0");
  }

  const nextStatus = group.status === "ending" ? "active" : group.status;
  const { error: gErr } = await sb
    .from("vehicle_hire_groups")
    .update({
      status: nextStatus,
      end_hire_draft: null,
      terminated_at: null,
      termination_reason: null,
      termination_settlement: {},
      deposit_disposition: null,
      deposit_disposition_reason: null,
      deposit_refund_method: null,
      deposit_refund_amount_gbp: null,
      deposit_refund_reference: null,
      deposit_refund_recorded_at: null,
      settlement_balance_gbp: null,
      settlement_balance_direction: null,
      settlement_resolution: null,
      settlement_discount_gbp: null,
      ended_at: null,
    })
    .eq("id", hireId);
  if (gErr) throw new Error(`hire group reset: ${gErr.message}`);
  console.log(`  hire group settlement/end-hire cleared; status ${group.status} → ${nextStatus}`);

  await emptyStoragePrefix(sb, "hire-payment-proofs", hireId);
}

async function main() {
  if (process.env.CONFIRM !== "YES") {
    console.error("Refusing to run. Re-run with CONFIRM=YES …");
    process.exit(1);
  }

  const sb = requireServiceClient();
  const groups = await resolveHireGroups(sb);
  console.log(`Resetting finances for ${groups.length} hire group(s)…`);

  for (const group of groups) {
    await resetOneHire(sb, group);
  }

  // Quick verify for first group
  const hireId = groups[0]?.id;
  if (hireId) {
    console.log("\nVerify:");
    for (const [table, col] of [
      ["vehicle_hire_balance_payments", "hire_group_id"],
      ["vehicle_hire_driver_charge_line_items", "hire_group_id"],
      ["vehicle_hire_financial_summary", "hire_group_id"],
    ]) {
      const { count, error } = await sb
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(col, hireId);
      console.log(`  ${table}: ${error?.message ?? count}`);
    }
    const { data: sched } = await sb
      .from("vehicle_hire_payment_schedule")
      .select("payment_status")
      .eq("hire_group_id", hireId)
      .neq("payment_status", "not_received");
    console.log(`  schedule non-not_received: ${sched?.length ?? 0}`);
  }

  console.log("\nDone. Hire shell kept; finances wiped. Vehicle P&L income should read £0 on refresh.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
