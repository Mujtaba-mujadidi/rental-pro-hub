"use server";

import { requireDriverArea } from "@/lib/auth/profile";
import { loadDriverHireDashboardAction } from "@/app/actions/hire-dashboard";
import { loadDriverHirePaymentsPageAction } from "@/app/actions/hire-payments";
import { loadDriverMyHireShellAction } from "@/app/actions/driver-hires";
import { loadRecentPlatformNotificationsAction } from "@/app/actions/platform-notifications";
import {
  DRIVER_ONBOARDING_COLUMNS,
  driverOnboardingComplete,
} from "@/lib/driver/licence-check";
import { buildActiveHirePaymentPosition } from "@/lib/fleet/hire-active-summary-display";
import { buildHireSummaryActionItems } from "@/lib/fleet/hire-summary-action-items";
import {
  buildDriverDashboardPayload,
  type DriverDashboardPayload,
} from "@/lib/fleet/driver-dashboard-display";
import { getUnreadNotificationCountCached } from "@/lib/platform-notifications-read-cache";
import { createClient } from "@/lib/supabase/server";

type LoadResult =
  | { ok: true; data: DriverDashboardPayload }
  | { ok: false; error: string; redirectToOnboarding?: boolean };

/**
 * Driver home dashboard — session driver only.
 * Discovers the current hire from the session; never trusts a client-supplied hire id.
 */
export async function loadDriverDashboardAction(): Promise<LoadResult> {
  const { user, profile } = await requireDriverArea();
  const supabase = await createClient();

  const { data: dp } = await supabase
    .from("driver_profiles")
    .select(DRIVER_ONBOARDING_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!driverOnboardingComplete(dp) || !dp) {
    return { ok: false, error: "Complete onboarding first.", redirectToOnboarding: true };
  }

  const shellRes = await loadDriverMyHireShellAction();
  if (!shellRes.ok) return { ok: false, error: shellRes.error };

  const current = shellRes.rows[0] ?? null;

  let activeHireInput: Parameters<typeof buildDriverDashboardPayload>[0]["activeHire"] = null;
  let currentlyDueGbp = 0;
  let depositOutstandingGbp = 0;
  let rentOutstandingGbp = 0;
  let nextDueAmountGbp: number | null = null;
  let nextDuePeriodStartYmd: string | null = null;
  let actionItems: Parameters<typeof buildDriverDashboardPayload>[0]["actionItems"] = [];

  if (current) {
    const hireGroupId = current.hireGroupId;

    const { data: groupMeta } = await supabase
      .from("vehicle_hire_groups")
      .select("rent_cadence, activated_at, start_date, vehicle_hire_agreements(signed_at, status)")
      .eq("id", hireGroupId)
      .eq("driver_user_id", user.id)
      .maybeSingle();

    const agreements = (groupMeta?.vehicle_hire_agreements ?? []) as {
      signed_at?: string | null;
      status?: string | null;
    }[];
    const fullySigned =
      agreements.length > 0 &&
      agreements.every(
        (a) => Boolean(a.signed_at) || String(a.status ?? "").toLowerCase() === "signed",
      );

    activeHireInput = {
      hireGroupId,
      status: current.status,
      statusLabel: current.status === "active" ? "Active hire" : current.statusLabel,
      vehicleVrm: current.vehicleVrm,
      vehicleMakeModel: current.vehicleMakeModel,
      companyName: current.companyName,
      startedAtOrYmd:
        (groupMeta?.activated_at as string | null) ??
        (groupMeta?.start_date as string | null) ??
        null,
      fullySigned,
      rentCadence: (groupMeta?.rent_cadence as string | null) ?? null,
    };

    const [dashboardRes, paymentsRes] = await Promise.all([
      loadDriverHireDashboardAction(hireGroupId),
      loadDriverHirePaymentsPageAction(hireGroupId),
    ]);

    if (dashboardRes.ok && paymentsRes.ok) {
      const position = buildActiveHirePaymentPosition({
        dashboard: dashboardRes.data,
        paymentRows: paymentsRes.data.rows,
        audience: "driver",
      });
      currentlyDueGbp = position.currentlyDueGbp;
      depositOutstandingGbp = position.depositOutstandingGbp;
      rentOutstandingGbp = position.rentOutstandingGbp;
      nextDueAmountGbp = dashboardRes.data.summary.nextDue?.amountGbp ?? null;
      nextDuePeriodStartYmd = dashboardRes.data.summary.nextDue?.periodStart ?? null;
      actionItems = buildHireSummaryActionItems({
        lifecycleAttentionItems: dashboardRes.data.lifecycleAttentionItems,
        attentionItems: dashboardRes.data.attentionItems,
        position,
        paymentsHref: `/driver/hires/${hireGroupId}/payments`,
        includeDeposit: dashboardRes.data.includeDeposit,
        audience: "driver",
      });
    }
  }

  const [unread, notificationsRes] = await Promise.all([
    getUnreadNotificationCountCached(user.id),
    loadRecentPlatformNotificationsAction(4),
  ]);

  const recentNotifications = notificationsRes.ok
    ? notificationsRes.items.map((item) => ({
        id: item.id,
        title: item.display.title,
        body: item.display.body,
        href: item.display.href,
        createdAt: item.createdAt,
      }))
    : [];

  return {
    ok: true,
    data: buildDriverDashboardPayload({
      displayName: profile.display_name,
      drivingLicenceExpiryYmd: (dp.driving_licence_expiry as string | null) ?? null,
      phvLicenceExpiryYmd: (dp.phv_licence_expiry as string | null) ?? null,
      unreadNotifications: unread,
      activeHire: activeHireInput,
      currentlyDueGbp,
      depositOutstandingGbp,
      rentOutstandingGbp,
      nextDueAmountGbp,
      nextDuePeriodStartYmd,
      actionItems,
      recentNotifications,
    }),
  };
}
