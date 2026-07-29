/**
 * Backfill deposit rent credits onto schedule rows for ended hires.
 * Usage (from apps/web): node scripts/backfill-hire-deposit-schedule-credit.mjs [--dry-run] [VRM]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const vrmArg = process.argv.slice(2).find((arg) => arg && !arg.startsWith("-") && !arg.includes("/"));
const vrmFilter = vrmArg?.trim().toUpperCase();

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

// Inline minimal credit logic (matches depositRentScheduleCreditGbp)
function depositCredit(disposition, depositGbp, signedRentBalanceGbp, refundAmount) {
  const owed = Math.max(0, Math.round(signedRentBalanceGbp * 100) / 100);
  const deposit = Math.max(0, Math.round(depositGbp * 100) / 100);
  if (owed <= 0 || deposit <= 0) return 0;
  const disp = String(disposition ?? "").trim();
  if (!disp || disp === "hold_pending") return 0;
  if (disp === "apply_to_balance" || disp === "forfeit" || disp === "refund_full") {
    return Math.min(deposit, owed);
  }
  if (disp === "refund_partial") {
    const refund = Math.max(0, Math.min(deposit, Number(refundAmount ?? 0)));
    return Math.min(deposit - refund, owed);
  }
  return 0;
}

let query = admin
  .from("vehicle_hire_groups")
  .select(
    "id, status, terminated_at, ended_at, deposit_disposition, deposit_refund_amount_gbp, termination_settlement, parent_company_id, vehicles(vrm)",
  )
  .in("status", ["terminated", "completed"])
  .not("deposit_disposition", "is", null)
  .neq("deposit_disposition", "hold_pending");

if (vrmFilter) {
  const { data: vehicles } = await admin.from("vehicles").select("id").ilike("vrm", vrmFilter);
  const vehicleIds = (vehicles ?? []).map((v) => v.id);
  if (!vehicleIds.length) {
    console.error(`No vehicle found for ${vrmFilter}`);
    process.exit(1);
  }
  query = query.in("vehicle_id", vehicleIds);
}

const { data: groups, error } = await query;
if (error) throw new Error(error.message);

console.log(`Found ${groups?.length ?? 0} ended hires with resolved deposit${dryRun ? " (dry run)" : ""}`);

let updated = 0;
for (const group of groups ?? []) {
  const term = group.termination_settlement;
  if (!term || typeof term !== "object") continue;
  const signedRentBalanceGbp = Number(term.signedRentBalanceGbp ?? 0);
  const depositGbp = Number(term.depositGbp ?? 0);
  const credit = depositCredit(
    group.deposit_disposition,
    depositGbp,
    signedRentBalanceGbp,
    group.deposit_refund_amount_gbp,
  );
  if (credit <= 0.005) continue;

  const accrualYmd =
    (group.terminated_at ?? group.ended_at ?? "").slice(0, 10);
  if (!accrualYmd) continue;

  const { data: rows } = await admin
    .from("vehicle_hire_payment_schedule")
    .select("id, period_start, row_kind, base_amount_gbp, payment_status, approved_amount_gbp, vehicle_hire_schedule_discounts(amount_gbp)")
    .eq("hire_group_id", group.id)
    .eq("row_kind", "rent")
    .lte("period_start", accrualYmd)
    .order("period_start");

  const unpaid = (rows ?? []).filter((row) => {
    const disc = (row.vehicle_hire_schedule_discounts ?? []).reduce((s, d) => s + Number(d.amount_gbp ?? 0), 0);
    const due = Math.max(0, Number(row.base_amount_gbp) - disc);
    const paid = row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : row.payment_status === "approved" ? due : 0;
    return due - paid > 0.005;
  });

  if (!unpaid.length) continue;

  const vehicle = group.vehicles;
  const vrm = vehicle?.vrm ?? group.id.slice(0, 8);
  console.log(`\n${vrm} · ${group.id.slice(0, 8)}… credit £${credit.toFixed(2)} · ${unpaid.length} unpaid accrued rent row(s)`);

  if (dryRun) {
    updated += 1;
    continue;
  }

  const { data: staff } = await admin
    .from("user_company_memberships")
    .select("user_id")
    .eq("parent_company_id", group.parent_company_id)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();

  const userId = staff?.user_id;
  if (!userId) {
    console.warn(`  Skipping ${group.id.slice(0, 8)} — no admin member for audit actor`);
    continue;
  }

  // Dynamic import of persist would need tsx; apply updates inline
  let remaining = credit;
  for (const row of unpaid) {
    if (remaining <= 0.005) break;
    const disc = (row.vehicle_hire_schedule_discounts ?? []).reduce((s, d) => s + Number(d.amount_gbp ?? 0), 0);
    const due = Math.max(0, Number(row.base_amount_gbp) - disc);
    const priorPaid = row.approved_amount_gbp != null ? Number(row.approved_amount_gbp) : 0;
    const rowBalance = due - priorPaid;
    const alloc = Math.min(remaining, rowBalance);
    const approvedAmount = Math.round((priorPaid + alloc) * 100) / 100;
    remaining = Math.round((remaining - alloc) * 100) / 100;

    await admin.from("vehicle_hire_payment_status_events").insert({
      schedule_row_id: row.id,
      event_kind: "status_change",
      from_status: row.payment_status,
      to_status: "approved",
      comment: "Deposit applied to rent (backfill)",
      amendment_payload: { depositAppliedGbp: alloc, approvedAmountGbp: approvedAmount, backfill: true },
      actor_user_id: userId,
      actor_role: "company_staff",
    });
    await admin
      .from("vehicle_hire_payment_schedule")
      .update({ payment_status: "approved", approved_amount_gbp: approvedAmount })
      .eq("id", row.id);
  }
  updated += 1;
}

console.log(`\n${dryRun ? "Would update" : "Updated"} ${updated} hire(s).`);
