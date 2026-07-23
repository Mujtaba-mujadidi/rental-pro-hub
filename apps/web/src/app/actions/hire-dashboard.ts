"use server";

import { loadHirePaymentsPageAction, loadDriverHirePaymentsPageAction, type HirePaymentPageRow } from "@/app/actions/hire-payments";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import { ukTodayYmd } from "@/lib/datetime/uk";
import {
  analyzeHirePaymentHealth,
  buildHirePaymentAttentionItems,
  buildHirePaymentChartPoints,
  depositStatusLabel,
  formatHirePaymentEventSummary,
  summarizeHireContractProgress,
  type HirePaymentAnalyticsRow,
  type HirePaymentAttentionItem,
  type HirePaymentChartPoint,
  type HirePaymentHealthSummary,
  type HireContractProgress,
} from "@/lib/fleet/hire-payment-analytics";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";
import { createClient } from "@/lib/supabase/server";

export type HireDashboardRecentEvent = {
  id: string;
  summary: string;
  createdAt: string;
  source: "payment" | "audit";
};

export type HireDashboardLifecycle = HireContractProgress & {
  depositStatusLabel: string;
  documentsStatusLabel: string;
  contractPaidGbp: number;
  contractTotalGbp: number;
};

export type HireDashboardData = {
  summary: HirePaymentSummary;
  health: HirePaymentHealthSummary;
  attentionItems: HirePaymentAttentionItem[];
  chartPoints: HirePaymentChartPoint[];
  lifecycle: HireDashboardLifecycle;
  recentEvents: HireDashboardRecentEvent[];
};

function toAnalyticsRows(rows: HirePaymentPageRow[]): HirePaymentAnalyticsRow[] {
  return rows.map((row) => ({
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind,
    periodLabel: row.periodLabel,
    netDueGbp: row.netDueGbp,
    paidGbp: row.paidGbp,
    balanceGbp: row.balanceGbp,
    accrued: row.accrued,
    paymentStatus: row.paymentStatus,
    pendingSubmittedGbp: row.pendingSubmittedGbp,
  }));
}

function documentsStatusFromAgreements(
  agreements: { signed_at: string | null; status: string }[],
): string {
  if (!agreements.length) return "No contracts";
  const allSigned = agreements.every((a) => a.signed_at != null);
  if (allSigned) return "All signed";
  const awaiting = agreements.some((a) => a.status === "pending_signature");
  if (awaiting) return "Awaiting signature";
  return "In progress";
}

export async function loadHireDashboardAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HireDashboardData } | { ok: false; error: string }> {
  const { profile } = await requireRentalCompanyArea();
  if (!canReadRentals(profile)) return { ok: false, error: "You do not have permission." };

  const page = await loadHirePaymentsPageAction(hireGroupId.trim());
  if (!page.ok) return page;

  const supabase = await createClient();
  const today = ukTodayYmd();

  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("start_date")
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  const startDate = (group?.start_date as string | null) ?? today;

  const { data: agreements } = await supabase
    .from("vehicle_hire_agreements")
    .select("signed_at, status")
    .eq("hire_group_id", hireGroupId.trim());

  const analyticsRows = toAnalyticsRows(page.data.rows);
  const rowIds = analyticsRows.map((r) => r.id);
  const rowLabelById = new Map(analyticsRows.map((r) => [r.id, r.periodLabel]));

  let paymentEvents: {
    id: string;
    schedule_row_id: string;
    from_status: string | null;
    to_status: string | null;
    amendment_payload: unknown;
    actor_role: string;
    event_kind: string;
    created_at: string;
  }[] = [];

  if (rowIds.length) {
    const { data } = await supabase
      .from("vehicle_hire_payment_status_events")
      .select("id, schedule_row_id, event_kind, from_status, to_status, amendment_payload, actor_role, created_at")
      .in("schedule_row_id", rowIds)
      .order("created_at", { ascending: false })
      .limit(12);
    paymentEvents = data ?? [];
  }

  const { data: auditEvents } = await supabase
      .from("vehicle_hire_group_events")
      .select("id, summary, created_at")
      .eq("hire_group_id", hireGroupId.trim())
      .order("created_at", { ascending: false })
      .limit(6);

  const recentEvents: HireDashboardRecentEvent[] = [
    ...paymentEvents.map((event) => {
      const payload = (event.amendment_payload ?? {}) as {
        submittedAmountGbp?: number;
        newApprovedAmountGbp?: number;
      };
      const submitted =
        payload.newApprovedAmountGbp != null
          ? Number(payload.newApprovedAmountGbp)
          : payload.submittedAmountGbp != null
            ? Number(payload.submittedAmountGbp)
            : null;
      return {
        id: `payment:${event.id as string}`,
        summary: formatHirePaymentEventSummary({
          fromStatus: event.from_status as string | null,
          toStatus: event.to_status as string | null,
          actorRole: event.actor_role as string,
          periodLabel: rowLabelById.get(event.schedule_row_id as string) ?? "Period",
          submittedAmountGbp: submitted,
          eventKind: event.event_kind as string,
        }),
        createdAt: event.created_at as string,
        source: "payment" as const,
      };
    }),
    ...(auditEvents ?? []).map((event) => ({
      id: `audit:${event.id as string}`,
      summary: event.summary as string,
      createdAt: event.created_at as string,
      source: "audit" as const,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const progress = summarizeHireContractProgress(analyticsRows, startDate, today);

  return {
    ok: true,
    data: {
      summary: page.data.summary,
      health: analyzeHirePaymentHealth(analyticsRows, today),
      attentionItems: buildHirePaymentAttentionItems(analyticsRows, today),
      chartPoints: buildHirePaymentChartPoints(analyticsRows, today),
      lifecycle: {
        ...progress,
        depositStatusLabel: depositStatusLabel(analyticsRows, today),
        documentsStatusLabel: documentsStatusFromAgreements(agreements ?? []),
        contractPaidGbp: page.data.summary.totalPaidGbp,
        contractTotalGbp: page.data.summary.contractTotalGbp,
      },
      recentEvents,
    },
  };
}

async function buildDriverDashboardData(
  hireGroupId: string,
): Promise<{ ok: true; data: HireDashboardData } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  const page = await loadDriverHirePaymentsPageAction(hireGroupId.trim());
  if (!page.ok) return page;

  const supabase = await createClient();
  const today = ukTodayYmd();

  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select("start_date")
    .eq("id", hireGroupId.trim())
    .eq("driver_user_id", user.id)
    .maybeSingle();
  if (!group) return { ok: false, error: "Hire not found." };

  const startDate = (group.start_date as string | null) ?? today;
  const analyticsRows = toAnalyticsRows(page.data.rows);
  const rowIds = analyticsRows.map((r) => r.id);
  const rowLabelById = new Map(analyticsRows.map((r) => [r.id, r.periodLabel]));

  let paymentEvents: {
    id: string;
    schedule_row_id: string;
    from_status: string | null;
    to_status: string | null;
    amendment_payload: unknown;
    actor_role: string;
    event_kind: string;
    created_at: string;
  }[] = [];

  if (rowIds.length) {
    const { data } = await supabase
      .from("vehicle_hire_payment_status_events")
      .select("id, schedule_row_id, event_kind, from_status, to_status, amendment_payload, actor_role, created_at")
      .in("schedule_row_id", rowIds)
      .order("created_at", { ascending: false })
      .limit(12);
    paymentEvents = data ?? [];
  }

  const recentEvents: HireDashboardRecentEvent[] = paymentEvents.map((event) => {
    const payload = (event.amendment_payload ?? {}) as {
      submittedAmountGbp?: number;
      newApprovedAmountGbp?: number;
    };
    const submitted =
      payload.newApprovedAmountGbp != null
        ? Number(payload.newApprovedAmountGbp)
        : payload.submittedAmountGbp != null
          ? Number(payload.submittedAmountGbp)
          : null;
    return {
      id: `payment:${event.id as string}`,
      summary: formatHirePaymentEventSummary({
        fromStatus: event.from_status as string | null,
        toStatus: event.to_status as string | null,
        actorRole: event.actor_role as string,
        periodLabel: rowLabelById.get(event.schedule_row_id as string) ?? "Period",
        submittedAmountGbp: submitted,
        eventKind: event.event_kind as string,
      }),
      createdAt: event.created_at as string,
      source: "payment" as const,
    };
  });

  const progress = summarizeHireContractProgress(analyticsRows, startDate, today);

  return {
    ok: true,
    data: {
      summary: page.data.summary,
      health: analyzeHirePaymentHealth(analyticsRows, today),
      attentionItems: buildHirePaymentAttentionItems(analyticsRows, today),
      chartPoints: buildHirePaymentChartPoints(analyticsRows, today),
      lifecycle: {
        ...progress,
        depositStatusLabel: depositStatusLabel(analyticsRows, today),
        documentsStatusLabel: "—",
        contractPaidGbp: page.data.summary.totalPaidGbp,
        contractTotalGbp: page.data.summary.contractTotalGbp,
      },
      recentEvents,
    },
  };
}

export async function loadDriverHireDashboardAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HireDashboardData } | { ok: false; error: string }> {
  return buildDriverDashboardData(hireGroupId);
}
