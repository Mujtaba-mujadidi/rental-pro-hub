/**
 * One-off hire financial audit for a vehicle VRM.
 * Usage (from apps/web): node scripts/audit-vehicle-hire.mjs FJ67YMD
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VRM = (process.argv[2] ?? "FJ67YMD").trim().toUpperCase();

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

function gbp(n) {
  return `£${(Math.round(n * 100) / 100).toFixed(2)}`;
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function netDue(base, discount) {
  return round(Math.max(0, base - discount));
}

function rowPaid(row) {
  if (row.approved_amount_gbp != null && row.approved_amount_gbp >= 0) {
    return round(Number(row.approved_amount_gbp));
  }
  if (row.payment_status === "approved") {
    const disc = (row.vehicle_hire_schedule_discounts ?? []).reduce(
      (s, d) => s + Number(d.amount_gbp ?? 0),
      0,
    );
    return netDue(Number(row.base_amount_gbp), disc);
  }
  return 0;
}

function signedSettlement(direction, amount) {
  const a = round(Math.abs(Number(amount ?? 0)));
  if (!direction || direction === "settled" || a === 0) return 0;
  return direction === "driver_owes_company" ? a : -a;
}

function remainingBalance(signed, payments) {
  let r = signed;
  for (const p of payments) {
    const amt = round(Number(p.amount_gbp ?? 0));
    if (p.direction === "received_from_driver") r = round(r - amt);
    else r = round(r + amt);
  }
  if (Math.abs(r) < 0.005) return 0;
  return r;
}

function depositRetention(disposition, depositGbp, signedRentBalance, refundAmount) {
  const deposit = round(Number(depositGbp ?? 0));
  const disp = String(disposition ?? "").trim();
  if (deposit <= 0 || !disp || disp === "hold_pending" || disp === "refund_full") return 0;
  if (disp === "refund_partial") {
    const refund = Math.max(0, Math.min(deposit, Number(refundAmount ?? 0)));
    return round(deposit - refund);
  }
  if (disp === "forfeit") return deposit;
  if (disp === "apply_to_balance") {
    return round(Math.min(deposit, Math.max(0, Number(signedRentBalance ?? 0))));
  }
  return 0;
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: vehicle, error: vErr } = await admin
  .from("vehicles")
  .select("id, vrm, make, model, parent_company_id")
  .ilike("vrm", VRM)
  .maybeSingle();
if (vErr) throw new Error(vErr.message);
if (!vehicle?.id) {
  console.error(`Vehicle ${VRM} not found`);
  process.exit(1);
}

const { data: groups, error: gErr } = await admin
  .from("vehicle_hire_groups")
  .select(
    "id, status, start_date, activated_at, terminated_at, ended_at, driver_email, driver_licence_number, rent_cadence, rent_amount_gbp, deposit_gbp, include_deposit, settlement_balance_gbp, settlement_balance_direction, settlement_resolution, settlement_discount_gbp, deposit_disposition, deposit_refund_amount_gbp, termination_settlement, created_at",
  )
  .eq("vehicle_id", vehicle.id)
  .order("created_at", { ascending: true });
if (gErr) throw new Error(gErr.message);

const groupIds = (groups ?? []).map((g) => g.id);
let schedule = [];
let balancePayments = [];
let charges = [];

if (groupIds.length) {
  const [{ data: sched, error: sErr }, { data: bal, error: bErr }, { data: ch, error: cErr }] =
    await Promise.all([
      admin
        .from("vehicle_hire_payment_schedule")
        .select(
          "id, hire_group_id, period_start, period_end, row_kind, base_amount_gbp, payment_status, approved_amount_gbp, sort_order, vehicle_hire_schedule_discounts(amount_gbp)",
        )
        .in("hire_group_id", groupIds)
        .order("sort_order"),
      admin
        .from("vehicle_hire_balance_payments")
        .select("id, hire_group_id, amount_gbp, direction, payment_method, paid_at, notes, payment_category")
        .in("hire_group_id", groupIds)
        .order("paid_at"),
      admin
        .from("vehicle_hire_driver_charge_line_items")
        .select("id, hire_group_id, charge_type, amount_gbp, resolution, created_at")
        .in("hire_group_id", groupIds),
    ]);
  if (sErr) throw new Error(sErr.message);
  if (bErr) throw new Error(bErr.message);
  if (cErr && cErr.code !== "42P01") throw new Error(cErr.message);
  schedule = sched ?? [];
  balancePayments = bal ?? [];
  charges = ch ?? [];
}

const schedByGroup = new Map();
for (const row of schedule) {
  const list = schedByGroup.get(row.hire_group_id) ?? [];
  list.push(row);
  schedByGroup.set(row.hire_group_id, list);
}
const balByGroup = new Map();
for (const row of balancePayments) {
  const list = balByGroup.get(row.hire_group_id) ?? [];
  list.push(row);
  balByGroup.set(row.hire_group_id, list);
}
const chByGroup = new Map();
for (const row of charges) {
  const list = chByGroup.get(row.hire_group_id) ?? [];
  list.push(row);
  chByGroup.set(row.hire_group_id, list);
}

console.log(`\n# Hire financial audit — ${vehicle.vrm} (${vehicle.make ?? ""} ${vehicle.model ?? ""})`);
console.log(`Vehicle ID: ${vehicle.id}`);
console.log(`Hire contracts found: ${groups?.length ?? 0}\n`);

const vehicleIncomeParts = {
  scheduleRent: 0,
  depositRetention: 0,
  driverCharges: 0,
  supplementalCollections: 0,
  writeOffs: 0,
};

for (const [i, group] of (groups ?? []).entries()) {
  const gid = group.id;
  const driver =
    (group.driver_email ?? "").trim() || (group.driver_licence_number ?? "").trim() || "—";
  const rows = schedByGroup.get(gid) ?? [];
  const bals = balByGroup.get(gid) ?? [];
  const groupCharges = chByGroup.get(gid) ?? [];
  const term = group.termination_settlement ?? null;

  console.log(`---\n## Rental ${i + 1}: ${gid.slice(0, 8)}…`);
  console.log(`- Status: **${group.status}**`);
  console.log(`- Driver: ${driver}`);
  console.log(`- Start: ${group.start_date ?? "—"}`);
  console.log(`- Ended: ${(group.terminated_at ?? group.ended_at ?? "—").slice(0, 10)}`);
  console.log(`- Rent: ${gbp(Number(group.rent_amount_gbp ?? 0))}/${group.rent_cadence ?? "?"}`);
  if (group.include_deposit) console.log(`- Contract deposit: ${gbp(Number(group.deposit_gbp ?? 0))}`);

  console.log(`\n### Schedule payments (cash on payment sheet)`);
  let scheduleIn = 0;
  let scheduleRentDue = 0;
  let scheduleRentPaid = 0;
  for (const row of rows) {
    const disc = (row.vehicle_hire_schedule_discounts ?? []).reduce(
      (s, d) => s + Number(d.amount_gbp ?? 0),
      0,
    );
    const due = netDue(Number(row.base_amount_gbp), disc);
    const paid = rowPaid(row);
    const bal = round(due - paid);
    if (row.row_kind === "rent") {
      scheduleRentDue += due;
      scheduleRentPaid += paid;
    }
    if (paid > 0) scheduleIn += paid;
    const label =
      row.row_kind === "deposit"
        ? "Deposit"
        : `${row.period_start} – ${row.period_end}`;
    console.log(
      `  - [IN] ${label}: due ${gbp(due)}, paid ${gbp(paid)}, balance ${gbp(bal)} (${row.payment_status})`,
    );
  }
  console.log(`  **Schedule rent subtotal:** due ${gbp(scheduleRentDue)}, paid ${gbp(scheduleRentPaid)}, balance ${gbp(round(scheduleRentDue - scheduleRentPaid))}`);

  console.log(`\n### Settlement ledger (post–contract-end balance payments)`);
  let balIn = 0;
  let balOut = 0;
  for (const p of bals) {
    const amt = round(Number(p.amount_gbp ?? 0));
    if (p.direction === "received_from_driver") {
      balIn += amt;
      console.log(`  - [IN] ${gbp(amt)} received from driver — ${p.notes ?? p.payment_method ?? ""} (${(p.paid_at ?? "").slice(0, 10)})`);
    } else {
      balOut += amt;
      console.log(`  - [OUT] ${gbp(amt)} paid to driver — ${p.notes ?? p.payment_method ?? ""} (${(p.paid_at ?? "").slice(0, 10)})`);
    }
  }
  if (!bals.length) console.log(`  - (none)`);

  const dir = group.settlement_balance_direction;
  const storedBal = Number(group.settlement_balance_gbp ?? 0);
  const signed = signedSettlement(dir, storedBal);
  const openSigned = remainingBalance(signed, bals);
  const openDir =
    openSigned > 0.005 ? "driver_owes_company" : openSigned < -0.005 ? "company_owes_driver" : "settled";

  console.log(`\n### Open balance (this hire only — not shared across contracts)`);
  console.log(`  - Stored on hire row: direction=\`${dir ?? "null"}\`, amount=${gbp(storedBal)}`);
  console.log(`  - After ledger payments: **${openDir === "settled" ? "SETTLED" : openDir}** ${gbp(Math.abs(openSigned))}`);
  console.log(`  - Settlement resolution: ${group.settlement_resolution ?? "—"}`);
  console.log(`  - Deposit disposition: ${group.deposit_disposition ?? "—"}`);

  if (term && typeof term === "object") {
    console.log(`\n### Termination snapshot (stored at contract end)`);
    console.log(`  - Accrued rent due: ${gbp(Number(term.accruedRentDueGbp ?? 0))}`);
    console.log(`  - Accrued rent paid (schedule): ${gbp(Number(term.accruedRentPaidGbp ?? 0))}`);
    console.log(`  - Signed rent balance: ${gbp(Number(term.signedRentBalanceGbp ?? 0))}`);
    console.log(`  - Deposit: ${gbp(Number(term.depositGbp ?? 0))}`);
    console.log(`  - Net settlement: ${gbp(Number(term.netSettlementGbp ?? 0))} (${term.balanceDirection ?? "?"})`);
  }

  const signedRentBal = term?.signedRentBalanceGbp ?? round(scheduleRentDue - scheduleRentPaid);
  const depRet = depositRetention(
    group.deposit_disposition,
    group.deposit_gbp,
    signedRentBal,
    group.deposit_refund_amount_gbp,
  );
  const chargeIncome = groupCharges
    .filter((c) => c.resolution === "paid_now" || c.resolution === "added_to_balance")
    .reduce((s, c) => s + round(Number(c.amount_gbp ?? 0)), 0);

  const endedDue = term ? Number(term.accruedRentDueGbp ?? 0) : scheduleRentDue;
  const endedPaid = term ? Number(term.accruedRentPaidGbp ?? 0) : scheduleRentPaid;
  const rentIncome = endedDue > 0 ? round(Math.min(endedPaid, endedDue)) : 0;

  console.log(`\n### Expected company position for this rental`);
  console.log(`  - Rent income (accrued, min of due/paid on schedule): ${gbp(rentIncome)}`);
  console.log(`  - Deposit retained (company keeps): ${gbp(depRet)}`);
  console.log(`  - Driver charge income: ${gbp(chargeIncome)}`);
  console.log(`  - Cash IN (schedule + settlement received): ${gbp(scheduleIn + balIn)}`);
  console.log(`  - Cash OUT (settlement paid to driver): ${gbp(balOut)}`);
  console.log(`  - Net cash movement (IN − OUT): ${gbp(scheduleIn + balIn - balOut)}`);

  console.log(`\n### What Payments UI likely shows (raw schedule — may disagree if deposit not applied to sheet)`);
  console.log(`  - Payment summary "Balance": ${gbp(Math.max(0, scheduleRentDue - scheduleRentPaid))} (rent rows only)`);
  console.log(
    `  - Open settlement banner: ${openDir === "settled" ? "Rent settlement cleared" : `${openDir} ${gbp(Math.abs(openSigned))}`}`,
  );

  const issues = [];
  if (term && Math.abs(Number(term.signedRentBalanceGbp ?? 0)) > 0.005) {
    const disp = group.deposit_disposition;
    if (
      (disp === "apply_to_balance" || disp === "refund_full") &&
      round(scheduleRentDue - scheduleRentPaid) > 0.005
    ) {
      issues.push(
        `Rent schedule still shows ${gbp(round(scheduleRentDue - scheduleRentPaid))} due but termination applied deposit/settlement (known bug if ended before fix).`,
      );
    }
  }
  if (openDir !== "settled" && group.status !== "active") {
    issues.push(`Settlement not fully cleared: ${openDir} ${gbp(Math.abs(openSigned))}`);
  }
  if (issues.length) {
    console.log(`\n### ⚠ Issues`);
    for (const issue of issues) console.log(`  - ${issue}`);
  } else {
    console.log(`\n### ✓ No obvious ledger inconsistencies detected for this contract`);
  }

  vehicleIncomeParts.scheduleRent += rentIncome;
  vehicleIncomeParts.depositRetention += depRet;
  vehicleIncomeParts.driverCharges += chargeIncome;
  vehicleIncomeParts.writeOffs += round(Number(group.settlement_discount_gbp ?? 0));
}

const totalNetIncome = round(
  vehicleIncomeParts.scheduleRent +
    vehicleIncomeParts.depositRetention +
    vehicleIncomeParts.driverCharges -
    vehicleIncomeParts.writeOffs,
);

console.log(`\n---\n## Vehicle totals (all ${groups?.length ?? 0} rentals on ${VRM})`);
console.log(`| Component | Amount |`);
console.log(`|-----------|--------|`);
console.log(`| Schedule rent income (accrued) | ${gbp(vehicleIncomeParts.scheduleRent)} |`);
console.log(`| Deposit retention | ${gbp(vehicleIncomeParts.depositRetention)} |`);
console.log(`| Driver charges | ${gbp(vehicleIncomeParts.driverCharges)} |`);
console.log(`| Settlement write-offs | −${gbp(vehicleIncomeParts.writeOffs)} |`);
console.log(`| **Expected net rental income** | **${gbp(totalNetIncome)}** |`);
console.log(`\nCompare with Vehicle → Financials → "Rental income" on the same vehicle in the app.`);
console.log(`Each hire group has its own \`settlement_balance_*\` fields — balances do not roll across contracts.\n`);
