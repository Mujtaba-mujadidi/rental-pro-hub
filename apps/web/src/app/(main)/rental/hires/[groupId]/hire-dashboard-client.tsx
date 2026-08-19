"use client";

import {
  loadHireDashboardAction,
  type HireDashboardData,
} from "@/app/actions/hire-dashboard";
import {
  loadHireEndedInspectionAttentionAction,
  type HireEndedInspectionAttentionData,
} from "@/app/actions/hire-inspections";
import {
  loadHirePaymentsPageAction,
  type HirePaymentPageRow,
  type HirePaymentsPageData,
} from "@/app/actions/hire-payments";
import { HireActiveCompanySummary } from "@/components/fleet/hire-summary/hire-active-company-summary";
import { HireEndedCompanySummary } from "@/components/fleet/hire-summary/hire-ended-company-summary";
import { useHireWorkspaceCachedLoad } from "@/hooks/use-hire-workspace-cached-load";
import { useRouter } from "next/navigation";
import { useHireWorkspace } from "./hire-workspace-provider";

export function HireDashboardClient() {
  const { shell, chrome } = useHireWorkspace();
  const router = useRouter();
  const base = `/rental/hires/${shell.hireGroupId}`;

  const dashboard = useHireWorkspaceCachedLoad<HireDashboardData>({
    key: "dashboard",
    load: () => loadHireDashboardAction(shell.hireGroupId),
  });
  const payments = useHireWorkspaceCachedLoad<HirePaymentsPageData>({
    key: "payments",
    load: () => loadHirePaymentsPageAction(shell.hireGroupId),
  });
  const inspection = useHireWorkspaceCachedLoad<HireEndedInspectionAttentionData>({
    key: "inspectionAttention",
    skipLoad: !chrome.contractEnded,
    load: () => loadHireEndedInspectionAttentionAction(shell.hireGroupId),
  });

  const pending = dashboard.pending || payments.pending || inspection.pending;
  const error = dashboard.error ?? payments.error ?? inspection.error;
  const data = dashboard.data;
  const paymentsData = payments.data;
  const paymentRows: readonly HirePaymentPageRow[] = paymentsData?.rows ?? [];

  if (!data && pending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        <p className="text-sm text-rph-fg-secondary">Loading summary…</p>
      </div>
    );
  }

  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!data || !paymentsData) return null;

  const contractEnded = data.overview.contractEnded;

  if (!contractEnded) {
    return (
      <HireActiveCompanySummary
        data={data}
        context={data.overview}
        chrome={chrome}
        paymentRows={paymentRows}
        extraChargesOutstandingGbp={paymentsData.extraChargesOutstandingGbp}
        paymentsHref={`${base}/payments`}
        detailsHref={`${base}/details`}
        onRecordPayment={
          shell.canManagePayments || shell.canApprovePayments
            ? () => router.push(`${base}/payments`)
            : undefined
        }
      />
    );
  }

  return (
    <HireEndedCompanySummary
      data={data}
      context={data.overview}
      payments={paymentsData}
      inspectionItems={inspection.data?.items ?? []}
      paymentsHref={`${base}/payments`}
      detailsHref={`${base}/details`}
      inspectionsHref={`${base}/checkout`}
    />
  );
}
