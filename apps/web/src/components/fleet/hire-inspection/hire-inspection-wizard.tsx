"use client";

import {
  completeHireCheckinAction,
  completeHireCheckoutAction,
  loadDriverHireInspectionAction,
  loadHireInspectionAction,
  loadHireInspectionPaymentAccountsAction,
  loadHireInspectionTrackerOdometerAction,
  saveHireInspectionDraftAction,
  syncHireInspectionMediaDraftAction,
  type HireInspectionPaymentAccountOption,
  type HireInspectionPayload,
} from "@/app/actions/hire-inspections";
import { RphSelect } from "@/components/forms/rph-select";
import { FormModalStepProgress } from "@/components/forms/form-modal-step-progress";
import { HireInspectionCompletedView } from "@/components/fleet/hire-inspection/hire-inspection-completed-view";
import { HireInspectionPhotosSection } from "@/components/fleet/hire-inspection/hire-inspection-photos-section";
import { HireInspectionReadingsSection } from "@/components/fleet/hire-inspection/hire-inspection-readings-section";
import { HireInspectionReviewSection } from "@/components/fleet/hire-inspection/hire-inspection-review-section";
import { VehicleDamageDiagram } from "@/components/fleet/hire-inspection/vehicle-damage-diagram";
import type { VehicleDamageDiagramEntry } from "@/components/fleet/hire-inspection/vehicle-damage-diagram";
import {
  EMPTY_HIRE_INSPECTION_ACCESSORIES,
  type HireInspectionAccessories,
  type HireInspectionAccessoryKey,
} from "@/lib/fleet/hire-inspection-accessories";
import { buildHireInspectionDiff } from "@/lib/fleet/hire-inspection-lifecycle";
import {
  draftDamageToSaveInput,
  mapInspectionDamagesToDraft,
  newLocalDamageId,
  seedCheckinDamagesFromCheckout,
  type HireInspectionDraftDamage,
} from "@/lib/fleet/hire-inspection-draft-damages";
import type { HireInspectionDamageChargeResolution } from "@/lib/fleet/hire-inspection-damage-charges";
import {
  buildMediaDraftFormData,
  createDraftMediaFromFiles,
  mapInspectionMediaToDraft,
  revokeDraftMediaUrls,
  type HireInspectionDraftMedia,
} from "@/lib/fleet/hire-inspection-draft-media";
import type { HireInspectionDiagramViewId } from "@/lib/fleet/hire-inspection-diagram";
import { isCheckoutDue } from "@/lib/fleet/hire-lifecycle-attention";
import {
  HIRE_DAMAGE_SEVERITIES,
  HIRE_DAMAGE_TYPES,
  getVehicleDamagePanel,
  hireDamageSeverityLabel,
  hireDamageTypeLabel,
  type HireDamageSeverity,
  type HireDamageType,
  type HireInspectionKind,
} from "@/lib/fleet/vehicle-damage-panels";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useHireWorkspaceCache } from "@/app/(main)/rental/hires/[groupId]/hire-workspace-provider";
import { hireWorkspaceKeysInvalidatedByInspectionChange } from "@/lib/fleet/hire-workspace-tab-cache";

const STEP_LABELS = ["Vehicle", "Damage", "Photos", "Summary"];

function HireInspectionWizardLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
      <p className="text-sm text-rph-fg-secondary">{label}</p>
    </div>
  );
}

function HireInspectionWizardBusyOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-rph-page/75 backdrop-blur-[1px]">
      <div className="flex items-center gap-2 rounded-lg border border-rph-border bg-rph-raised px-3 py-2 text-sm text-rph-fg-secondary shadow-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
        {label}
      </div>
    </div>
  );
}

type HireInspectionDamageFormProps = {
  selectedPanelId: string | null;
  selectedDamageId: string | null;
  damageType: HireDamageType;
  severity: HireDamageSeverity;
  damageNotes: string;
  linkPreExisting: boolean;
  pending: boolean;
  kind: HireInspectionKind;
  showPanelPrompt: boolean;
  hasCheckoutBaseline: boolean;
  onDamageTypeChange: (value: HireDamageType) => void;
  onSeverityChange: (value: HireDamageSeverity) => void;
  onDamageNotesChange: (value: string) => void;
  onLinkPreExistingChange: (value: boolean) => void;
  onSave: () => void;
  onRemove: () => void;
};

function HireInspectionDamageForm({
  selectedPanelId,
  selectedDamageId,
  damageType,
  severity,
  damageNotes,
  linkPreExisting,
  pending,
  kind,
  showPanelPrompt,
  hasCheckoutBaseline,
  onDamageTypeChange,
  onSeverityChange,
  onDamageNotesChange,
  onLinkPreExistingChange,
  onSave,
  onRemove,
}: HireInspectionDamageFormProps) {
  if (!selectedPanelId) {
    if (!showPanelPrompt) return null;
    return <p className="rph-muted text-sm">Click a panel on the diagram to add or edit damage.</p>;
  }

  const panelLabel = getVehicleDamagePanel(selectedPanelId)?.label ?? selectedPanelId;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-rph-fg">Damage details</h3>
      <p className="text-sm text-rph-fg-secondary">{panelLabel}</p>
      <label className="block text-sm">
        <span className="rph-muted mb-1 block text-xs">Type</span>
        <RphSelect
          value={damageType}
          aria-label="Damage type"
          options={HIRE_DAMAGE_TYPES.map((t) => ({
            value: t,
            label: hireDamageTypeLabel(t),
          }))}
          onValueChange={(value) => onDamageTypeChange(value as HireDamageType)}
        />
      </label>
      <label className="block text-sm">
        <span className="rph-muted mb-1 block text-xs">Severity</span>
        <RphSelect
          value={severity}
          aria-label="Damage severity"
          options={HIRE_DAMAGE_SEVERITIES.map((s) => ({
            value: s,
            label: hireDamageSeverityLabel(s),
          }))}
          onValueChange={(value) => onSeverityChange(value as HireDamageSeverity)}
        />
      </label>
      <label className="block text-sm">
        <span className="rph-muted mb-1 block text-xs">Notes</span>
        <textarea
          className="rph-input min-h-16"
          value={damageNotes}
          onChange={(e) => onDamageNotesChange(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="rph-btn-primary text-sm" onClick={onSave} disabled={pending}>
          {selectedDamageId ? "Update damage" : "Add damage"}
        </button>
        {selectedDamageId ? (
          <button
            type="button"
            className="rph-btn-ghost text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            onClick={onRemove}
            disabled={pending}
          >
            Remove damage
          </button>
        ) : null}
      </div>
    </div>
  );
}

type Props = {
  hireGroupId: string;
  kind: HireInspectionKind;
  vehicleLabel: string;
  hireStatus: string;
  vehicleId?: string | null;
  audience?: "staff" | "driver";
  embedded?: boolean;
};

export function HireInspectionWizard({
  hireGroupId,
  kind,
  vehicleLabel,
  hireStatus,
  vehicleId,
  audience = "staff",
  embedded = false,
}: Props) {
  const router = useRouter();
  const workspaceCache = useHireWorkspaceCache();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HireInspectionPayload | null>(null);
  const [checkoutBaseline, setCheckoutBaseline] = useState<HireInspectionPayload | null>(null);

  const [odometer, setOdometer] = useState("");
  const [fuelLevel, setFuelLevel] = useState<number | null>(null);
  const [generalNotes, setGeneralNotes] = useState("");
  const [accessories, setAccessories] = useState<HireInspectionAccessories>({
    ...EMPTY_HIRE_INSPECTION_ACCESSORIES,
  });
  const [trackerOdometerMiles, setTrackerOdometerMiles] = useState<number | null>(null);
  const [trackerLinked, setTrackerLinked] = useState(false);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [trackerLiveUnavailable, setTrackerLiveUnavailable] = useState(false);
  const [trackerError, setTrackerError] = useState<string | null>(null);

  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [selectedDiagramView, setSelectedDiagramView] = useState<HireInspectionDiagramViewId | null>(
    null,
  );
  const [selectedPin, setSelectedPin] = useState<{ pinX: number; pinY: number } | null>(null);
  const [selectedDamageId, setSelectedDamageId] = useState<string | null>(null);
  const [damageType, setDamageType] = useState<HireDamageType>("scratch");
  const [severity, setSeverity] = useState<HireDamageSeverity>("minor");
  const [damageNotes, setDamageNotes] = useState("");
  const [linkPreExisting, setLinkPreExisting] = useState(false);
  const [diagramExpanded, setDiagramExpanded] = useState(false);
  const [draftDamages, setDraftDamages] = useState<HireInspectionDraftDamage[]>([]);
  const [draftMedia, setDraftMedia] = useState<HireInspectionDraftMedia[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<HireInspectionPaymentAccountOption[]>([]);
  const [damagePaymentMethod, setDamagePaymentMethod] = useState("cash");
  const [damagePaymentAccountId, setDamagePaymentAccountId] = useState("");
  const [damagePaymentReference, setDamagePaymentReference] = useState("");

  const title = kind === "checkout" ? "Vehicle checkout" : "Vehicle check-in";
  const completeLabel = kind === "checkout" ? "Complete checkout" : "Complete check-in";

  const applyInspectionPayload = useCallback((payload: HireInspectionPayload) => {
    setData(payload);
    setOdometer(payload.odometerReading != null ? String(payload.odometerReading) : "");
    setFuelLevel(payload.fuelLevel);
    setGeneralNotes(payload.generalNotes ?? "");
    setAccessories(payload.accessories);
    setDraftDamages(mapInspectionDamagesToDraft(payload.damages));
    setDraftMedia((prev) => {
      revokeDraftMediaUrls(prev);
      return mapInspectionMediaToDraft(payload.media);
    });
    setError(null);
  }, []);

  const loadInspection = useCallback(async () => {
    setLoading(true);
    const loadAction =
      audience === "driver" ? loadDriverHireInspectionAction : loadHireInspectionAction;
    const res = await loadAction(hireGroupId, kind);
    if (!res.ok) {
      setError(res.error);
      setData(null);
      setLoading(false);
      return;
    }
    applyInspectionPayload(res.data);

    if (kind === "checkin") {
      const checkoutRes = await loadAction(hireGroupId, "checkout");
      if (checkoutRes.ok) {
        setCheckoutBaseline(checkoutRes.data);
        setDraftDamages(
          seedCheckinDamagesFromCheckout(
            mapInspectionDamagesToDraft(res.data.damages),
            checkoutRes.data.damages,
          ),
        );
      }
    }
    setLoading(false);
  }, [applyInspectionPayload, audience, hireGroupId, kind]);

  useEffect(() => {
    void loadInspection();
  }, [loadInspection]);

  const readOnly = audience === "driver" || data?.status === "completed";
  const resolvedVehicleId = vehicleId?.trim() || data?.vehicleId?.trim() || null;

  useEffect(() => {
    if (audience !== "staff" || readOnly || !hireGroupId.trim()) return;
    let cancelled = false;
    void (async () => {
      setTrackerLoading(true);
      setTrackerError(null);
      const res = await loadHireInspectionTrackerOdometerAction({
        hireGroupId,
        vehicleId: resolvedVehicleId,
      });
      if (cancelled) return;
      setTrackerLoading(false);
      if (!res.ok) {
        setTrackerError(res.error);
        setTrackerLinked(false);
        setTrackerOdometerMiles(null);
        setTrackerLiveUnavailable(false);
        return;
      }
      if (!res.linked) {
        setTrackerLinked(false);
        setTrackerOdometerMiles(null);
        setTrackerLiveUnavailable(false);
        return;
      }
      setTrackerLinked(true);
      setTrackerOdometerMiles(res.odometerMiles);
      setTrackerLiveUnavailable(res.liveUnavailable);
      if (res.odometerMiles != null) {
        setOdometer((prev) => (prev.trim() ? prev : String(Math.round(res.odometerMiles!))));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audience, hireGroupId, readOnly, resolvedVehicleId]);

  useEffect(() => {
    if (audience !== "staff" || kind !== "checkin" || readOnly) return;
    let cancelled = false;
    void (async () => {
      const res = await loadHireInspectionPaymentAccountsAction(hireGroupId);
      if (cancelled || !res.ok) return;
      setPaymentAccounts(res.accounts);
      setDamagePaymentAccountId((current) => {
        if (current) return current;
        return (
          res.defaultPaymentAccountId ??
          res.accounts.find((account) => account.isDefault)?.id ??
          res.accounts[0]?.id ??
          ""
        );
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [audience, hireGroupId, kind, readOnly]);

  const diagramDamages = useMemo(() => {
    const rows = draftDamages.map((d) => ({
      id: d.id,
      panelId: d.panelId,
      damageType: d.damageType,
      severity: d.severity,
      notes: d.notes,
      checkoutDamageId: d.checkoutDamageId,
      diagramView: d.diagramView,
      pinX: d.pinX,
      pinY: d.pinY,
      chargeGbp: d.chargeGbp,
      chargeResolution: d.chargeResolution,
    }));
    if (kind !== "checkin" || !checkoutBaseline) {
      return rows;
    }
    const diff = buildHireInspectionDiff(
      checkoutBaseline.damages.map((d) => ({
        id: d.id,
        panelId: d.panelId,
        damageType: d.damageType,
        severity: d.severity,
        notes: d.notes,
        checkoutDamageId: d.checkoutDamageId,
        diagramView: d.diagramView,
        pinX: d.pinX,
        pinY: d.pinY,
        chargeGbp: d.chargeGbp,
        chargeResolution: d.chargeResolution,
      })),
      rows,
    );
    return diff.checkinDamages.map((d) => ({
      id: d.id,
      panelId: d.panelId,
      damageType: d.damageType,
      severity: d.severity,
      notes: d.notes,
      diffStatus: d.diffStatus,
      diagramView: d.diagramView,
      pinX: d.pinX,
      pinY: d.pinY,
    }));
  }, [checkoutBaseline, draftDamages, kind]);

  function parseOdometerReading(): number | null | "invalid" {
    if (!odometer.trim()) return null;
    const value = Number.parseInt(odometer, 10);
    if (Number.isNaN(value) || value < 0) return "invalid";
    return value;
  }

  function buildDraftPayload() {
    const odometerReading = parseOdometerReading();
    if (odometerReading === "invalid") return null;
    return {
      hireGroupId,
      kind,
      odometerReading,
      fuelLevel,
      generalNotes,
      accessories,
      damages: draftDamages.map(draftDamageToSaveInput),
      syncTrackerOdometer: true,
    };
  }

  function clearDamageSelection() {
    setSelectedDamageId(null);
    setSelectedPanelId(null);
    setSelectedDiagramView(null);
    setSelectedPin(null);
    setDamageType("scratch");
    setSeverity("minor");
    setDamageNotes("");
    setLinkPreExisting(false);
  }

  async function persistDraft(): Promise<boolean> {
    const payload = buildDraftPayload();
    if (!payload) {
      setError("Enter a valid odometer reading.");
      return false;
    }
    const draftRes = await saveHireInspectionDraftAction(payload);
    if (!draftRes.ok) {
      setError(draftRes.error);
      return false;
    }
    const mediaRes = await syncHireInspectionMediaDraftAction(
      buildMediaDraftFormData({ hireGroupId, kind, draftMedia }),
    );
    if (!mediaRes.ok) {
      setError(mediaRes.error);
      return false;
    }
    setError(null);
    await loadInspection();
    return true;
  }

  function saveDraft() {
    startSaving(async () => {
      await persistDraft();
    });
  }

  function isPreExistingCheckinDamage(damage: HireInspectionDraftDamage): boolean {
    return kind === "checkin" && damage.checkoutDamageId != null;
  }

  function canEditCheckinDamage(damage: VehicleDamageDiagramEntry): boolean {
    return kind !== "checkin" || damage.diffStatus !== "pre_existing";
  }

  function onPanelSelect(
    panelId: string,
    context: { diagramView: HireInspectionDiagramViewId; pinX: number; pinY: number },
  ) {
    if (readOnly) return;
    setSelectedPanelId(panelId);
    setSelectedDiagramView(context.diagramView);
    setSelectedPin({ pinX: context.pinX, pinY: context.pinY });
    setSelectedDamageId(null);
    setDamageType("scratch");
    setSeverity("minor");
    setDamageNotes("");
    setLinkPreExisting(false);
  }

  function onDamageSelect(damageId: string) {
    const damage = draftDamages.find((d) => d.id === damageId);
    if (!damage || isPreExistingCheckinDamage(damage)) return;
    setSelectedDamageId(damageId);
    setSelectedPanelId(damage.panelId);
    setSelectedDiagramView(damage.diagramView);
    setSelectedPin(
      damage.pinX != null && damage.pinY != null
        ? { pinX: damage.pinX, pinY: damage.pinY }
        : null,
    );
    setDamageType(damage.damageType);
    setSeverity(damage.severity);
    setDamageNotes(damage.notes ?? "");
    setLinkPreExisting(false);
  }

  function saveDamage() {
    if (!selectedPanelId) return;

    if (selectedDamageId) {
      const existing = draftDamages.find((damage) => damage.id === selectedDamageId);
      if (existing && isPreExistingCheckinDamage(existing)) return;
    }

    const checkoutDamageId: string | null = null;

    const patch = {
      panelId: selectedPanelId,
      damageType,
      severity,
      notes: damageNotes.trim() || null,
      checkoutDamageId,
      diagramView: selectedDiagramView,
      pinX: selectedPin?.pinX ?? null,
      pinY: selectedPin?.pinY ?? null,
    };

    setDraftDamages((prev) => {
      if (selectedDamageId) {
        return prev.map((damage) =>
          damage.id === selectedDamageId ? { ...damage, ...patch } : damage,
        );
      }
      return [...prev, { id: newLocalDamageId(), ...patch, chargeGbp: null, chargeResolution: null }];
    });
    setError(null);
    clearDamageSelection();
  }

  function removeDamage(damageId?: string) {
    const id = damageId ?? selectedDamageId;
    if (!id) return;
    const damage = draftDamages.find((item) => item.id === id);
    if (damage && isPreExistingCheckinDamage(damage)) return;
    setDraftDamages((prev) => prev.filter((damage) => damage.id !== id));
    if (selectedDamageId === id) clearDamageSelection();
    setError(null);
  }

  function onUploadPhotos(files: FileList | null) {
    if (!files?.length || readOnly) return;
    const { items, error: uploadError } = createDraftMediaFromFiles(Array.from(files));
    if (uploadError) {
      setError(uploadError);
      return;
    }
    setDraftMedia((prev) => [
      ...prev,
      ...items.map((item, index) => ({ ...item, sortOrder: prev.length + index })),
    ]);
    setError(null);
  }

  function removePhoto(mediaId: string) {
    setDraftMedia((prev) => {
      const target = prev.find((item) => item.id === mediaId);
      if (target) revokeDraftMediaUrls([target]);
      return prev.filter((item) => item.id !== mediaId);
    });
    setError(null);
  }

  function setAccessory(key: HireInspectionAccessoryKey, value: boolean | null) {
    setAccessories((prev) => ({ ...prev, [key]: value }));
  }

  function setDamageCharge(
    damageId: string,
    patch: { chargeGbp: number | null; chargeResolution: HireInspectionDamageChargeResolution | null },
  ) {
    setDraftDamages((prev) =>
      prev.map((damage) =>
        damage.id === damageId
          ? {
              ...damage,
              chargeGbp:
                patch.chargeGbp != null && Number.isFinite(patch.chargeGbp) && patch.chargeGbp > 0
                  ? Math.round(patch.chargeGbp * 100) / 100
                  : null,
              chargeResolution: patch.chargeResolution,
            }
          : damage,
      ),
    );
  }

  function completeInspection() {
    startSaving(async () => {
      if (draftMedia.length < 1) {
        setError("Add at least one vehicle photo before completing.");
        return;
      }
      const saved = await persistDraft();
      if (!saved) return;
      const res =
        kind === "checkout"
          ? await completeHireCheckoutAction(hireGroupId)
          : await completeHireCheckinAction(hireGroupId, {
              damagePaymentMethod,
              damagePaymentAccountId,
              damagePaymentReference,
            });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      workspaceCache?.invalidateCache(hireWorkspaceKeysInvalidatedByInspectionChange());
      router.push(
        audience === "driver"
          ? `/driver/hires/${hireGroupId}`
          : `/rental/hires/${hireGroupId}`,
      );
      router.refresh();
    });
  }

  if (loading && !data) {
    return <HireInspectionWizardLoader label="Loading inspection…" />;
  }

  if (!data) return error ? <p className="rph-alert-error text-sm">{error}</p> : null;

  const selectedDraftDamage = selectedDamageId
    ? draftDamages.find((damage) => damage.id === selectedDamageId)
    : null;
  const showDamageForm =
    Boolean(selectedPanelId) &&
    (!selectedDraftDamage || !isPreExistingCheckinDamage(selectedDraftDamage));

  const damageFormProps = {
    selectedPanelId,
    selectedDamageId,
    damageType,
    severity,
    damageNotes,
    linkPreExisting,
    pending: saving,
    kind,
    hasCheckoutBaseline: Boolean(checkoutBaseline?.damages.length),
    onDamageTypeChange: setDamageType,
    onSeverityChange: setSeverity,
    onDamageNotesChange: setDamageNotes,
    onLinkPreExistingChange: setLinkPreExisting,
    onSave: saveDamage,
    onRemove: () => removeDamage(),
  };

  const damageForm = !readOnly && showDamageForm ? (
    <HireInspectionDamageForm {...damageFormProps} showPanelPrompt={diagramExpanded} />
  ) : null;

  const checkoutAllowed =
    kind === "checkout" &&
    isCheckoutDue({
      status: hireStatus,
      checkoutCompleted: data.checkoutCompleted,
    });
  const wrongStatus =
    (kind === "checkout" && !checkoutAllowed && !readOnly) ||
    (kind === "checkin" && hireStatus !== "terminated" && !readOnly);

  return (
    <div className="space-y-4">
      {!embedded ? (
        <div>
          <h1 className="rph-h1">{title}</h1>
          <p className="rph-muted mt-1 text-sm">
            {vehicleLabel}
            {readOnly ? " · Completed" : ""}
          </p>
        </div>
      ) : null}

      {wrongStatus ? (
        <p className="rph-alert-error text-sm">
          {kind === "checkout"
            ? "Checkout is not available for this hire, or it has already been completed."
            : "Check-in is only available after the contract has ended."}
        </p>
      ) : null}

      {kind === "checkin" && !data.checkoutCompleted && !readOnly ? (
        <p className="rph-alert-error text-sm">Complete checkout before starting check-in.</p>
      ) : null}

      {readOnly ? (
        <HireInspectionCompletedView
          hireGroupId={hireGroupId}
          vehicleLabel={vehicleLabel}
          kind={kind}
          data={data}
          diagramDamages={diagramDamages}
          odometer={odometer}
          fuelLevel={fuelLevel}
          accessories={accessories}
          generalNotes={generalNotes}
          trackerLinked={trackerLinked}
          completedByLabel={
            audience === "driver" ? "Rental company" : data.completedByLabel?.trim() || "Company staff"
          }
          checkinCompleted={data.checkinCompleted}
        />
      ) : (
        <div className="relative">
          {saving ? <HireInspectionWizardBusyOverlay label="Saving inspection…" /> : null}
          {loading ? <HireInspectionWizardBusyOverlay label="Refreshing inspection…" /> : null}

          <FormModalStepProgress step={step - 1} labels={STEP_LABELS} />

          {error ? <p className="rph-alert-error text-sm">{error}</p> : null}

          {step === 1 ? (
            <section className="rph-card space-y-3 p-4">
              <h2 className="text-sm font-semibold text-rph-fg">Vehicle readings</h2>
              <HireInspectionReadingsSection
                kind={kind}
                odometer={odometer}
                onOdometerChange={setOdometer}
                fuelLevel={fuelLevel}
                onFuelLevelChange={setFuelLevel}
                accessories={accessories}
                onAccessoryChange={setAccessory}
                trackerOdometerMiles={trackerOdometerMiles}
                trackerLinked={trackerLinked}
                trackerLoading={trackerLoading}
                trackerLiveUnavailable={trackerLiveUnavailable}
                trackerError={trackerError}
              />
            </section>
          ) : null}

          {step === 2 ? (
            <section className="rph-card grid gap-4 p-4 lg:grid-cols-2">
              <div>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-rph-fg">Damage diagram</h2>
                    <p className="rph-muted mt-1 text-xs">
                      {kind === "checkin"
                        ? "Checkout damage is shown for reference. Click a panel to add any new damage."
                        : "Damage is kept on this device until you save draft or complete checkout."}
                    </p>
                  </div>
                </div>
                <VehicleDamageDiagram
                  damages={diagramDamages}
                  mode={kind === "checkin" ? "checkin" : "edit"}
                  selectedPanelId={selectedPanelId}
                  selectedDamageId={selectedDamageId}
                  fullscreenAside={damageForm}
                  onExpandedChange={setDiagramExpanded}
                  onPanelSelect={onPanelSelect}
                  onDamageSelect={onDamageSelect}
                  onDamageRemove={removeDamage}
                  canRemoveDamage={canEditCheckinDamage}
                  canSelectDamage={canEditCheckinDamage}
                />
              </div>
              {!diagramExpanded && showDamageForm ? (
                <div className="space-y-3 border-t border-rph-border pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
                  <HireInspectionDamageForm {...damageFormProps} showPanelPrompt={false} />
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 3 ? (
            <section className="rph-card p-4">
              <HireInspectionPhotosSection
                hireGroupId={hireGroupId}
                draftMedia={draftMedia}
                onAddPhotos={onUploadPhotos}
                onRemovePhoto={removePhoto}
                disabled={saving || loading}
              />
            </section>
          ) : null}

          {step === 4 ? (
            <section className="rph-card p-4">
              <HireInspectionReviewSection
                kind={kind}
                odometer={odometer}
                fuelLevel={fuelLevel}
                accessories={accessories}
                draftMediaCount={draftMedia.length}
                draftDamages={draftDamages}
                checkoutBaseline={checkoutBaseline}
                generalNotes={generalNotes}
                onGeneralNotesChange={setGeneralNotes}
                onDamageChargeChange={setDamageCharge}
                paymentAccounts={paymentAccounts}
                damagePaymentMethod={damagePaymentMethod}
                damagePaymentAccountId={damagePaymentAccountId}
                damagePaymentReference={damagePaymentReference}
                onDamagePaymentMethodChange={setDamagePaymentMethod}
                onDamagePaymentAccountChange={setDamagePaymentAccountId}
                onDamagePaymentReferenceChange={setDamagePaymentReference}
              />
            </section>
          ) : null}
        </div>
      )}

      {readOnly && error ? <p className="rph-alert-error text-sm">{error}</p> : null}

      {!readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="rph-btn-ghost text-sm"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || saving || loading}
          >
            Back
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rph-btn-ghost text-sm"
              onClick={saveDraft}
              disabled={saving || loading}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            {step < 4 ? (
              <button
                type="button"
                className="rph-btn-primary text-sm"
                onClick={() => setStep((s) => Math.min(4, s + 1))}
                disabled={saving || loading}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                className="rph-btn-primary text-sm"
                onClick={completeInspection}
                disabled={
                  saving ||
                  loading ||
                  wrongStatus ||
                  (kind === "checkin" && !data.checkoutCompleted)
                }
              >
                {saving ? "Saving…" : completeLabel}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
