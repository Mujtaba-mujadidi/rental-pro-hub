"use server";

import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import {
  buildHireActivityExportCsv,
  buildHireActivityItems,
  hireActivityExportFileName,
  synthesizeExtraChargePaymentActivityEvents,
  synthesizeSchedulePaymentActivityEvents,
  synthesizeSettlementBalancePaymentActivityEvents,
  type HireActivityItem,
} from "@/lib/fleet/hire-activity-display";
import { loadHireAuditActorDisplayNames, type HireGroupAuditRow } from "@/lib/fleet/hire-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ActivityResult =
  | { ok: true; items: HireActivityItem[] }
  | { ok: false; error: string };

async function loadAuthorisedHireEvents(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<{ ok: true; events: HireGroupAuditRow[] } | { ok: false; error: string }> {
  const id = hireGroupId.trim();
  if (!id) return { ok: false, error: "Hire not found." };

  const supabase = await createClient();

  if (audience === "staff") {
    const { profile } = await requireRentalCompanyArea();
    if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };
    const { data: group } = await supabase
      .from("vehicle_hire_groups")
      .select("id, parent_company_id")
      .eq("id", id)
      .eq("parent_company_id", profile.company_id ?? "")
      .maybeSingle();
    if (!group) return { ok: false, error: "Hire not found." };
  } else {
    const user = await getSessionUser();
    if (!user) return { ok: false, error: "Sign in required." };
    const { data: group } = await supabase
      .from("vehicle_hire_groups")
      .select("id, driver_user_id")
      .eq("id", id)
      .eq("driver_user_id", user.id)
      .maybeSingle();
    if (!group) return { ok: false, error: "Hire not found." };
  }

  const admin = createSupabaseAdminClient();
  const [
    { data, error },
    { data: extraChargePayments, error: paymentsError },
    { data: settlementPayments, error: settlementPaymentsError },
    { data: scheduleRows, error: scheduleError },
  ] = await Promise.all([
    supabase
      .from("vehicle_hire_group_events")
      .select("id, event_type, actor_user_id, actor_role, summary, metadata, created_at")
      .eq("hire_group_id", id)
      .order("created_at", { ascending: false }),
    admin
      .from("vehicle_hire_balance_payments")
      .select("id, amount_gbp, payment_method, payment_reference, paid_at, recorded_by_user_id")
      .eq("hire_group_id", id)
      .eq("payment_category", "driver_charge")
      .eq("direction", "received_from_driver")
      .order("paid_at", { ascending: true }),
    admin
      .from("vehicle_hire_balance_payments")
      .select(
        "id, amount_gbp, payment_method, payment_reference, paid_at, recorded_by_user_id, direction",
      )
      .eq("hire_group_id", id)
      .eq("payment_category", "settlement")
      .order("paid_at", { ascending: true }),
    admin
      .from("vehicle_hire_payment_schedule")
      .select("id, row_kind, period_start, period_end")
      .eq("hire_group_id", id),
  ]);
  if (error) return { ok: false, error: error.message };
  if (paymentsError) return { ok: false, error: paymentsError.message };
  if (settlementPaymentsError) return { ok: false, error: settlementPaymentsError.message };
  if (scheduleError) return { ok: false, error: scheduleError.message };

  const scheduleById = new Map(
    (scheduleRows ?? []).map((row) => [
      row.id as string,
      {
        rowKind: ((row.row_kind as string) === "deposit" ? "deposit" : "rent") as "deposit" | "rent",
        periodStart: (row.period_start as string) ?? "",
        periodEnd: (row.period_end as string) ?? "",
      },
    ]),
  );
  const scheduleIds = [...scheduleById.keys()];
  let statusEvents: Array<{
    id: string;
    schedule_row_id: string;
    event_kind: string | null;
    from_status: string | null;
    to_status: string | null;
    comment: string | null;
    amendment_payload: unknown;
    actor_user_id: string | null;
    actor_role: string | null;
    created_at: string;
  }> = [];
  if (scheduleIds.length) {
    const { data: statusRows, error: statusError } = await admin
      .from("vehicle_hire_payment_status_events")
      .select(
        "id, schedule_row_id, event_kind, from_status, to_status, comment, amendment_payload, actor_user_id, actor_role, created_at",
      )
      .in("schedule_row_id", scheduleIds)
      .order("created_at", { ascending: true });
    if (statusError) return { ok: false, error: statusError.message };
    statusEvents = (statusRows ?? []) as typeof statusEvents;
  }

  const events = (data ?? []).map((row) => ({
    id: row.id as string,
    event_type: row.event_type as HireGroupAuditRow["event_type"],
    actor_user_id: row.actor_user_id as string | null,
    actor_role: row.actor_role as HireGroupAuditRow["actor_role"],
    summary: row.summary as string,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    created_at: row.created_at as string,
  }));

  const withExtras = synthesizeExtraChargePaymentActivityEvents(
    events,
    (extraChargePayments ?? []).map((payment) => ({
      id: payment.id as string,
      amountGbp: Number(payment.amount_gbp ?? 0),
      paidAt: (payment.paid_at as string) ?? "",
      paymentMethod: (payment.payment_method as string | null) ?? null,
      paymentReference: (payment.payment_reference as string | null) ?? null,
      recordedByUserId: (payment.recorded_by_user_id as string | null) ?? null,
    })),
  );

  const withSettlement = synthesizeSettlementBalancePaymentActivityEvents(
    withExtras,
    (settlementPayments ?? []).map((payment) => ({
      id: payment.id as string,
      amountGbp: Number(payment.amount_gbp ?? 0),
      paidAt: (payment.paid_at as string) ?? "",
      direction: (payment.direction as string) ?? "received_from_driver",
      paymentMethod: (payment.payment_method as string | null) ?? null,
      paymentReference: (payment.payment_reference as string | null) ?? null,
      recordedByUserId: (payment.recorded_by_user_id as string | null) ?? null,
    })),
  );

  return {
    ok: true,
    events: synthesizeSchedulePaymentActivityEvents(
      withSettlement,
      statusEvents.flatMap((statusEvent) => {
        const schedule = scheduleById.get(statusEvent.schedule_row_id);
        if (!schedule) return [];
        const role = statusEvent.actor_role;
        return [
          {
            id: statusEvent.id,
            scheduleRowId: statusEvent.schedule_row_id,
            rowKind: schedule.rowKind,
            periodStart: schedule.periodStart,
            periodEnd: schedule.periodEnd,
            eventKind: (statusEvent.event_kind as string) ?? "status_change",
            fromStatus: statusEvent.from_status,
            toStatus: statusEvent.to_status,
            comment: statusEvent.comment,
            amendmentPayload:
              statusEvent.amendment_payload && typeof statusEvent.amendment_payload === "object"
                ? (statusEvent.amendment_payload as Record<string, unknown>)
                : null,
            actorUserId: statusEvent.actor_user_id,
            actorRole:
              role === "driver" || role === "system" || role === "company_staff"
                ? role
                : "company_staff",
            createdAt: statusEvent.created_at,
          },
        ];
      }),
    ),
  };
}

export async function loadHireActivityAction(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<ActivityResult> {
  const loaded = await loadAuthorisedHireEvents(hireGroupId, audience);
  if (!loaded.ok) return loaded;
  let actorNames: Record<string, string> = {};
  if (audience === "staff") {
    try {
      actorNames = await loadHireAuditActorDisplayNames(
        createSupabaseAdminClient(),
        loaded.events.map((event) => event.actor_user_id),
      );
    } catch {
      actorNames = {};
    }
  }
  return {
    ok: true,
    items: buildHireActivityItems(loaded.events, { audience, actorNames }),
  };
}

export async function exportHireActivityAction(
  hireGroupId: string,
  audience: "staff" | "driver",
): Promise<{ ok: true; csv: string; fileName: string } | { ok: false; error: string }> {
  const loaded = await loadHireActivityAction(hireGroupId, audience);
  if (!loaded.ok) return loaded;
  return {
    ok: true,
    csv: buildHireActivityExportCsv(loaded.items, audience),
    fileName: hireActivityExportFileName(hireGroupId),
  };
}
