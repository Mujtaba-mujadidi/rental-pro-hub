"use client";

import type { HireDashboardData } from "@/app/actions/hire-dashboard";
import type { HireOverviewContext } from "@/lib/fleet/hire-overview-types";
import { HireOverviewHeader } from "@/components/fleet/hire-overview/hire-overview-header";
import { HireOverviewRentalSummary } from "@/components/fleet/hire-overview/hire-overview-rental-summary";
import { HireOverviewPaymentSummary } from "@/components/fleet/hire-overview/hire-overview-payment-summary";
import { HireOverviewSettlementNote } from "@/components/fleet/hire-overview/hire-overview-settlement-note";
import { HireDashboardPaymentChart } from "@/components/fleet/hire-dashboard/hire-dashboard-payment-chart";
import { HireDashboardAttentionList } from "@/components/fleet/hire-dashboard/hire-dashboard-attention-list";
import { HireDepositPendingBanner } from "@/components/fleet/hire-dashboard/hire-deposit-pending-banner";
import { RphPageHeader } from "@/components/ui/rph-toolbar";
import type { ReactNode } from "react";

export function HireOverviewView({
  data,
  context,
  audience,
  headerActions,
  paymentsHref,
  onOpenPayments,
}: {
  data: HireDashboardData;
  context: HireOverviewContext;
  audience: "staff" | "driver";
  headerActions?: ReactNode;
  paymentsHref?: string;
  onOpenPayments?: () => void;
}) {
  const contractEnded = context.contractEnded;

  return (
    <div className="space-y-4">
      <RphPageHeader
        title="Overview"
        description={
          contractEnded
            ? "Summary of this ended rental and its payments."
            : "Summary of this active rental and payments so far."
        }
        actions={headerActions}
      />

      <HireOverviewHeader context={context} health={data.health} audience={audience} />

      <HireDepositPendingBanner
        hireGroupId={context.hireGroupId}
        closure={data.financialClosure}
        audience={audience}
      />

      <HireOverviewRentalSummary context={context} />

      <HireOverviewPaymentSummary
        summary={data.summary}
        contractEnded={contractEnded}
        terminationSummary={data.terminationSummary}
      />

      {contractEnded ? (
        <HireOverviewSettlementNote
          hireGroupId={context.hireGroupId}
          audience={audience}
          settlementBalance={data.settlementBalance}
          terminationSummary={data.terminationSummary}
          depositPendingReview={data.depositPendingReview}
          depositGbp={data.depositGbp}
          depositDispositionLabel={data.depositDispositionLabel}
          hasPostEndPrepaidPayments={data.hasPostEndPrepaidPayments}
        />
      ) : null}

      <HireDashboardPaymentChart points={data.chartPoints} />

      <HireDashboardAttentionList
        items={data.attentionItems}
        paymentsHref={paymentsHref}
        paymentsLabel={audience === "driver" ? "Open payments" : undefined}
        onOpenPayments={onOpenPayments}
      />
    </div>
  );
}
