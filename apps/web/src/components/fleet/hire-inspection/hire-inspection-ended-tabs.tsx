"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export type HireInspectionEndedTab = "comparison" | "checkout" | "checkin";

const TABS: { id: HireInspectionEndedTab; label: string }[] = [
  { id: "comparison", label: "Comparison" },
  { id: "checkout", label: "Checkout" },
  { id: "checkin", label: "Check-in" },
];

export function resolveInitialEndedInspectionTab(input: {
  focusKind: "checkout" | "checkin";
  checkoutCompleted: boolean;
  checkinCompleted: boolean;
}): HireInspectionEndedTab {
  if (!input.checkoutCompleted) return "checkout";
  if (!input.checkinCompleted) return input.focusKind === "checkin" ? "checkin" : "checkout";
  if (input.focusKind === "checkin") return "checkin";
  return "comparison";
}

type HireInspectionEndedTabBarProps = {
  activeTab: HireInspectionEndedTab;
  onTabChange: (tab: HireInspectionEndedTab) => void;
  comparisonEnabled: boolean;
};

export function HireInspectionEndedTabBar({
  activeTab,
  onTabChange,
  comparisonEnabled,
}: HireInspectionEndedTabBarProps) {
  return (
    <div className="hire-ws-inspection-ended-tabs" role="tablist" aria-label="Inspection views">
      {TABS.map((tab) => {
        const disabled = tab.id === "comparison" && !comparisonEnabled;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`hire-inspection-ended-panel-${tab.id}`}
            disabled={disabled}
            className={
              active
                ? "hire-ws-inspection-ended-tab hire-ws-inspection-ended-tab-active"
                : "hire-ws-inspection-ended-tab"
            }
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function HireInspectionEndedTabPanel({
  tab,
  children,
}: {
  tab: HireInspectionEndedTab;
  children: ReactNode;
}) {
  return (
    <div id={`hire-inspection-ended-panel-${tab}`} className="hire-ws-inspection-ended-panel" role="tabpanel">
      {children}
    </div>
  );
}

export function useEndedInspectionTabState(
  input: {
    focusKind: "checkout" | "checkin";
    checkoutCompleted: boolean;
    checkinCompleted: boolean;
  },
  ready: boolean,
) {
  const [activeTab, setActiveTab] = useState<HireInspectionEndedTab>(() =>
    resolveInitialEndedInspectionTab(input),
  );

  useEffect(() => {
    if (!ready) return;
    setActiveTab(resolveInitialEndedInspectionTab(input));
  }, [ready, input.checkoutCompleted, input.checkinCompleted, input.focusKind]);

  return { activeTab, setActiveTab };
}
