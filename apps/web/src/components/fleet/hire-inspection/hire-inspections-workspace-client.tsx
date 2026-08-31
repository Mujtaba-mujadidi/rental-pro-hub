"use client";

import {
  loadDriverHireInspectionAction,
  loadHireInspectionAction,
  loadHireInspectionTrackerOdometerAction,
  type HireInspectionPayload,
} from "@/app/actions/hire-inspections";
import { HireInspectionCompletedView } from "@/components/fleet/hire-inspection/hire-inspection-completed-view";
import { HireInspectionEndedWorkspace } from "@/components/fleet/hire-inspection/hire-inspection-ended-workspace";
import { useEndedInspectionTabState } from "@/components/fleet/hire-inspection/hire-inspection-ended-tabs";
import { HireInspectionTimeline } from "@/components/fleet/hire-inspection/hire-inspection-timeline";
import { HireInspectionWizard } from "@/components/fleet/hire-inspection/hire-inspection-wizard";
import { useHireWorkspaceCachedLoad } from "@/hooks/use-hire-workspace-cached-load";
import { buildHireInspectionDiff } from "@/lib/fleet/hire-inspection-lifecycle";
import {
  EMPTY_HIRE_INSPECTION_ACCESSORIES,
  type HireInspectionAccessories,
} from "@/lib/fleet/hire-inspection-accessories";
import { hireInspectionEndedEmptyMessage } from "@/lib/fleet/hire-inspection-ended-display";
import type { VehicleDamageDiagramEntry } from "@/components/fleet/hire-inspection/vehicle-damage-diagram";
import { useMemo } from "react";

function isContractEnded(status: string): boolean {
  return status === "terminated" || status === "completed";
}

function inspectionLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
      <p className="text-sm text-rph-fg-secondary">Loading inspections…</p>
    </div>
  );
}

function toDiagramDamages(
  damages: HireInspectionPayload["damages"],
): VehicleDamageDiagramEntry[] {
  return damages.map((damage) => ({
    id: damage.id,
    panelId: damage.panelId,
    damageType: damage.damageType,
    severity: damage.severity,
    diagramView: damage.diagramView,
    pinX: damage.pinX,
    pinY: damage.pinY,
    checkoutDamageId: damage.checkoutDamageId,
  }));
}

export function HireInspectionsWorkspaceClient({
  hireGroupId,
  hireStatus,
  vehicleLabel,
  vehicleId,
  focusKind = "checkout",
  audience = "staff",
  onCheckinComplete,
}: {
  hireGroupId: string;
  hireStatus: string;
  vehicleLabel: string;
  vehicleId?: string | null;
  focusKind?: "checkout" | "checkin";
  audience?: "staff" | "driver";
  onCheckinComplete?: () => void | Promise<void>;
}) {
  const contractEnded = isContractEnded(hireStatus);
  const query = useHireWorkspaceCachedLoad<{
    checkout: HireInspectionPayload;
    checkin: HireInspectionPayload | null;
    trackerLinked: boolean;
  }>({
    key: "inspections",
    useCache: audience === "staff",
    load: async () => {
      const loadInspection =
        audience === "driver" ? loadDriverHireInspectionAction : loadHireInspectionAction;
      const [checkoutRes, checkinRes, trackerRes] = await Promise.all([
        loadInspection(hireGroupId, "checkout"),
        loadInspection(hireGroupId, "checkin"),
        audience === "staff"
          ? loadHireInspectionTrackerOdometerAction({ hireGroupId, vehicleId })
          : Promise.resolve({ ok: true as const, linked: false as const }),
      ]);
      if (!checkoutRes.ok) return checkoutRes;
      return {
        ok: true as const,
        data: {
          checkout: checkoutRes.data,
          checkin: checkinRes.ok ? checkinRes.data : null,
          trackerLinked: trackerRes.ok && trackerRes.linked,
        },
      };
    },
  });

  const loading = query.pending;
  const error = query.error;
  const checkoutData = query.data?.checkout ?? null;
  const checkinData = query.data?.checkin ?? null;
  const trackerLinked = query.data?.trackerLinked ?? false;

  const checkoutCompleted = checkoutData?.status === "completed";
  const checkinCompleted = checkinData?.status === "completed";

  const { activeTab, setActiveTab } = useEndedInspectionTabState(
    {
      focusKind,
      checkoutCompleted: Boolean(checkoutCompleted),
      checkinCompleted: Boolean(checkinCompleted),
    },
    !loading && checkoutData != null,
  );

  const damageDiff = useMemo(() => {
    if (!checkoutData || !checkinData) return null;
    return buildHireInspectionDiff(checkoutData.damages, checkinData.damages);
  }, [checkoutData, checkinData]);

  const completedCheckoutView = useMemo(() => {
    if (!checkoutData || checkoutData.status !== "completed") return null;
    const accessories: HireInspectionAccessories = checkoutData.accessories ?? {
      ...EMPTY_HIRE_INSPECTION_ACCESSORIES,
    };

    return (
      <HireInspectionCompletedView
        hireGroupId={hireGroupId}
        vehicleLabel={vehicleLabel}
        kind="checkout"
        data={checkoutData}
        diagramDamages={toDiagramDamages(checkoutData.damages)}
        odometer={checkoutData.odometerReading != null ? String(checkoutData.odometerReading) : ""}
        fuelLevel={checkoutData.fuelLevel}
        accessories={accessories}
        generalNotes={checkoutData.generalNotes ?? ""}
        trackerLinked={trackerLinked}
        checkinCompleted={checkinCompleted}
        completedByLabel={
          audience === "driver" ? "Rental company" : checkoutData.completedByLabel?.trim() || "Company staff"
        }
      />
    );
  }, [
    audience,
    checkinCompleted,
    checkoutData,
    hireGroupId,
    trackerLinked,
    vehicleLabel,
  ]);

  const completedCheckinView = useMemo(() => {
    if (!checkinData || checkinData.status !== "completed" || !checkoutData || !damageDiff) return null;

    return (
      <HireInspectionCompletedView
        hireGroupId={hireGroupId}
        vehicleLabel={vehicleLabel}
        kind="checkin"
        data={checkinData}
        diagramDamages={damageDiff.checkinDamages.map((damage) => ({
          id: damage.id,
          panelId: damage.panelId,
          damageType: damage.damageType,
          severity: damage.severity,
          diagramView: damage.diagramView,
          pinX: damage.pinX,
          pinY: damage.pinY,
          checkoutDamageId: damage.checkoutDamageId,
          diffStatus: damage.diffStatus,
        }))}
        odometer={checkinData.odometerReading != null ? String(checkinData.odometerReading) : ""}
        fuelLevel={checkinData.fuelLevel}
        accessories={checkinData.accessories}
        generalNotes={checkinData.generalNotes ?? ""}
        trackerLinked={trackerLinked}
        checkinCompleted
        completedByLabel={
          audience === "driver" ? "Rental company" : checkinData.completedByLabel?.trim() || "Company staff"
        }
      />
    );
  }, [audience, checkinData, checkoutData, damageDiff, hireGroupId, trackerLinked, vehicleLabel]);

  const introHint = useMemo(() => {
    if (contractEnded && checkinCompleted) {
      return audience === "driver"
        ? "Checkout and check-in are complete. Review your vehicle return details below."
        : "Checkout and check-in are complete. Review the comparison below.";
    }
    if (checkinCompleted) {
      return audience === "driver"
        ? "Checkout and check-in are complete. Review your vehicle return details below."
        : "Checkout and check-in are complete. Review the comparison below.";
    }
    if (checkoutCompleted && !contractEnded) {
      return audience === "driver"
        ? "Checkout is complete. Check-in and comparison become available when your hire ends."
        : "Checkout is complete. Check-in and comparison become available when the hire is ended.";
    }
    if (checkoutCompleted && contractEnded) {
      return audience === "driver"
        ? "Checkout is complete. Your return inspection will appear here once recorded."
        : "Checkout is complete. Complete check-in to record the vehicle return.";
    }
    return audience === "driver"
      ? "Your handover inspection will appear here once your rental company completes checkout."
      : "Complete checkout to record the vehicle condition at handover.";
  }, [audience, checkinCompleted, checkoutCompleted, contractEnded]);

  if (loading && !checkoutData) return inspectionLoader();
  if (error) return <p className="rph-alert-error text-sm">{error}</p>;

  const showCheckoutWizard =
    audience === "staff" && focusKind === "checkout" && !checkoutCompleted;

  if (contractEnded) {
    return (
      <HireInspectionEndedWorkspace
        audience={audience}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        checkoutCompleted={Boolean(checkoutCompleted)}
        checkinCompleted={Boolean(checkinCompleted)}
        checkoutData={checkoutData}
        checkinData={checkinData}
        damageDiff={damageDiff}
        completedCheckoutView={completedCheckoutView}
        completedCheckinView={completedCheckinView}
        staffCheckoutWizard={
          audience === "staff" && !checkoutCompleted ? (
            <HireInspectionWizard
              hireGroupId={hireGroupId}
              kind="checkout"
              vehicleLabel={vehicleLabel}
              hireStatus={hireStatus}
              vehicleId={vehicleId}
              audience={audience}
              embedded
            />
          ) : null
        }
        staffCheckinWizard={
          audience === "staff" && checkoutCompleted && !checkinCompleted ? (
            <HireInspectionWizard
              hireGroupId={hireGroupId}
              kind="checkin"
              vehicleLabel={vehicleLabel}
              hireStatus={hireStatus}
              vehicleId={vehicleId}
              audience={audience}
              embedded
              onStaffComplete={onCheckinComplete}
            />
          ) : null
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="hire-ws-inspection-intro">
        <p className="hire-ws-section-kicker">Active hire</p>
        <h1 className="text-2xl font-semibold tracking-tight text-rph-fg">Inspections</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-rph-fg-secondary">{introHint}</p>
      </header>

      <HireInspectionTimeline
        contractEnded={contractEnded}
        checkout={
          checkoutCompleted && checkoutData
            ? {
                completedAt: checkoutData.completedAt,
                odometerMiles: checkoutData.odometerReading,
                fuelLevelPercent: checkoutData.fuelLevel,
              }
            : null
        }
        checkinCompleted={checkinCompleted}
        audience={audience}
      />

      {audience === "driver" && !checkoutCompleted ? (
        <p className="hire-ws-inspection-ended-empty">
          {hireInspectionEndedEmptyMessage(audience, "checkout-pending")}
        </p>
      ) : null}

      {showCheckoutWizard ? (
        <HireInspectionWizard
          hireGroupId={hireGroupId}
          kind="checkout"
          vehicleLabel={vehicleLabel}
          hireStatus={hireStatus}
          vehicleId={vehicleId}
          audience={audience}
          embedded
        />
      ) : null}

      {focusKind === "checkout" && checkoutCompleted ? completedCheckoutView : null}
      {focusKind === "checkin" && checkinCompleted ? completedCheckinView : null}
    </div>
  );
}
