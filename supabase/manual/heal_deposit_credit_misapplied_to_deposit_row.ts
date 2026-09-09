/**
 * One-off heal: deposit→rent credit was wrongly written onto the deposit schedule row.
 *
 * Steps:
 * 1) Delete deposit-row events with comment "Deposit applied to rent at contract end"
 * 2) Restore deposit approved_amount to pre-event value (approved − depositAppliedGbp)
 * 3) Persist the same credit onto unpaid rent rows (rent-only allocator)
 *
 * Usage (from apps/web):
 *   npx tsx ../../supabase/manual/heal_deposit_credit_misapplied_to_deposit_row.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { persistDepositCreditToRentSchedule } from "../../apps/web/src/lib/fleet/persist-hire-deposit-schedule-credit";

function loadEnvLocal(): Record<string, string> {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "apps/web/.env.local"),
    resolve(__dirname, "../../apps/web/.env.local"),
  ];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, "utf8");
      const out: Record<string, string> = {};
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        out[m[1]] = m[2].trim().replace(/^"|"$/g, "");
      }
      if (out.NEXT_PUBLIC_SUPABASE_URL) return out;
    } catch {
      // try next
    }
  }
  throw new Error("Could not load apps/web/.env.local");
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

  const rowIds = [...new Set((badEvents ?? []).map((e) => e.schedule_row_id as string))];
  if (!rowIds.length) {
    console.log("No deposit-applied events found.");
    return;
  }

  const { data: scheduleRows, error: schErr } = await admin
    .from("vehicle_hire_payment_schedule")
    .select("id, hire_group_id, row_kind, approved_amount_gbp, payment_status, base_amount_gbp")
    .in("id", rowIds);
  if (schErr) throw schErr;

  const rowById = new Map((scheduleRows ?? []).map((r) => [r.id as string, r]));
  const depositBad = (badEvents ?? []).filter((e) => {
    const row = rowById.get(e.schedule_row_id as string);
    return row?.row_kind === "deposit";
  });

  if (!depositBad.length) {
    console.log("No misapplied deposit-row credits found.");
    return;
  }

  for (const event of depositBad) {
    const row = rowById.get(event.schedule_row_id as string);
    if (!row) continue;
    const hireGroupId = row.hire_group_id as string;
    const payload = (event.amendment_payload ?? {}) as {
      depositAppliedGbp?: number;
      approvedAmountGbp?: number;
    };
    const applied = Number(payload.depositAppliedGbp ?? 0);
    if (!Number.isFinite(applied) || applied <= 0.005) {
      console.log("Skip event without depositAppliedGbp", event.id);
      continue;
    }

    const currentApproved = Number(row.approved_amount_gbp ?? 0);
    const restoredApproved = Math.round((currentApproved - applied) * 100) / 100;
    if (restoredApproved < -0.005) {
      throw new Error(
        `Refusing heal for ${hireGroupId}: restoring deposit would go negative (${restoredApproved}).`,
      );
    }

    console.log("Healing hire", hireGroupId, {
      eventId: event.id,
      depositRowId: row.id,
      currentApproved,
      restoredApproved,
      creditToRent: applied,
    });

    const { error: delErr } = await admin
      .from("vehicle_hire_payment_status_events")
      .delete()
      .eq("id", event.id as string);
    if (delErr) throw delErr;

    const { error: depUpdErr } = await admin
      .from("vehicle_hire_payment_schedule")
      .update({
        payment_status: "approved",
        approved_amount_gbp: restoredApproved,
      })
      .eq("id", row.id as string);
    if (depUpdErr) throw depUpdErr;

    const { data: group, error: gErr } = await admin
      .from("vehicle_hire_groups")
      .select("deposit_disposition, deposit_refund_amount_gbp, termination_settlement, terminated_at, ended_at")
      .eq("id", hireGroupId)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!group) throw new Error(`Hire ${hireGroupId} not found`);

    const termination = (group.termination_settlement ?? {}) as {
      signedRentBalanceGbp?: number;
    };
    const accrualYmd =
      (group.terminated_at as string | null)?.slice(0, 10) ||
      (group.ended_at as string | null)?.slice(0, 10) ||
      new Date().toISOString().slice(0, 10);

    const persist = await persistDepositCreditToRentSchedule({
      admin,
      hireGroupId,
      userId: (event.actor_user_id as string) || "00000000-0000-0000-0000-000000000000",
      disposition: String(group.deposit_disposition ?? "apply_to_balance"),
      depositGbp: applied,
      signedRentBalanceGbp: Number(termination.signedRentBalanceGbp ?? applied),
      depositRefundAmountGbp:
        group.deposit_refund_amount_gbp != null ? Number(group.deposit_refund_amount_gbp) : null,
      accrualYmd,
    });
    if (!persist.ok) throw new Error(persist.error);
    console.log("Persisted rent credit", persist.creditAppliedGbp);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
