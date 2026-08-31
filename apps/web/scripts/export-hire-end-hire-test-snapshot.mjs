/**
 * Export hire financial snapshot for end-hire manual test case authoring.
 *
 * Usage (from apps/web):
 *   node scripts/export-hire-end-hire-test-snapshot.mjs 509cc528
 *   HIRE_SHORT_ID=509cc528 node scripts/export-hire-end-hire-test-snapshot.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

function roundGbp(n) {
  return Math.round(Number(n ?? 0) * 100) / 100;
}

async function main() {
  const shortId = (process.argv[2] ?? process.env.HIRE_SHORT_ID ?? "").trim().toLowerCase();
  if (!shortId) {
    console.error("Usage: node scripts/export-hire-end-hire-test-snapshot.mjs <hire-short-id>");
    process.exit(1);
  }

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: allGroups, error: groupErr } = await sb
    .from("vehicle_hire_groups")
    .select(
      "id, status, parent_company_id, subcompany_id, driver_email, activated_at, terminated_at, ended_at, settlement_balance_gbp, settlement_balance_direction, deposit_disposition, termination_settlement, end_hire_draft, vehicles(vrm)",
    )
    .order("activated_at", { ascending: false })
    .limit(200);
  if (groupErr) throw new Error(groupErr.message);
  const groups = (allGroups ?? []).filter((g) =>
    String(g.id ?? "")
      .toLowerCase()
      .startsWith(shortId),
  );
  if (!groups.length) {
    console.error(`No hire found matching id prefix: ${shortId}`);
    process.exit(1);
  }
  const hire = groups[0];
  const hireId = hire.id;
  const vrm = hire.vehicles?.vrm ?? "";

  const [
    { data: scheduleRows },
    { data: chargeRows },
    { data: balancePayments },
    { data: events },
    { data: inspections },
  ] = await Promise.all([
    sb
      .from("vehicle_hire_payment_schedule")
      .select(
        "id, row_kind, period_start, period_end, base_amount_gbp, payment_status, approved_amount_gbp, sort_order",
      )
      .eq("hire_group_id", hireId)
      .order("sort_order", { ascending: true }),
    sb
      .from("vehicle_hire_driver_charge_line_items")
      .select(
        "id, charge_type, amount_gbp, resolution, source_kind, description, charged_on, created_at, paid_gbp, collection_status, balance_payment_id",
      )
      .eq("hire_group_id", hireId)
      .order("created_at", { ascending: true }),
    sb
      .from("vehicle_hire_balance_payments")
      .select(
        "id, amount_gbp, direction, payment_category, payment_method, payment_reference, paid_at, notes",
      )
      .eq("hire_group_id", hireId)
      .order("paid_at", { ascending: true }),
    sb
      .from("vehicle_hire_group_events")
      .select("event_type, created_at, summary, metadata")
      .eq("hire_group_id", hireId)
      .order("created_at", { ascending: true }),
    sb
      .from("vehicle_hire_inspections")
      .select("id, kind, status, created_at, completed_at")
      .eq("hire_group_id", hireId)
      .order("created_at", { ascending: true }),
  ]);

  const metaRows = [
    {
      field: "hire_group_id",
      value: hireId,
    },
    {
      field: "hire_short_id",
      value: hireId.slice(0, 8),
    },
    {
      field: "vehicle_vrm",
      value: vrm,
    },
    {
      field: "status",
      value: hire.status,
    },
    {
      field: "driver_email",
      value: hire.driver_email ?? "",
    },
    {
      field: "activated_at",
      value: hire.activated_at ?? "",
    },
    {
      field: "terminated_at",
      value: hire.terminated_at ?? "",
    },
    {
      field: "ended_at",
      value: hire.ended_at ?? "",
    },
    {
      field: "settlement_balance_gbp",
      value: roundGbp(hire.settlement_balance_gbp),
    },
    {
      field: "settlement_balance_direction",
      value: hire.settlement_balance_direction ?? "",
    },
    {
      field: "deposit_disposition",
      value: hire.deposit_disposition ?? "",
    },
    {
      field: "end_hire_draft_step",
      value: hire.end_hire_draft?.step ?? "",
    },
    {
      field: "end_hire_draft_started",
      value: hire.end_hire_draft?.started ?? false,
    },
    {
      field: "exported_at_utc",
      value: new Date().toISOString(),
    },
  ];

  const scheduleCsv = (scheduleRows ?? []).map((row) => ({
    id: row.id,
    row_kind: row.row_kind,
    period_start: row.period_start,
    period_end: row.period_end,
    base_amount_gbp: roundGbp(row.base_amount_gbp),
    payment_status: row.payment_status,
    approved_gbp: row.approved_amount_gbp == null ? "" : roundGbp(row.approved_amount_gbp),
  }));

  const chargesCsv = (chargeRows ?? []).map((row) => ({
    id: row.id,
    charge_type: row.charge_type,
    amount_gbp: roundGbp(row.amount_gbp),
    resolution: row.resolution,
    source_kind: row.source_kind,
    description: row.description ?? "",
    charged_on: row.charged_on ?? "",
    paid_gbp: roundGbp(row.paid_gbp),
    collection_status: row.collection_status ?? "",
    balance_payment_id: row.balance_payment_id ?? "",
  }));

  const paymentsCsv = (balancePayments ?? []).map((row) => ({
    id: row.id,
    amount_gbp: roundGbp(row.amount_gbp),
    direction: row.direction,
    payment_category: row.payment_category,
    payment_method: row.payment_method ?? "",
    payment_reference: row.payment_reference ?? "",
    paid_at: row.paid_at ?? "",
    notes: row.notes ?? "",
  }));

  const inspectionsCsv = (inspections ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    created_at: row.created_at,
    completed_at: row.completed_at ?? "",
  }));

  const recentEvents = (events ?? []).slice(-40).map((row) => ({
    event_type: row.event_type,
    created_at: row.created_at,
    summary: row.summary ?? "",
  }));

  const outDir = resolve(__dirname, "../../../docs/testing/end-hire");
  mkdirSync(outDir, { recursive: true });
  const base = `hire-${shortId}-end-hire-baseline`;

  writeFileSync(resolve(outDir, `${base}-meta.csv`), toCsv(metaRows));
  writeFileSync(resolve(outDir, `${base}-schedule.csv`), toCsv(scheduleCsv));
  writeFileSync(resolve(outDir, `${base}-extra-charges.csv`), toCsv(chargesCsv));
  writeFileSync(resolve(outDir, `${base}-balance-payments.csv`), toCsv(paymentsCsv));
  writeFileSync(resolve(outDir, `${base}-inspections.csv`), toCsv(inspectionsCsv));
  writeFileSync(resolve(outDir, `${base}-recent-events.csv`), toCsv(recentEvents));

  // Excel workbook (open in Excel / Numbers)
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "RMS end-hire test export";
  wb.created = new Date();

  function addSheet(name, rows) {
    const ws = wb.addWorksheet(name);
    if (!rows.length) {
      ws.addRow(["(empty)"]);
      return;
    }
    const headers = Object.keys(rows[0]);
    ws.addRow(headers);
    for (const row of rows) ws.addRow(headers.map((h) => row[h]));
    ws.columns.forEach((col) => {
      col.width = Math.min(48, Math.max(12, String(col.header ?? "").length + 2));
    });
  }

  const testSteps = [
    {
      step: "E2E-00",
      phase: "Baseline",
      action: "Open Payments & balance for Hire #509cc528 (KE18FSX). Confirm rent schedule, extras, deposit match Baseline sheets.",
      expected: "UI matches exported baseline CSVs in docs/testing/end-hire/. Note £20 car wash partial, £30 PCN due, voided damage.",
      pass_fail: "",
      notes: "",
    },
    {
      step: "E2E-01",
      phase: "Start end hire",
      action: "Hire workspace → End hire tab → Start contract termination.",
      expected: "Status → ending. Draft step = Return details. Cancel still available.",
      pass_fail: "",
      notes: "",
    },
    {
      step: "E2E-02",
      phase: "Return details",
      action: "Enter return date/time, reason (e.g. Planned return), optional notes → Continue.",
      expected: "Draft saved. Step advances to Financial review.",
      pass_fail: "",
      notes: "",
    },
    {
      step: "E2E-03",
      phase: "Financial review",
      action: "Review rent / deposit / extra charges cards. Resolve any pending payment approvals first if shown.",
      expected: "Rent, deposit, extras totals clear. Position shows driver owes / company owes before check-in. Pending items listed separately.",
      pass_fail: "",
      notes: "Record actual £ figures from UI",
    },
    {
      step: "E2E-04",
      phase: "Confirm return",
      action: "Confirm return (terminate).",
      expected: "Hire → terminated. Deposit disposition hold_pending. Open balance written to settlement fields. Hire appears on Balances (active/final per rules).",
      pass_fail: "",
      notes: "",
    },
    {
      step: "E2E-05",
      phase: "Check-in — damages",
      action: "Complete vehicle check-in. Add 2+ new damages with mixed resolutions: e.g. (1) waived / No charge, (2) add_to_balance, (3) paid_now if testing cash.",
      expected: "Each resolution applied correctly: waived = no charge line; add_to_balance increases settlement; paid_now creates receipt + charge.",
      pass_fail: "",
      notes: "List damage descriptions + £ here",
    },
    {
      step: "E2E-06",
      phase: "Check-in — complete",
      action: "Complete check-in inspection → Continue to final account.",
      expected: "Check-in status completed. New check-in damage lines on extras / settlement. Wizard step = Final account.",
      pass_fail: "",
      notes: "",
    },
    {
      step: "E2E-07",
      phase: "Final account",
      action: "Review open balance KPIs. Open Payments / Balances links. Decide deposit disposition (refund / deduct / hold) and record settlement payments as needed.",
      expected: "Staff can see full picture: rent + extras + check-in damages + deposit. Clear what still needs collecting or refunding.",
      pass_fail: "",
      notes: "",
    },
    {
      step: "E2E-08",
      phase: "Deposit resolution",
      action: "On Payments or Balances workspace: resolve deposit (refund full / partial / forfeit / apply to balance).",
      expected: "Deposit disposition recorded. Settlement balance updates. Audit event logged.",
      pass_fail: "",
      notes: "",
    },
    {
      step: "E2E-09",
      phase: "Settlement payments",
      action: "Record any final driver payment or company refund on balance sheet.",
      expected: "Balance payments appear on account statement. Open balance reduces toward settled.",
      pass_fail: "",
      notes: "",
    },
    {
      step: "E2E-10",
      phase: "Finalise",
      action: "Return to End hire → Final account → Finalise contract termination.",
      expected: "Status → completed. explicitFinalization on draft. Cancel no longer available.",
      pass_fail: "",
      notes: "",
    },
    {
      step: "E2E-11",
      phase: "Balances verify",
      action: "Company Balances → find hire. Open balance workspace. Compare to expected outcome sheet.",
      expected: "Final settlement direction/amount correct. All charges/deposit decisions reflected. No orphan payments on voided lines.",
      pass_fail: "",
      notes: "",
    },
  ];

  const expectedOutcomes = [
    {
      item: "Rent accrued to return",
      expected_gbp: "",
      actual_gbp: "",
      notes: "",
    },
    {
      item: "Extra charges outstanding (pre check-in)",
      expected_gbp: "50",
      actual_gbp: "",
      notes: "£20 car wash + £30 PCN due per baseline",
    },
    {
      item: "Check-in damages add_to_balance",
      expected_gbp: "",
      actual_gbp: "",
      notes: "Fill after check-in",
    },
    {
      item: "Deposit held",
      expected_gbp: "",
      actual_gbp: "",
      notes: "",
    },
    {
      item: "Final settlement (driver owes company)",
      expected_gbp: "",
      actual_gbp: "",
      notes: "",
    },
    {
      item: "Balances list tab",
      expected: "",
      actual: "",
      notes: "active / final_settlements / settled",
    },
  ];

  addSheet("TestSteps", testSteps);
  addSheet("ExpectedOutcomes", expectedOutcomes);
  addSheet("Meta", metaRows);
  addSheet("Schedule", scheduleCsv);
  addSheet("ExtraCharges", chargesCsv);
  addSheet("BalancePayments", paymentsCsv);
  addSheet("Inspections", inspectionsCsv);
  addSheet("RecentEvents", recentEvents);

  const xlsxPath = resolve(outDir, `${base}.xlsx`);
  await wb.xlsx.writeFile(xlsxPath);

  console.log(`Exported baseline for Hire #${hireId.slice(0, 8)} (${vrm})`);
  console.log(`  status: ${hire.status}`);
  console.log(`  settlement: ${hire.settlement_balance_direction} £${roundGbp(hire.settlement_balance_gbp)}`);
  console.log(`  schedule rows: ${scheduleCsv.length}`);
  console.log(`  extra charges: ${chargesCsv.length}`);
  console.log(`  balance payments: ${paymentsCsv.length}`);
  console.log(`  inspections: ${inspectionsCsv.length}`);
  console.log(`Files written to docs/testing/end-hire/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
