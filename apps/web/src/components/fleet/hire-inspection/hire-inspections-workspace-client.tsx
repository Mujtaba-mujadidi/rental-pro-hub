"use client";

import {
  loadDriverHireInspectionAction,
  loadHireInspectionAction,
  loadHireInspectionTrackerOdometerAction,
  type HireInspectionPayload,
} from "@/app/actions/hire-inspections";
import { HireInspectionCompletedView } from "@/components/fleet/hire-inspection/hire-inspection-completed-view";
import { HireInspectionTimeline } from "@/components/fleet/hire-inspection/hire-inspection-timeline";
import { HireInspectionWizard } from "@/components/fleet/hire-inspection/hire-inspection-wizard";
import { buildHireInspectionDiff } from "@/lib/fleet/hire-inspection-lifecycle";
import {
  EMPTY_HIRE_INSPECTION_ACCESSORIES,
  type HireInspectionAccessories,
} from "@/lib/fleet/hire-inspection-accessories";
import type { VehicleDamageDiagramEntry } from "@/components/fleet/hire-inspection/vehicle-damage-diagram";
import { useCallback, useEffect, useMemo, useState } from "react";

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

export function HireInspectionsWorkspaceClient({
  hireGroupId,
  hireStatus,
  vehicleLabel,
  vehicleId,
  focusKind = "checkout",
  audience = "staff",
}: {
  hireGroupId: string;
  hireStatus: string;
  vehicleLabel: string;
  vehicleId?: string | null;
  focusKind?: "checkout" | "checkin";
  audience?: "staff" | "driver";
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutData, setCheckoutData] = useState<HireInspectionPayload | null>(null);
  const [checkinData, setCheckinData] = useState<HireInspectionPayload | null>(null);
  const [trackerLinked, setTrackerLinked] = useState(false);

  const contractEnded = isContractEnded(hireStatus);

  const reload = useCallback(async () => {
    setLoading(true);
    const loadInspection =
      audience === "driver" ? loadDriverHireInspectionAction : loadHireInspectionAction;
    const [checkoutRes, checkinRes, trackerRes] = await Promise.all([
      loadInspection(hireGroupId, "checkout"),
      loadInspection(hireGroupId, "checkin"),
      audience === "staff"
        ? loadHireInspectionTrackerOdometerAction({ hireGroupId, vehicleId })
        : Promise.resolve({ ok: true as const, linked: false as const }),
    ]);
    if (!checkoutRes.ok) {
      setError(checkoutRes.error);
      setCheckoutData(null);
      setCheckinData(null);
      setLoading(false);
      return;
    }
    setCheckoutData(checkoutRes.data);
    setCheckinData(checkinRes.ok ? checkinRes.data : null);
    setTrackerLinked(trackerRes.ok && trackerRes.linked);
    setError(null);
    setLoading(false);
  }, [audience, hireGroupId, vehicleId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const checkoutCompleted = checkoutData?.status === "completed";
  const checkinCompleted = checkinData?.status === "completed";

  const introHint = useMemo(() => {
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
        ? "Checkout is complete. Complete check-in when you return the vehicle."
        : "Checkout is complete. Complete check-in to record the vehicle return.";
    }
    return audience === "driver"
      ? "Complete checkout to record the vehicle condition at handover."
      : "Complete checkout to record the vehicle condition at handover.";
  }, [audience, checkinCompleted, checkoutCompleted, contractEnded]);

  const recordedByLabel = audience === "driver" ? "Rental company" : "Company staff";

  const completedCheckoutView = useMemo(() => {
    if (!checkoutData || checkoutData.status !== "completed") return null;
    const odometer =
      checkoutData.odometerReading != null ? String(checkoutData.odometerReading) : "";
    const accessories: HireInspectionAccessories = checkoutData.accessories ?? {
      ...EMPTY_HIRE_INSPECTION_ACCESSORIES,
    };
    const diagramDamages: VehicleDamageDiagramEntry[] = checkoutData.damages.map((damage) => ({
      id: damage.id,
      panelId: damage.panelId,
      damageType: damage.damageType,
      severity: damage.severity,
      diagramView: damage.diagramView,
      pinX: damage.pinX,
      pinY: damage.pinY,
      checkoutDamageId: damage.checkoutDamageId,
    }));

    return (
      <HireInspectionCompletedView
        hireGroupId={hireGroupId}
        vehicleLabel={vehicleLabel}
        kind="checkout"
        data={checkoutData}
        diagramDamages={diagramDamages}
        odometer={odometer}
        fuelLevel={checkoutData.fuelLevel}
        accessories={accessories}
        generalNotes={checkoutData.generalNotes ?? ""}
        trackerLinked={trackerLinked}
        checkinCompleted={checkinCompleted}
        completedByLabel={recordedByLabel}
      />
    );
  }, [checkinCompleted, checkoutData, hireGroupId, recordedByLabel, trackerLinked, vehicleLabel]);

  const completedCheckinView = useMemo(() => {
    if (!checkinData || checkinData.status !== "completed" || !checkoutData) return null;
    const odometer = checkinData.odometerReading != null ? String(checkinData.odometerReading) : "";
    const diff = buildHireInspectionDiff(checkoutData.damages, checkinData.damages);
    const diagramDamages: VehicleDamageDiagramEntry[] = diff.checkinDamages.map((damage) => ({
      id: damage.id,
      panelId: damage.panelId,
      damageType: damage.damageType,
      severity: damage.severity,
      diagramView: damage.diagramView,
      pinX: damage.pinX,
      pinY: damage.pinY,
      checkoutDamageId: damage.checkoutDamageId,
    }));

    return (
      <HireInspectionCompletedView
        hireGroupId={hireGroupId}
        vehicleLabel={vehicleLabel}
        kind="checkin"
        data={checkinData}
        diagramDamages={diagramDamages}
        odometer={odometer}
        fuelLevel={checkinData.fuelLevel}
        accessories={checkinData.accessories}
        generalNotes={checkinData.generalNotes ?? ""}
        trackerLinked={trackerLinked}
        checkinCompleted
        completedByLabel={recordedByLabel}
      />
    );
  }, [checkinData, checkoutData, hireGroupId, recordedByLabel, trackerLinked, vehicleLabel]);

  if (loading && !checkoutData) return inspectionLoader();
  if (error) return <p className="rph-alert-error text-sm">{error}</p>;

  const showCheckoutWizard =
    audience === "staff" && focusKind === "checkout" && !checkoutCompleted;
  const showCheckinWizard =
    audience === "staff" && focusKind === "checkin" && contractEnded && !checkinCompleted;

  return (
    <div className="space-y-5">
      <header className="hire-ws-inspection-intro">
        <p className="hire-ws-section-kicker">{contractEnded ? "Ended hire" : "Active hire"}</p>
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
        <p className="rounded-xl border border-rph-border bg-rph-raised px-4 py-3 text-sm text-rph-fg-secondary">
          Vehicle checkout will appear here once your rental company completes handover inspection.
        </p>
      ) : null}

      {audience === "driver" && contractEnded && !checkinCompleted && focusKind === "checkin" ? (
        <p className="rounded-xl border border-rph-border bg-rph-raised px-4 py-3 text-sm text-rph-fg-secondary">
          Check-in will appear here once your vehicle return inspection is completed.
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

      {showCheckinWizard ? (
        <HireInspectionWizard
          hireGroupId={hireGroupId}
          kind="checkin"
          vehicleLabel={vehicleLabel}
          hireStatus={hireStatus}
          vehicleId={vehicleId}
          audience={audience}
          embedded
        />
      ) : null}

      {focusKind === "checkout" && checkoutCompleted ? completedCheckoutView : null}
      {focusKind === "checkin" && checkinCompleted ? completedCheckinView : null}
      {contractEnded && checkinCompleted && focusKind === "checkout" ? completedCheckinView : null}
    </div>
  );
}
