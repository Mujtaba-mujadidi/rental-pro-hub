"use client";

import type { HireInspectionPayload } from "@/app/actions/hire-inspections";
import { HireWorkspaceChip } from "@/components/fleet/hire-workspace/hire-workspace-ui";
import { formatHireInspectionStamp } from "@/lib/fleet/hire-inspection-display";
import {
  buildHireInspectionComparisonTable,
  hireInspectionCheckinNeedsReview,
  type HireInspectionComparisonResultTone,
} from "@/lib/fleet/hire-inspection-comparison-display";
import type { HireInspectionDiffResult } from "@/lib/fleet/hire-inspection-lifecycle";
import { shouldReviewEndedHireMileage } from "@/lib/fleet/hire-ended-inspection-attention";
import { isNewInspectionDamage } from "@/lib/fleet/hire-inspection-damage-charges";
import {
  hireInspectionEndedComparisonCopy,
  type HireInspectionWorkspaceAudience,
} from "@/lib/fleet/hire-inspection-ended-display";

type HireInspectionComparisonViewProps = {
  audience?: HireInspectionWorkspaceAudience;
  checkout: HireInspectionPayload;
  checkin: HireInspectionPayload;
  damageDiff: HireInspectionDiffResult;
  onOpenCheckout: () => void;
  onOpenCheckin: () => void;
  onReviewMileage: () => void;
};

export function HireInspectionComparisonView({
  audience = "staff",
  checkout,
  checkin,
  damageDiff,
  onOpenCheckout,
  onOpenCheckin,
  onReviewMileage,
}: HireInspectionComparisonViewProps) {
  const copy = hireInspectionEndedComparisonCopy(audience);
  const rows = buildHireInspectionComparisonTable({ checkout, checkin, damageDiff });
  const mileageNeedsReview = shouldReviewEndedHireMileage(
    checkout.odometerReading,
    checkin.odometerReading,
  );
  const checkinNeedsReview = hireInspectionCheckinNeedsReview({ checkout, checkin });
  const newDamageCount = checkin.damages.filter((damage) => isNewInspectionDamage(damage)).length;

  return (
    <div className="hire-ws-inspection-comparison-layout">
      {mileageNeedsReview ? (
        <section className="hire-ws-inspection-comparison-alert" role="status">
          <div className="hire-ws-inspection-comparison-alert-body">
            <span className="hire-ws-inspection-comparison-alert-icon" aria-hidden>
              <WarningIcon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-rph-fg">{copy.mileageAlertTitle}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-rph-fg-secondary">
                {copy.mileageAlertDetail}
              </p>
            </div>
            <button type="button" className="hire-ws-inspection-review-btn" onClick={onReviewMileage}>
              {copy.mileageActionLabel}
            </button>
          </div>
        </section>
      ) : null}

      <section className="hire-ws-inspection-comparison-panel">
        <header className="hire-ws-inspection-comparison-panel-header">
          <h2 className="text-sm font-semibold text-rph-fg">Checkout vs check-in</h2>
          <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">{copy.tableIntro}</p>
        </header>

        <div className="hire-ws-inspection-comparison-table-wrap">
          <table className="hire-ws-inspection-comparison-table">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Checkout</th>
                <th scope="col">Check-in</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Item">{row.label}</td>
                  <td data-label="Checkout">{row.checkoutDisplay}</td>
                  <td data-label="Check-in">{row.checkinDisplay}</td>
                  <td data-label="Result">
                    <ComparisonResult label={row.resultLabel} tone={row.resultTone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="hire-ws-inspection-shortcut-grid">
        <InspectionShortcutCard
          title="Vehicle checkout"
          stamp={checkout.completedAt}
          description={copy.checkoutCardDescription}
          statusLabel="Completed"
          statusTone="success"
          actionLabel={copy.openCheckout}
          onOpen={onOpenCheckout}
        />
        <InspectionShortcutCard
          title="Vehicle check-in"
          stamp={checkin.completedAt}
          description={
            newDamageCount > 0 ? copy.checkinCardDescriptionNewDamage : copy.checkinCardDescription
          }
          statusLabel={checkinNeedsReview ? copy.checkinStatusReview : copy.checkinStatusCompleted}
          statusTone={checkinNeedsReview && audience === "staff" ? "warn" : "success"}
          actionLabel={copy.openCheckin}
          onOpen={onOpenCheckin}
        />
      </div>
    </div>
  );
}

function ComparisonResult({
  label,
  tone,
}: {
  label: string;
  tone: HireInspectionComparisonResultTone;
}) {
  const toneClass =
    tone === "danger"
      ? "hire-ws-inspection-result-danger"
      : tone === "warn"
        ? "hire-ws-inspection-result-warn"
        : tone === "success"
          ? "hire-ws-inspection-result-success"
          : "hire-ws-inspection-result-neutral";

  return (
    <span className={`hire-ws-inspection-result ${toneClass}`}>
      <span className="hire-ws-inspection-result-dot" aria-hidden />
      {label}
    </span>
  );
}

function InspectionShortcutCard({
  title,
  stamp,
  description,
  statusLabel,
  statusTone,
  actionLabel,
  onOpen,
}: {
  title: string;
  stamp: string | null;
  description: string;
  statusLabel: string;
  statusTone: "success" | "warn";
  actionLabel: string;
  onOpen: () => void;
}) {
  return (
    <article className="hire-ws-inspection-shortcut-card">
      <p className="hire-ws-inspection-shortcut-stamp">{formatHireInspectionStamp(stamp)}</p>
      <h3 className="mt-2 text-sm font-semibold text-rph-fg">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-rph-fg-secondary">{description}</p>
      <div className="hire-ws-inspection-shortcut-footer">
        <HireWorkspaceChip tone={statusTone} dot>
          {statusLabel}
        </HireWorkspaceChip>
        <button type="button" className="hire-ws-inspection-shortcut-link" onClick={onOpen}>
          {actionLabel}
          <ChevronIcon />
        </button>
      </div>
    </article>
  );
}

function WarningIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
