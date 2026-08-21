"use server";

import { loadHirePaymentsPageAction, loadDriverHirePaymentsPageAction, type HirePaymentPageRow, type HirePaymentsPageData } from "@/app/actions/hire-payments";
import { loadDriverHireWorkspaceShellAction } from "@/app/actions/driver-hires";
import { getSessionUser, requireRentalCompanyArea } from "@/lib/auth/profile";
import { canReadRentals } from "@/lib/auth/rental-permissions";
import { formatUkDateTimeSeconds, ukTodayYmd } from "@/lib/datetime/uk";
import { formatHireContractEndLabel, formatHireContractStartLabel } from "@/lib/fleet/hire-pdf-details";
import { formatRentLabel } from "@/lib/fleet/hire-access-display";
import { hireFrequencyPosition } from "@/lib/fleet/hire-overview-period";
import type { HireOverviewContext } from "@/lib/fleet/hire-overview-types";
import { hireContractEndYmd } from "@/lib/fleet/hire-income";
import type { HireTerminationAccountsSummary } from "@/lib/fleet/hire-termination-summary";
import type { RentCadence } from "@/lib/fleet/hire-types";
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
import { buildHireLifecycleAttentionItems } from "@/lib/fleet/hire-lifecycle-attention";
import { buildHireInsuranceAttentionItems } from "@/lib/fleet/hire-insurance-attention";
import { buildHireDocumentExpiryAttentionItem } from "@/lib/fleet/hire-document-expiry-attention";
import { isHireInsuranceProvidedBy, type HireInsuranceProvidedBy } from "@/lib/fleet/hire-insurance";
import { parseCompanyNotificationSettings } from "@/lib/settings/notification-settings";
import {
  hireDepositStatusLabel,
  summarizeHireFinancialClosure,
  type HireFinancialClosureState,
} from "@/lib/fleet/hire-financial-closure";
import { hireInspectionCompletionFromRows } from "@/lib/fleet/hire-inspection-status";
import type { HireLifecycleAttentionItem } from "@/lib/fleet/hire-lifecycle-attention";
import type { HirePaymentSummary } from "@/lib/fleet/hire-payment-summary";
import type { HirePaymentDisplayOptions } from "@/lib/fleet/hire-payment-display";
import { buildHireEndedDepositRefundDisplay } from "@/lib/fleet/hire-ended-payments-display";
import { buildHireScheduleRefundMarksByRowId } from "@/lib/fleet/hire-ended-payment-schedule";
import type { HireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import {
  buildHireWorkspaceHeroMetrics,
  type HireWorkspaceHeroMetrics,
} from "@/lib/fleet/hire-workspace-hero-display";
import { driverHireStatusLabel } from "@/lib/fleet/driver-hire-nav";
import { loadDriverLabelsMap } from "@/lib/fleet/driver-labels";
import { hireAllowsCompanyDriverPackageAccess } from "@/lib/fleet/hire-driver-package-access";
import { formatAuditActorLabel, loadHireAuditActorDisplayNames } from "@/lib/fleet/hire-audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  financialClosure: HireFinancialClosureState;
};

export type HireDashboardData = {
  summary: HirePaymentSummary;
  health: HirePaymentHealthSummary;
  attentionItems: HirePaymentAttentionItem[];
  lifecycleAttentionItems: HireLifecycleAttentionItem[];
  chartPoints: HirePaymentChartPoint[];
  lifecycle: HireDashboardLifecycle;
  recentEvents: HireDashboardRecentEvent[];
  includeDeposit: boolean;
  canTerminate: boolean;
  settlementBalance: HireWorkspaceSettlementBalance | null;
  hasPostEndPrepaidPayments: boolean;
  contractEndedYmd: string | null;
  contractEndedAtLabel: string | null;
  driverDocumentsRetainUntilLabel: string | null;
  driverDocumentsRetentionWarning: string | null;
  depositPendingReview: boolean;
  depositGbp: number | null;
  depositDispositionLabel: string | null;
  financialClosure: HireFinancialClosureState;
  overview: HireOverviewContext;
  workspaceHero: HireWorkspaceHeroMetrics;
  terminationSummary: HireTerminationAccountsSummary | null;
};

function shortHireId(hireGroupId: string): string {
  return hireGroupId.trim().slice(0, 8);
}

function resolveHireDriverDisplayName(
  profileLabel: string | undefined,
  driverEmail: string | null,
  driverLicence: string | null,
): string | null {
  if (profileLabel && profileLabel !== "Driver" && !profileLabel.includes("@")) {
    return profileLabel;
  }
  return driverEmail ?? driverLicence;
}

async function loadHireDriverDisplayName(
  driverUserId: string | null,
  driverEmail: string | null,
  driverLicence: string | null,
): Promise<string | null> {
  if (!driverUserId) {
    return resolveHireDriverDisplayName(undefined, driverEmail, driverLicence);
  }
  try {
    const labels = await loadDriverLabelsMap(createSupabaseAdminClient(), [driverUserId]);
    return resolveHireDriverDisplayName(labels.get(driverUserId), driverEmail, driverLicence);
  } catch {
    return resolveHireDriverDisplayName(undefined, driverEmail, driverLicence);
  }
}

function buildOverviewContext(input: {
  hireGroupId: string;
  vehicleVrm: string;
  vehicleMakeModel: string;
  driverName: string | null;
  driverEmail: string | null;
  driverLicence: string | null;
  companyName: string | null;
  statusLabel: string;
  group: {
    start_date: string | null;
    start_time?: string | null;
    end_time?: string | null;
    activated_at: string | null;
    terminated_at: string | null;
    ended_at: string | null;
    status: string | null;
    rent_cadence: string | null;
    rent_amount_gbp: number | null;
    deposit_gbp: number | null;
    include_deposit: boolean | null;
  };
  agreementEndDates?: (string | null | undefined)[];
  scheduleRows: HirePaymentAnalyticsRow[];
  contractEndedAtLabel: string | null;
  todayYmd: string;
}): HireOverviewContext {
  const startDate = (input.group.start_date as string | null) ?? input.todayYmd;
  const contractEndedYmd = hireContractEndYmd({
    status: String(input.group.status ?? ""),
    terminatedAt: (input.group.terminated_at as string | null) ?? null,
    endedAt: (input.group.ended_at as string | null) ?? null,
  });
  const referenceYmd = contractEndedYmd ?? input.todayYmd;
  const cadence = (input.group.rent_cadence as RentCadence) ?? "weekly";
  const activatedAt = (input.group.activated_at as string | null) ?? null;
  const depositGbp = input.group.include_deposit ? Number(input.group.deposit_gbp ?? 0) : 0;
  const maxAgreementEndDate =
    (input.agreementEndDates ?? [])
      .filter((d): d is string => Boolean(d?.trim()))
      .sort()
      .at(-1) ?? null;

  return {
    hireGroupId: input.hireGroupId,
    hireGroupIdShort: shortHireId(input.hireGroupId),
    vehicleVrm: input.vehicleVrm,
    vehicleMakeModel: input.vehicleMakeModel,
    driverName: input.driverName,
    driverEmail: input.driverEmail,
    companyName: input.companyName,
    rentLabel: formatRentLabel(input.group.rent_amount_gbp, cadence),
    rentCadence: cadence,
    depositLabel: depositGbp > 0 ? `£${depositGbp.toFixed(2)}` : null,
    contractStartLabel: formatHireContractStartLabel(startDate, input.group.start_time),
    startDateYmd: startDate,
    startAtLabel: activatedAt
      ? formatUkDateTimeSeconds(activatedAt)
      : "Not yet activated",
    scheduledEndAtLabel:
      !contractEndedYmd && maxAgreementEndDate
        ? formatHireContractEndLabel(maxAgreementEndDate, input.group.end_time)
        : null,
    endedAtLabel: input.contractEndedAtLabel,
    frequencyPositionLabel: hireFrequencyPosition({
      cadence,
      startDateYmd: startDate,
      referenceYmd,
      scheduleRows: input.scheduleRows.map((row) => ({
        rowKind: row.rowKind,
        periodStart: row.periodStart,
      })),
    }),
    statusLabel: input.statusLabel,
    contractEnded: Boolean(contractEndedYmd),
  };
}

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

function paymentDisplayOptions(
  page: Pick<
    HirePaymentsPageData,
    | "contractEndedYmd"
    | "settlementBalance"
    | "rows"
    | "terminationSummary"
    | "depositGbp"
    | "depositDisposition"
    | "depositReceivedGbp"
    | "settlementBalancePayments"
    | "driverChargeLineItems"
  >,
  audience: "driver" | "staff",
): HirePaymentDisplayOptions {
  const depositRefund = buildHireEndedDepositRefundDisplay({
    payments: page,
    audience,
  });
  return {
    contractEndedYmd: page.contractEndedYmd,
    settlementSettled: page.settlementBalance?.settled === true,
    audience,
    refundMarkByRowId: buildHireScheduleRefundMarksByRowId(page.rows, page.contractEndedYmd, {
      prepaidRentRefundedGbp: depositRefund?.advanceRentRefundedGbp ?? 0,
      depositRefundedGbp: depositRefund?.depositRefundedGbp ?? 0,
    }),
  };
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
    .select(
      "start_date, start_time, end_time, status, include_deposit, activated_at, terminated_at, ended_at, rent_cadence, rent_amount_gbp, deposit_gbp, driver_email, driver_licence_number, driver_user_id, driver_access_status, driver_documents_retain_until, parent_company_id, insurance_provided_by, vehicles(vrm, make, model, mot_expiry, tax_expiry, phv_licence_expiry), vehicle_hire_agreements(end_date)",
    )
    .eq("id", hireGroupId.trim())
    .maybeSingle();
  const startDate = (group?.start_date as string | null) ?? today;
  const hireStatus = (group?.status as string | null) ?? "";
  const vehicle = group?.vehicles as {
    vrm?: string;
    make?: string;
    model?: string;
    mot_expiry?: string | null;
    tax_expiry?: string | null;
    phv_licence_expiry?: string | null;
  } | null;

  const [{ data: inspectionRows }, { data: insuranceRow }, { data: notifyCompany }] = await Promise.all([
    supabase
      .from("vehicle_hire_inspections")
      .select("kind, status")
      .eq("hire_group_id", hireGroupId.trim()),
    supabase
      .from("vehicle_hire_insurance")
      .select("expiry_date")
      .eq("hire_group_id", hireGroupId.trim())
      .maybeSingle(),
    group?.parent_company_id
      ? supabase
          .from("companies")
          .select(
            "notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_insurance_days_before, notify_contract_expiry_days_before",
          )
          .eq("id", group.parent_company_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const inspection = hireInspectionCompletionFromRows(
    (inspectionRows ?? []).map((row) => ({
      kind: row.kind as string,
      status: row.status as string,
    })),
  );
  const notifySettings = parseCompanyNotificationSettings(notifyCompany ?? undefined);
  const providedByRaw = (group?.insurance_provided_by as string | null) ?? null;
  const insuranceProvidedBy: HireInsuranceProvidedBy | null =
    providedByRaw && isHireInsuranceProvidedBy(providedByRaw) ? providedByRaw : null;
  const lifecycleAttentionItems: HireLifecycleAttentionItem[] = [
    ...buildHireLifecycleAttentionItems({
      hireGroupId: hireGroupId.trim(),
      status: hireStatus,
      checkoutCompleted: inspection.checkoutCompleted,
      checkinCompleted: inspection.checkinCompleted,
      depositPendingReview: page.data.depositPendingReview,
      depositGbp: page.data.depositGbp,
    }),
    ...buildHireInsuranceAttentionItems({
      hireGroupId: hireGroupId.trim(),
      audience: "staff",
      providedBy: insuranceProvidedBy,
      hasDocument: Boolean(insuranceRow),
      expiryDate: (insuranceRow?.expiry_date as string | null) ?? null,
      notifyDaysBefore: notifySettings.notify_insurance_days_before,
      todayYmd: today,
      hireStatus,
    }),
  ];

  const driverUserId = (group?.driver_user_id as string | null) ?? null;
  const mayLoadLiveDriverProfile = hireAllowsCompanyDriverPackageAccess({
    driverAccessStatus: (group?.driver_access_status as string | null) ?? null,
    hireStatus,
    retainUntilYmd: (group?.driver_documents_retain_until as string | null) ?? null,
    todayYmd: today,
  });
  if (driverUserId && mayLoadLiveDriverProfile) {
    try {
      const admin = createSupabaseAdminClient();
      const { data: driverProfile } = await admin
        .from("driver_profiles")
        .select("driving_licence_expiry, phv_licence_expiry")
        .eq("user_id", driverUserId)
        .maybeSingle();
      const documentExpiry = buildHireDocumentExpiryAttentionItem({
        hireGroupId: hireGroupId.trim(),
        vehicle: {
          mot_expiry: vehicle?.mot_expiry,
          tax_expiry: vehicle?.tax_expiry,
          phv_licence_expiry: vehicle?.phv_licence_expiry,
        },
        driver: driverProfile,
        settings: notifySettings,
        detailsHref: `/rental/hires/${hireGroupId.trim()}/details`,
      });
      if (documentExpiry) lifecycleAttentionItems.push(documentExpiry);
    } catch {
      // Driver profile is optional for the summary action list.
    }
  } else {
    const documentExpiry = buildHireDocumentExpiryAttentionItem({
      hireGroupId: hireGroupId.trim(),
      vehicle: {
        mot_expiry: vehicle?.mot_expiry,
        tax_expiry: vehicle?.tax_expiry,
        phv_licence_expiry: vehicle?.phv_licence_expiry,
      },
      settings: notifySettings,
      detailsHref: `/rental/hires/${hireGroupId.trim()}/details`,
    });
    if (documentExpiry) lifecycleAttentionItems.push(documentExpiry);
  }

  const { data: agreements } = await supabase
    .from("vehicle_hire_agreements")
    .select("signed_at, status")
    .eq("hire_group_id", hireGroupId.trim());

  const analyticsRows = toAnalyticsRows(page.data.rows);
  const displayOptions = paymentDisplayOptions(page.data, "staff");
  const rowIds = analyticsRows.map((r) => r.id);
  const rowLabelById = new Map(analyticsRows.map((r) => [r.id, r.periodLabel]));

  let paymentEvents: {
    id: string;
    schedule_row_id: string;
    from_status: string | null;
    to_status: string | null;
    amendment_payload: unknown;
    actor_role: string;
    actor_user_id: string | null;
    event_kind: string;
    created_at: string;
  }[] = [];

  if (rowIds.length) {
    const { data } = await supabase
      .from("vehicle_hire_payment_status_events")
      .select("id, schedule_row_id, event_kind, from_status, to_status, amendment_payload, actor_role, actor_user_id, created_at")
      .in("schedule_row_id", rowIds)
      .order("created_at", { ascending: false })
      .limit(12);
    paymentEvents = data ?? [];
  }

  const { data: auditEvents } = await supabase
      .from("vehicle_hire_group_events")
      .select("id, summary, created_at, actor_user_id, actor_role")
      .eq("hire_group_id", hireGroupId.trim())
      .order("created_at", { ascending: false })
      .limit(6);

  let actorNames: Record<string, string> = {};
  try {
    actorNames = await loadHireAuditActorDisplayNames(createSupabaseAdminClient(), [
      ...paymentEvents.map((event) => event.actor_user_id),
      ...(auditEvents ?? []).map((event) => event.actor_user_id as string | null),
    ]);
  } catch {
    actorNames = {};
  }

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
      const actorUserId = event.actor_user_id?.trim() || null;
      return {
        id: `payment:${event.id as string}`,
        summary: formatHirePaymentEventSummary({
          fromStatus: event.from_status as string | null,
          toStatus: event.to_status as string | null,
          actorRole: event.actor_role as string,
          actorDisplayName: actorUserId ? actorNames[actorUserId] ?? null : null,
          periodLabel: rowLabelById.get(event.schedule_row_id as string) ?? "Period",
          submittedAmountGbp: submitted,
          eventKind: event.event_kind as string,
        }),
        createdAt: event.created_at as string,
        source: "payment" as const,
      };
    }),
    ...(auditEvents ?? []).map((event) => {
      const actorUserId = (event.actor_user_id as string | null)?.trim() || null;
      const actor = formatAuditActorLabel(
        actorUserId ? actorNames[actorUserId] ?? null : null,
        (event.actor_role as string | null) ?? "company_staff",
      );
      return {
        id: `audit:${event.id as string}`,
        summary: `${event.summary as string} · ${actor}`,
        createdAt: event.created_at as string,
        source: "audit" as const,
      };
    }),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const progress = summarizeHireContractProgress(analyticsRows, startDate, today);
  const financialClosure = summarizeHireFinancialClosure({
    settlementBalance: page.data.settlementBalance,
    depositDisposition: page.data.depositDisposition,
    depositGbp: page.data.depositGbp,
  });
  const scheduleDepositStatusLabel = depositStatusLabel(analyticsRows, today);
  const driverEmail = mayLoadLiveDriverProfile
    ? ((group?.driver_email as string | null) ?? null)
    : null;
  const driverLicence = mayLoadLiveDriverProfile
    ? ((group?.driver_licence_number as string | null) ?? null)
    : null;
  const driverName = mayLoadLiveDriverProfile
    ? await loadHireDriverDisplayName(driverUserId, driverEmail, driverLicence)
    : null;
  const agreementEndDates = (
    (group?.vehicle_hire_agreements as { end_date?: string | null }[] | null | undefined) ?? []
  ).map((a) => a.end_date);
  const workspaceHero = buildHireWorkspaceHeroMetrics({
    startDate,
    startTime: (group?.start_time as string | null) ?? null,
    endTime: (group?.end_time as string | null) ?? null,
    activatedAt: (group?.activated_at as string | null) ?? null,
    terminatedAt: (group?.terminated_at as string | null) ?? null,
    endedAt: (group?.ended_at as string | null) ?? null,
    status: hireStatus,
    rentAmountGbp: group?.rent_amount_gbp != null ? Number(group.rent_amount_gbp) : null,
    agreementEndDates,
  });
  const overview = buildOverviewContext({
    hireGroupId: hireGroupId.trim(),
    vehicleVrm: vehicle?.vrm?.trim() || page.data.vehicleVrm,
    vehicleMakeModel:
      [vehicle?.make, vehicle?.model].filter(Boolean).join(" ").trim() || page.data.vehicleVrm,
    driverName,
    driverEmail,
    driverLicence: driverLicence,
    companyName: null,
    statusLabel: driverHireStatusLabel(hireStatus),
    group: group ?? {
      start_date: startDate,
      start_time: null,
      end_time: null,
      activated_at: null,
      terminated_at: null,
      ended_at: null,
      status: hireStatus,
      rent_cadence: null,
      rent_amount_gbp: null,
      deposit_gbp: null,
      include_deposit: false,
    },
    agreementEndDates,
    scheduleRows: analyticsRows,
    contractEndedAtLabel: page.data.contractEndedAtLabel,
    todayYmd: today,
  });

  return {
    ok: true,
    data: {
      summary: page.data.summary,
      health: analyzeHirePaymentHealth(analyticsRows, today, displayOptions),
      attentionItems: buildHirePaymentAttentionItems(analyticsRows, today, displayOptions),
      lifecycleAttentionItems,
      chartPoints: buildHirePaymentChartPoints(analyticsRows, today, displayOptions),
      lifecycle: {
        ...progress,
        depositStatusLabel: hireDepositStatusLabel({
          depositPendingReview: page.data.depositPendingReview,
          depositGbp: page.data.depositGbp ?? 0,
          depositDispositionLabel: page.data.depositDispositionLabel,
          scheduleDepositPaidLabel: scheduleDepositStatusLabel,
        }),
        documentsStatusLabel: documentsStatusFromAgreements(agreements ?? []),
        contractPaidGbp: page.data.summary.totalPaidGbp,
        contractTotalGbp:
          page.data.terminationSummary?.accruedRentDueGbp ?? page.data.summary.contractTotalGbp,
        financialClosure,
      },
      recentEvents,
      includeDeposit: Boolean(group?.include_deposit),
      canTerminate: hireStatus === "active",
      settlementBalance: page.data.settlementBalance,
      hasPostEndPrepaidPayments: page.data.hasPostEndPrepaidPayments,
      contractEndedYmd: page.data.contractEndedYmd,
      contractEndedAtLabel: page.data.contractEndedAtLabel,
      driverDocumentsRetainUntilLabel: page.data.driverDocumentsRetainUntilLabel,
      driverDocumentsRetentionWarning: page.data.driverDocumentsRetentionWarning,
      depositPendingReview: page.data.depositPendingReview,
      depositGbp: page.data.depositGbp,
      depositDispositionLabel: page.data.depositDispositionLabel,
      financialClosure,
      overview,
      workspaceHero,
      terminationSummary: page.data.terminationSummary,
    },
  };
}

async function buildDriverDashboardData(
  hireGroupId: string,
): Promise<{ ok: true; data: HireDashboardData } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in required." };

  // Vehicle/company joins are blocked for drivers by RLS — use the admin-backed shell.
  const [page, shellRes] = await Promise.all([
    loadDriverHirePaymentsPageAction(hireGroupId.trim()),
    loadDriverHireWorkspaceShellAction(hireGroupId.trim()),
  ]);
  if (!page.ok) return page;
  if (!shellRes.ok) return shellRes;
  const shell = shellRes.shell;

  const supabase = await createClient();
  const today = ukTodayYmd();

  const { data: group } = await supabase
    .from("vehicle_hire_groups")
    .select(
      "start_date, start_time, end_time, status, activated_at, terminated_at, ended_at, rent_cadence, rent_amount_gbp, deposit_gbp, include_deposit, driver_email, driver_licence_number, parent_company_id, insurance_provided_by, vehicle_hire_agreements(end_date)",
    )
    .eq("id", hireGroupId.trim())
    .eq("driver_user_id", user.id)
    .maybeSingle();
  if (!group) return { ok: false, error: "Hire not found." };

  const startDate = (group.start_date as string | null) ?? today;
  const hireStatus = (group.status as string | null) ?? shell.status;

  const [{ data: inspectionRows }, { data: insuranceRow }, { data: notifyCompany }] = await Promise.all([
    supabase
      .from("vehicle_hire_inspections")
      .select("kind, status")
      .eq("hire_group_id", hireGroupId.trim()),
    supabase
      .from("vehicle_hire_insurance")
      .select("expiry_date")
      .eq("hire_group_id", hireGroupId.trim())
      .maybeSingle(),
    group.parent_company_id
      ? supabase
          .from("companies")
          .select("notify_insurance_days_before")
          .eq("id", group.parent_company_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const inspection = hireInspectionCompletionFromRows(
    (inspectionRows ?? []).map((row) => ({
      kind: row.kind as string,
      status: row.status as string,
    })),
  );
  const notifySettings = parseCompanyNotificationSettings(notifyCompany ?? undefined);
  const providedByRaw = (group.insurance_provided_by as string | null) ?? null;
  const insuranceProvidedBy: HireInsuranceProvidedBy | null =
    providedByRaw && isHireInsuranceProvidedBy(providedByRaw) ? providedByRaw : null;
  const lifecycleAttentionItems = [
    ...buildHireLifecycleAttentionItems({
      hireGroupId: hireGroupId.trim(),
      status: hireStatus,
      checkoutCompleted: inspection.checkoutCompleted,
      checkinCompleted: inspection.checkinCompleted,
      audience: "driver",
    }),
    ...buildHireInsuranceAttentionItems({
      hireGroupId: hireGroupId.trim(),
      audience: "driver",
      providedBy: insuranceProvidedBy,
      hasDocument: Boolean(insuranceRow),
      expiryDate: (insuranceRow?.expiry_date as string | null) ?? null,
      notifyDaysBefore: notifySettings.notify_insurance_days_before,
      todayYmd: today,
      hireStatus,
    }),
  ];
  const analyticsRows = toAnalyticsRows(page.data.rows);
  const displayOptions = paymentDisplayOptions(page.data, "driver");
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
  const financialClosure = summarizeHireFinancialClosure({
    settlementBalance: page.data.settlementBalance,
    depositDisposition: page.data.depositDisposition,
    depositGbp: page.data.depositGbp,
  });
  const scheduleDepositStatusLabel = depositStatusLabel(analyticsRows, today);
  const driverEmail = (group.driver_email as string | null) ?? user.email ?? null;
  const driverLicence = (group.driver_licence_number as string | null) ?? null;
  const driverUserId = user.id;
  const driverName = await loadHireDriverDisplayName(driverUserId, driverEmail, driverLicence);
  const agreementEndDates = (
    (group.vehicle_hire_agreements as { end_date?: string | null }[] | null | undefined) ?? []
  ).map((a) => a.end_date);
  const workspaceHero = buildHireWorkspaceHeroMetrics({
    startDate,
    startTime: (group.start_time as string | null) ?? null,
    endTime: (group.end_time as string | null) ?? null,
    activatedAt: (group.activated_at as string | null) ?? null,
    terminatedAt: (group.terminated_at as string | null) ?? null,
    endedAt: (group.ended_at as string | null) ?? null,
    status: hireStatus,
    rentAmountGbp: group.rent_amount_gbp != null ? Number(group.rent_amount_gbp) : null,
    agreementEndDates,
  });
  const overview = buildOverviewContext({
    hireGroupId: hireGroupId.trim(),
    vehicleVrm: shell.vehicleVrm,
    vehicleMakeModel: shell.vehicleMakeModel,
    driverName,
    driverEmail,
    driverLicence,
    companyName: shell.companyName,
    statusLabel: shell.statusLabel,
    group,
    agreementEndDates,
    scheduleRows: analyticsRows,
    contractEndedAtLabel: page.data.contractEndedAtLabel,
    todayYmd: today,
  });

  return {
    ok: true,
    data: {
      summary: page.data.summary,
      health: analyzeHirePaymentHealth(analyticsRows, today, displayOptions),
      attentionItems: buildHirePaymentAttentionItems(analyticsRows, today, displayOptions),
      lifecycleAttentionItems,
      chartPoints: buildHirePaymentChartPoints(analyticsRows, today, displayOptions),
      lifecycle: {
        ...progress,
        depositStatusLabel: hireDepositStatusLabel({
          depositPendingReview: page.data.depositPendingReview,
          depositGbp: page.data.depositGbp ?? 0,
          depositDispositionLabel: page.data.depositDispositionLabel,
          scheduleDepositPaidLabel: scheduleDepositStatusLabel,
        }),
        documentsStatusLabel: "—",
        contractPaidGbp: page.data.summary.totalPaidGbp,
        contractTotalGbp:
          page.data.terminationSummary?.accruedRentDueGbp ?? page.data.summary.contractTotalGbp,
        financialClosure,
      },
      recentEvents,
      includeDeposit: false,
      canTerminate: false,
      settlementBalance: page.data.settlementBalance,
      hasPostEndPrepaidPayments: page.data.hasPostEndPrepaidPayments,
      contractEndedYmd: page.data.contractEndedYmd,
      contractEndedAtLabel: page.data.contractEndedAtLabel,
      driverDocumentsRetainUntilLabel: page.data.driverDocumentsRetainUntilLabel,
      driverDocumentsRetentionWarning: page.data.driverDocumentsRetentionWarning,
      depositPendingReview: page.data.depositPendingReview,
      depositGbp: page.data.depositGbp,
      depositDispositionLabel: page.data.depositDispositionLabel,
      financialClosure,
      overview,
      workspaceHero,
      terminationSummary: page.data.terminationSummary,
    },
  };
}

export async function loadDriverHireDashboardAction(
  hireGroupId: string,
): Promise<{ ok: true; data: HireDashboardData } | { ok: false; error: string }> {
  return buildDriverDashboardData(hireGroupId);
}
