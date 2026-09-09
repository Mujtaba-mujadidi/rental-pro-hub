/**
 * Heal: ended-hire settlement receipt that should have been a driver_charge receipt.
 * Usage (from apps/web):
 *   node ../../supabase/manual/heal_settlement_receipt_to_driver_charge.mjs <hireGroupId> [paymentId]
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
      if (out.NEXT_PUBLIC_SUPABASE_URL && out.SUPABASE_SERVICE_ROLE_KEY) return out;
    } catch {
      // continue
    }
  }
  throw new Error("Could not load apps/web/.env.local with service role");
}

function roundGbp(n) {
  return Math.round(n * 100) / 100;
}

const hireGroupId = process.argv[2]?.trim();
const paymentIdArg = process.argv[3]?.trim() || null;
if (!hireGroupId) {
  console.error("Usage: node heal_settlement_receipt_to_driver_charge.mjs <hireGroupId> [paymentId]");
  process.exit(1);
}

const env = loadEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: payments, error: payErr } = await admin
  .from("vehicle_hire_balance_payments")
  .select("id, amount_gbp, direction, payment_category, paid_at, notes")
  .eq("hire_group_id", hireGroupId)
  .eq("direction", "received_from_driver")
  .order("paid_at", { ascending: false });
if (payErr) throw payErr;

const target =
  (paymentIdArg ? payments?.find((p) => p.id === paymentIdArg) : null) ??
  payments?.find((p) => (p.payment_category ?? "settlement") === "settlement" && Number(p.amount_gbp) > 0);
if (!target) {
  console.log("No settlement receipt found to heal.");
  process.exit(0);
}

const amount = roundGbp(Number(target.amount_gbp));
console.log("Healing payment", target.id, amount);

const { data: charges, error: chargeErr } = await admin
  .from("vehicle_hire_driver_charge_line_items")
  .select("id, amount_gbp, resolution, charged_on, created_at, charge_type, description, paid_gbp")
  .eq("hire_group_id", hireGroupId)
  .order("created_at", { ascending: true });
if (chargeErr) throw chargeErr;

const openCharges = (charges ?? []).filter(
  (c) => c.resolution === "add_to_balance" && Number(c.amount_gbp) > 0.005,
);

const { data: existingEvents } = await admin
  .from("vehicle_hire_group_events")
  .select("id, event_type, metadata")
  .eq("hire_group_id", hireGroupId)
  .eq("event_type", "driver_charge_payment_recorded");

const alreadyLinked = (existingEvents ?? []).some(
  (e) => e.metadata && e.metadata.balancePaymentId === target.id,
);
if (alreadyLinked) {
  console.log("Payment already has driver_charge_payment_recorded event.");
  process.exit(0);
}

const { data: driverChargePayments } = await admin
  .from("vehicle_hire_balance_payments")
  .select("id, amount_gbp")
  .eq("hire_group_id", hireGroupId)
  .eq("payment_category", "driver_charge")
  .eq("direction", "received_from_driver");

const paidPool = roundGbp(
  (driverChargePayments ?? []).reduce((sum, p) => sum + Number(p.amount_gbp ?? 0), 0),
);
let paidRemaining = paidPool;
const balances = [];
for (const charge of openCharges) {
  const due = roundGbp(Number(charge.amount_gbp));
  const already = Math.min(due, paidRemaining);
  paidRemaining = roundGbp(Math.max(0, paidRemaining - already));
  const balance = roundGbp(due - already);
  if (balance > 0.005) balances.push({ ...charge, balanceGbp: balance });
}

let remaining = amount;
const allocations = [];
for (const row of balances) {
  if (remaining <= 0.005) break;
  const allocatedGbp = roundGbp(Math.min(remaining, row.balanceGbp));
  remaining = roundGbp(remaining - allocatedGbp);
  allocations.push({
    chargeLineItemId: row.id,
    amountGbp: allocatedGbp,
    label: row.charge_type || "Charge",
  });
}

if (!allocations.length) {
  console.error("No open add_to_balance charges to allocate this receipt to.");
  process.exit(1);
}

const { error: updErr } = await admin
  .from("vehicle_hire_balance_payments")
  .update({
    payment_category: "driver_charge",
    notes: target.notes?.trim()
      ? `${target.notes.trim()} (reclassified from settlement receipt)`
      : "Reclassified from settlement receipt to extra-charge collection.",
  })
  .eq("id", target.id);
if (updErr) throw updErr;

const { error: eventErr } = await admin.from("vehicle_hire_group_events").insert({
  hire_group_id: hireGroupId,
  event_type: "driver_charge_payment_recorded",
  summary: `Recorded £${amount.toFixed(2)} against extra charges.`,
  actor_role: "company_staff",
  metadata: {
    balancePaymentId: target.id,
    amountGbp: amount,
    healedFromSettlement: true,
    allocations,
  },
});
if (eventErr) throw eventErr;

console.log("Updated payment category + logged allocations:", allocations);
console.log("Reload the hire Payments page and vehicle Financials to refresh.");
