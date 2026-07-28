"use client";

import { HireInspectionDiagramCanvas } from "@/components/fleet/hire-inspection/hire-inspection-diagram-canvas";
import {
  getVehicleDamagePanel,
  getPanelPinPosition,
  hireDamageSeverityLabel,
  hireDamageTypeLabel,
  panelPinOffset,
  type HireDamageSeverity,
  type HireDamageType,
} from "@/lib/fleet/vehicle-damage-panels";
import {
  resolveHireInspectionPanelHighlightView,
  type HireInspectionDiagramViewId,
} from "@/lib/fleet/hire-inspection-diagram";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

export type VehicleDamageDiagramEntry = {
  id: string;
  panelId: string;
  damageType: HireDamageType;
  severity: HireDamageSeverity;
  notes?: string | null;
  diffStatus?: "new" | "pre_existing";
  diagramView?: HireInspectionDiagramViewId | null;
  pinX?: number | null;
  pinY?: number | null;
};

type VehicleDamageDiagramProps = {
  damages: VehicleDamageDiagramEntry[];
  selectedDamageId?: string | null;
  selectedPanelId?: string | null;
  mode?: "edit" | "readonly" | "diff" | "checkin";
  allowExpand?: boolean;
  fullscreenAside?: ReactNode;
  onExpandedChange?: (expanded: boolean) => void;
  canRemoveDamage?: (damage: VehicleDamageDiagramEntry) => boolean;
  canSelectDamage?: (damage: VehicleDamageDiagramEntry) => boolean;
  onPanelSelect?: (
    panelId: string,
    context: { diagramView: HireInspectionDiagramViewId; pinX: number; pinY: number },
  ) => void;
  onDamageSelect?: (damageId: string) => void;
  onDamageRemove?: (damageId: string) => void;
};

const DIAGRAM_ASPECT_RATIO = 1920 / 1080;

const SEVERITY_RANK: Record<HireDamageSeverity, number> = {
  minor: 1,
  moderate: 2,
  major: 3,
};

function IconExpand({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function IconCollapse({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function damageKey(panelId: string, viewId: string): string {
  return `${panelId}:${viewId}`;
}

function DamageListContent({
  damage,
  index,
  panelLabel,
}: {
  damage: VehicleDamageDiagramEntry;
  index: number;
  panelLabel: string;
}) {
  return (
    <>
      <span className="font-semibold text-rph-fg">
        #{index + 1} {panelLabel}
      </span>
      <span className="rph-muted mt-0.5 block text-xs">
        {hireDamageTypeLabel(damage.damageType)} · {hireDamageSeverityLabel(damage.severity)}
        {damage.diffStatus === "new" ? " · New" : null}
        {damage.diffStatus === "pre_existing" ? " · Pre-existing (read-only)" : null}
      </span>
      {damage.notes?.trim() ? (
        <span className="rph-muted mt-0.5 block text-xs">{damage.notes.trim()}</span>
      ) : null}
    </>
  );
}

function resolveDamageDiagramView(
  damage: VehicleDamageDiagramEntry,
  clickedViewByPanel: Record<string, string>,
): HireInspectionDiagramViewId | "" {
  return (
    damage.diagramView ??
    (clickedViewByPanel[damage.panelId] as HireInspectionDiagramViewId | undefined) ??
    resolveHireInspectionPanelHighlightView(damage.panelId) ??
    ""
  );
}

function resolveDamagePin(
  damage: VehicleDamageDiagramEntry,
  viewId: string,
  clickedPinByPanel: Record<string, { pinX: number; pinY: number }>,
): { pinX: number; pinY: number } | null {
  if (damage.pinX != null && damage.pinY != null) {
    return { pinX: damage.pinX, pinY: damage.pinY };
  }
  const clickedPin = clickedPinByPanel[damage.panelId];
  if (clickedPin) return clickedPin;
  return getPanelPinPosition(damage.panelId, viewId);
}

export function VehicleDamageDiagram({
  damages,
  selectedDamageId,
  selectedPanelId,
  mode = "edit",
  allowExpand = true,
  fullscreenAside,
  onExpandedChange,
  onPanelSelect,
  onDamageSelect,
  onDamageRemove,
  canRemoveDamage,
  canSelectDamage,
}: VehicleDamageDiagramProps) {
  const [expanded, setExpanded] = useState(false);
  const [clickedViewByPanel, setClickedViewByPanel] = useState<Record<string, string>>({});
  const [clickedPinByPanel, setClickedPinByPanel] = useState<
    Record<string, { pinX: number; pinY: number }>
  >({});
  const interactive = (mode === "edit" || mode === "checkin") && Boolean(onPanelSelect);

  const damagedHits = useMemo(() => {
    const hits = new Map<string, HireDamageSeverity>();
    for (const damage of damages) {
      const viewId = resolveDamageDiagramView(damage, clickedViewByPanel);
      if (!viewId) continue;
      const key = damageKey(damage.panelId, viewId);
      const existing = hits.get(key);
      if (!existing || SEVERITY_RANK[damage.severity] > SEVERITY_RANK[existing]) {
        hits.set(key, damage.severity);
      }
    }
    return hits;
  }, [clickedViewByPanel, damages]);

  const activateHit = useCallback(
    (panelId: string, viewId: HireInspectionDiagramViewId, pin: { pinX: number; pinY: number }) => {
      setClickedViewByPanel((current) => ({ ...current, [panelId]: viewId }));
      setClickedPinByPanel((current) => ({ ...current, [panelId]: pin }));
      onPanelSelect?.(panelId, { diagramView: viewId, pinX: pin.pinX, pinY: pin.pinY });
    },
    [onPanelSelect],
  );

  const setExpandedState = useCallback(
    (next: boolean) => {
      setExpanded(next);
      onExpandedChange?.(next);
    },
    [onExpandedChange],
  );

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedState(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded, setExpandedState]);

  const selectedPanelView = useMemo((): HireInspectionDiagramViewId | null => {
    if (!selectedPanelId) return null;
    const clicked = clickedViewByPanel[selectedPanelId];
    return resolveHireInspectionPanelHighlightView(selectedPanelId, clicked);
  }, [clickedViewByPanel, selectedPanelId]);

  const pins = useMemo(() => {
    const panelDamageIndex = new Map<string, number>();
    const items: {
      id: string;
      x: number;
      y: number;
      listIndex: number;
      severity: HireDamageSeverity;
      selected: boolean;
      preExisting: boolean;
      ariaLabel: string;
    }[] = [];

    damages.forEach((damage, listIndex) => {
      const viewId = resolveDamageDiagramView(damage, clickedViewByPanel);
      const pinPos = resolveDamagePin(damage, viewId, clickedPinByPanel);
      if (!pinPos) return;
      const indexOnPanel = panelDamageIndex.get(damage.panelId) ?? 0;
      panelDamageIndex.set(damage.panelId, indexOnPanel + 1);
      const offset = panelPinOffset(indexOnPanel);
      items.push({
        id: damage.id,
        x: pinPos.pinX + offset.dx,
        y: pinPos.pinY + offset.dy,
        listIndex,
        severity: damage.severity,
        selected: selectedDamageId === damage.id,
        preExisting: damage.diffStatus === "pre_existing",
        ariaLabel: `Damage ${listIndex + 1}: ${getVehicleDamagePanel(damage.panelId)?.label ?? damage.panelId}`,
      });
    });

    return items;
  }, [clickedPinByPanel, clickedViewByPanel, damages, selectedDamageId]);

  const expandButton = allowExpand ? (
    <button
      type="button"
      className="rph-btn-ghost inline-flex items-center gap-1.5 px-2 py-1 text-xs"
      onClick={() => setExpandedState(!expanded)}
      aria-pressed={expanded}
    >
      {expanded ? <IconCollapse /> : <IconExpand />}
      {expanded ? "Exit full screen" : "Full screen"}
    </button>
  ) : null;

  const diagramCanvas = (
    <div
      className={
        expanded
          ? "flex min-h-0 w-full flex-1 items-center justify-center"
          : "w-full"
      }
    >
      <div
        className={`relative ${
          expanded
            ? "h-full max-h-full w-auto max-w-full"
            : "w-full overflow-hidden rounded-lg"
        }`}
        style={{ aspectRatio: String(DIAGRAM_ASPECT_RATIO) }}
      >
        <HireInspectionDiagramCanvas
          interactive={interactive}
          damagedHits={damagedHits}
          selectedPanelId={selectedPanelId}
          selectedPanelView={selectedPanelView}
          damagePins={pins}
          onHitActivate={interactive ? activateHit : undefined}
          onDamagePinSelect={(damageId) => {
            const damage = damages.find((item) => item.id === damageId);
            if (!damage || (canSelectDamage && !canSelectDamage(damage))) return;
            onDamageSelect?.(damageId);
          }}
        />
      </div>
    </div>
  );

  const legend = (
    <div className={`flex flex-wrap gap-3 text-xs text-rph-fg-secondary ${expanded ? "shrink-0" : ""}`}>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
        Minor
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500" />
        Moderate
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
        Major
      </span>
      {mode === "diff" || mode === "checkin" ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-rph-fg-muted" />
          Pre-existing
        </span>
      ) : null}
    </div>
  );

  const damageList = damages.length > 0 ? (
    <ul className={`space-y-1.5 ${expanded ? "min-h-0 flex-1 overflow-y-auto" : ""}`}>
      {damages.map((damage, index) => {
        const panel = getVehicleDamagePanel(damage.panelId);
        const selected = selectedDamageId === damage.id;
        const removable = Boolean(onDamageRemove) && (canRemoveDamage?.(damage) ?? true);
        const selectable = canSelectDamage?.(damage) ?? true;
        return (
          <li key={damage.id}>
            <div
              className={`flex items-stretch gap-1 rounded-lg border transition-colors ${
                selected
                  ? "border-rph-rail bg-rph-rail/10"
                  : "border-rph-border bg-rph-chrome"
              } ${!selectable ? "opacity-80" : ""}`}
            >
              {selectable ? (
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm hover:bg-rph-raised"
                  onClick={() => onDamageSelect?.(damage.id)}
                >
                  <DamageListContent
                    damage={damage}
                    index={index}
                    panelLabel={panel?.label ?? damage.panelId}
                  />
                </button>
              ) : (
                <div className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm">
                  <DamageListContent
                    damage={damage}
                    index={index}
                    panelLabel={panel?.label ?? damage.panelId}
                  />
                </div>
              )}
              {removable ? (
                <button
                  type="button"
                  className="shrink-0 rounded-r-lg px-2.5 text-rph-fg-muted transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                  aria-label={`Remove damage on ${panel?.label ?? damage.panelId}`}
                  title="Remove damage"
                  onClick={() => onDamageRemove?.(damage.id)}
                >
                  <IconTrash />
                </button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  ) : (
    <p className="rph-muted text-sm">
      {mode === "checkin"
        ? "No new damage marked. Click a panel on the diagram to add damage."
        : "No damage marked. Click a panel on the diagram to add damage."}
    </p>
  );

  if (expanded) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-rph-page p-4 sm:p-6">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-rph-fg">Damage diagram</h2>
          {expandButton}
        </div>
        <div
          className={`grid min-h-0 flex-1 gap-4 ${
            fullscreenAside ? "lg:grid-cols-[minmax(0,1fr)_min(20rem,34%)]" : ""
          }`}
        >
          <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-rph-border bg-rph-raised p-3">
              <div className="flex min-h-0 flex-1 items-stretch">{diagramCanvas}</div>
              <p className="rph-muted mt-2 shrink-0 text-center text-xs">
                {mode === "checkin"
                  ? "Pre-existing checkout damage is read-only · click a panel to add new damage · Press Esc to exit full screen"
                  : "Click a panel on any view to mark damage · Press Esc to exit full screen"}
              </p>
            </div>
            {legend}
            {damageList}
          </div>
          {fullscreenAside ? (
            <aside className="min-h-0 overflow-y-auto rounded-xl border border-rph-border bg-rph-raised p-4">
              {fullscreenAside}
            </aside>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-rph-border bg-rph-raised p-3">
        {allowExpand ? <div className="mb-2 flex justify-end">{expandButton}</div> : null}
        {diagramCanvas}
        <p className="rph-muted mt-2 text-center text-xs">
          {mode === "checkin"
            ? "Pre-existing checkout damage is read-only · click a panel to add new damage"
            : "Click a panel on any view to mark damage"}
        </p>
      </div>
      {legend}
      {damageList}
    </div>
  );
}
