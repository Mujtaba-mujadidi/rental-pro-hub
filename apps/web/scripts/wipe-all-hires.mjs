/**
 * Destructive: delete ALL vehicle hire groups and hire-linked data.
 * Keeps: companies, staff, drivers, driver links, vehicles, payment accounts,
 * hire terms versions, platform contracts, etc.
 *
 * Usage (from apps/web):
 *   CONFIRM=YES node scripts/wipe-all-hires.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

async function count(sb, table, filter) {
  let q = sb.from(table).select("id", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) return { error: error.message };
  return { count: n ?? 0 };
}

async function deleteAll(sb, table, label) {
  const before = await count(sb, table);
  if (before.error) {
    console.log(`  skip ${label}: ${before.error}`);
    return { deleted: 0, skipped: true };
  }
  if (!before.count) {
    console.log(`  ${label}: 0`);
    return { deleted: 0 };
  }
  const { error } = await sb.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(`${label} delete failed: ${error.message}`);
  const after = await count(sb, table);
  console.log(`  ${label}: ${before.count} → ${after.count ?? "?"}`);
  return { deleted: before.count };
}

async function emptyStoragePrefix(sb, bucket, prefix = "") {
  const listed = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
  if (listed.error) {
    console.log(`  storage ${bucket}/${prefix || ""}: ${listed.error.message}`);
    return;
  }
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
    if (error) console.log(`  storage remove ${bucket}: ${error.message}`);
    else console.log(`  storage ${bucket}: removed ${files.length} object(s) under ${prefix || "/"}`);
  }
}

async function main() {
  if (process.env.CONFIRM !== "YES") {
    console.error("Refusing to run. Re-run with CONFIRM=YES to wipe all hires.");
    process.exit(1);
  }

  const sb = requireServiceClient();

  const hireCount = await count(sb, "vehicle_hire_groups");
  if (hireCount.error) throw new Error(hireCount.error);
  console.log(`Found ${hireCount.count} hire group(s).`);

  const { data: groups, error: groupsError } = await sb
    .from("vehicle_hire_groups")
    .select("id, status, vehicle_id");
  if (groupsError) throw new Error(groupsError.message);
  const hireIds = (groups ?? []).map((g) => g.id);
  const vehicleIds = [
    ...new Set((groups ?? []).map((g) => g.vehicle_id).filter(Boolean)),
  ];

  console.log("\n1) Clear self-references on hire groups…");
  if (hireIds.length) {
    const { error } = await sb
      .from("vehicle_hire_groups")
      .update({
        supersedes_hire_group_id: null,
        superseded_by_hire_group_id: null,
      })
      .in("id", hireIds);
    if (error) throw new Error(`clear hire self-refs: ${error.message}`);
  }

  console.log("\n2) Clear transfer / intent hire pointers (best-effort)…");
  // Columns vary by table; ignore missing-column errors.
  for (const [table, patch] of [
    ["vehicle_subcompany_transfers", { superseded_hire_group_id: null, supersession_hire_group_id: null }],
    ["vehicle_subcompany_transfer_intents", { superseded_hire_group_id: null }],
  ]) {
    const { error } = await sb.from(table).update(patch).not("id", "is", null);
    if (error) console.log(`  ${table}: skip (${error.message})`);
    else console.log(`  ${table}: cleared hire pointers`);
  }

  console.log("\n3) Collect & delete hire e-sign envelopes…");
  let envelopeIds = [];
  if (hireIds.length) {
    const { data: agreements, error } = await sb
      .from("vehicle_hire_agreements")
      .select("esign_envelope_id")
      .in("hire_group_id", hireIds)
      .not("esign_envelope_id", "is", null);
    if (error) throw new Error(error.message);
    envelopeIds = [
      ...new Set((agreements ?? []).map((a) => a.esign_envelope_id).filter(Boolean)),
    ];
  }
  const { data: hireEnvelopes } = await sb
    .from("esign_envelopes")
    .select("id")
    .eq("context_type", "vehicle_hire_agreement");
  for (const row of hireEnvelopes ?? []) envelopeIds.push(row.id);
  envelopeIds = [...new Set(envelopeIds)];
  console.log(`  envelopes to delete: ${envelopeIds.length}`);
  if (envelopeIds.length) {
    // Null agreement links first so envelope delete is not blocked.
    await sb
      .from("vehicle_hire_agreements")
      .update({ esign_envelope_id: null })
      .in("esign_envelope_id", envelopeIds);
    const { error } = await sb.from("esign_envelopes").delete().in("id", envelopeIds);
    if (error) throw new Error(`esign_envelopes: ${error.message}`);
  }

  console.log("\n4) Delete hire groups (cascades child hire tables + access requests)…");
  await deleteAll(sb, "vehicle_hire_groups", "vehicle_hire_groups");

  console.log("\n5) Reset vehicle status — no hires remain, so clear on_rent/reserved…");
  {
    const { data: stuck, error: stuckErr } = await sb
      .from("vehicles")
      .select("id, vrm, status")
      .in("status", ["on_rent", "reserved"]);
    if (stuckErr) throw new Error(`vehicles list: ${stuckErr.message}`);
    if (stuck?.length) {
      const { error } = await sb
        .from("vehicles")
        .update({ status: "available" })
        .in(
          "id",
          stuck.map((v) => v.id),
        );
      if (error) throw new Error(`vehicles status: ${error.message}`);
      console.log(
        `  reset → available: ${stuck.map((v) => `${v.vrm}(${v.status})`).join(", ")}`,
      );
    } else {
      console.log("  no vehicles to reset");
    }
  }

  console.log("\n6) Best-effort storage cleanup (hire buckets only; not platform e-sign)…");
  for (const bucket of ["hire-inspection-media", "hire-insurance", "hire-payment-proofs"]) {
    await emptyStoragePrefix(sb, bucket);
  }

  console.log("\n7) Verify preserved / cleared counts…");
  const checks = [
    "vehicle_hire_groups",
    "vehicle_hire_agreements",
    "vehicle_hire_payment_schedule",
    "vehicle_hire_inspections",
    "vehicle_hire_balance_payments",
    "vehicle_hire_driver_charge_line_items",
    "vehicles",
    "companies",
    "company_driver_links",
  ];
  for (const table of checks) {
    const r = await count(sb, table);
    console.log(`  ${table}: ${r.error ?? r.count}`);
  }

  console.log("\nDone. Accounts, drivers, and vehicles kept. All hires wiped.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
