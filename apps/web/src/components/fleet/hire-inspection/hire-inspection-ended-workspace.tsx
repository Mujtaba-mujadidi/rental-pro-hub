"use client";

import type { ReactNode } from "react";
import type { HireInspectionPayload } from "@/app/actions/hire-inspections";
import { HireInspectionComparisonView } from "@/components/fleet/hire-inspection/hire-inspection-comparison-view";
import {
  HireInspectionEndedTabBar,
  HireInspectionEndedTabPanel,
  type HireInspectionEndedTab,
} from "@/components/fleet/hire-inspection/hire-inspection-ended-tabs";
import type { HireInspectionDiffResult } from "@/lib/fleet/hire-inspection-lifecycle";
import {
  hireInspectionEndedEmptyMessage,
  type HireInspectionWorkspaceAudience,
} from "@/lib/fleet/hire-inspection-ended-display";

type HireInspectionEndedWorkspaceProps = {
  audience: HireInspectionWorkspaceAudience;
  activeTab: HireInspectionEndedTab;
  onTabChange: (tab: HireInspectionEndedTab) => void;
  checkoutCompleted: boolean;
  checkinCompleted: boolean;
  checkoutData: HireInspectionPayload | null;
  checkinData: HireInspectionPayload | null;
  damageDiff: HireInspectionDiffResult | null;
  completedCheckoutView: ReactNode;
  completedCheckinView: ReactNode;
  staffCheckoutWizard?: ReactNode;
  staffCheckinWizard?: ReactNode;
};

export function HireInspectionEndedWorkspace({
  audience,
  activeTab,
  onTabChange,
  checkoutCompleted,
  checkinCompleted,
  checkoutData,
  checkinData,
  damageDiff,
  completedCheckoutView,
  completedCheckinView,
  staffCheckoutWizard = null,
  staffCheckinWizard = null,
}: HireInspectionEndedWorkspaceProps) {
  const comparisonEnabled = checkoutCompleted && checkinCompleted;

  return (
    <div className="space-y-5">
      <header className="hire-ws-inspection-ended-header">
        <div className="min-w-0">
          <p className="hire-ws-section-kicker">Completed hire</p>
          <h1 className="text-2xl font-semibold tracking-tight text-rph-fg">Inspections</h1>
        </div>
        <HireInspectionEndedTabBar
          activeTab={activeTab}
          onTabChange={onTabChange}
          comparisonEnabled={comparisonEnabled}
        />
      </header>

      {activeTab === "comparison" && comparisonEnabled && checkoutData && checkinData && damageDiff ? (
        <HireInspectionEndedTabPanel tab="comparison">
          <HireInspectionComparisonView
            audience={audience}
            checkout={checkoutData}
            checkin={checkinData}
            damageDiff={damageDiff}
            onOpenCheckout={() => onTabChange("checkout")}
            onOpenCheckin={() => onTabChange("checkin")}
            onReviewMileage={() => onTabChange("checkin")}
          />
        </HireInspectionEndedTabPanel>
      ) : null}

      {activeTab === "checkout" ? (
        <HireInspectionEndedTabPanel tab="checkout">
          {checkoutCompleted ? (
            completedCheckoutView
          ) : staffCheckoutWizard ? (
            <section className="hire-ws-inspection-panel">
              <div className="hire-ws-inspection-panel-body">{staffCheckoutWizard}</div>
            </section>
          ) : (
            <p className="hire-ws-inspection-ended-empty">
              {hireInspectionEndedEmptyMessage(audience, "checkout-pending")}
            </p>
          )}
        </HireInspectionEndedTabPanel>
      ) : null}

      {activeTab === "checkin" ? (
        <HireInspectionEndedTabPanel tab="checkin">
          {checkinCompleted ? (
            completedCheckinView
          ) : staffCheckinWizard ? (
            <section className="hire-ws-inspection-panel">
              <div className="hire-ws-inspection-panel-body">{staffCheckinWizard}</div>
            </section>
          ) : (
            <p className="hire-ws-inspection-ended-empty">
              {hireInspectionEndedEmptyMessage(
                audience,
                checkoutCompleted ? "checkin-pending" : "checkin-blocked",
              )}
            </p>
          )}
        </HireInspectionEndedTabPanel>
      ) : null}
    </div>
  );
}
