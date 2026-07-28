"use client";

import {
  HIRE_INSPECTION_DIAGRAM_BACKGROUND,
  HIRE_INSPECTION_DIAGRAM_VIEWBOX,
  HIRE_INSPECTION_PANELS,
  getHireInspectionHitPin,
  type HireInspectionDiagramHit,
  type HireInspectionDiagramViewId,
} from "@/lib/fleet/hire-inspection-diagram";
import { HIRE_INSPECTION_DIAGRAM_ARTWORK_STYLES } from "@/lib/fleet/hire-inspection-diagram-artwork-styles";
import {
  hireDamageSeverityPinClass,
  type HireDamageSeverity,
} from "@/lib/fleet/vehicle-damage-panels";
import { useEffect, useState } from "react";

export type HireInspectionDamagePin = {
  id: string;
  x: number;
  y: number;
  listIndex: number;
  severity: HireDamageSeverity;
  selected: boolean;
  preExisting: boolean;
  ariaLabel: string;
};

export type HireInspectionDiagramCanvasProps = {
  interactive: boolean;
  damagedHits: ReadonlyMap<string, HireDamageSeverity>;
  selectedPanelId?: string | null;
  selectedPanelView?: HireInspectionDiagramViewId | null;
  damagePins?: readonly HireInspectionDamagePin[];
  onHitActivate?: (
    panelId: string,
    viewId: HireInspectionDiagramViewId,
    pin: { pinX: number; pinY: number },
  ) => void;
  onDamagePinSelect?: (damageId: string) => void;
};

function hitKey(panelId: string, viewId: string, index: number): string {
  return `${panelId}:${viewId}:${index}`;
}

function damageKey(panelId: string, viewId: string): string {
  return `${panelId}:${viewId}`;
}

function hitClassName(damageSeverity: HireDamageSeverity | null, selected: boolean): string {
  if (selected) return "hit selected";
  if (!damageSeverity) return "hit";
  return `hit damaged-${damageSeverity}`;
}

function renderHitShape(
  hit: HireInspectionDiagramHit,
  className: string,
  interactive: boolean,
  onClick?: () => void,
) {
  const common = {
    className,
    style: interactive ? undefined : { pointerEvents: "none" as const },
    onClick: interactive ? onClick : undefined,
  };

  if (hit.shape === "path") {
    return <path {...common} d={hit.d} />;
  }
  if (hit.shape === "rect") {
    return (
      <rect
        {...common}
        x={hit.x}
        y={hit.y}
        width={hit.width}
        height={hit.height}
        rx={hit.rx ?? 0}
      />
    );
  }
  return <ellipse {...common} cx={hit.cx} cy={hit.cy} rx={hit.rx} ry={hit.ry} />;
}

export function HireInspectionDiagramCanvas({
  interactive,
  damagedHits,
  selectedPanelId = null,
  selectedPanelView = null,
  damagePins = [],
  onHitActivate,
  onDamagePinSelect,
}: HireInspectionDiagramCanvasProps) {
  const [artworkMarkup, setArtworkMarkup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(HIRE_INSPECTION_DIAGRAM_BACKGROUND)
      .then((response) => {
        if (!response.ok) throw new Error("Diagram artwork failed to load");
        return response.text();
      })
      .then((svgText) => {
        if (cancelled) return;
        const inner = svgText
          .replace(/^[\s\S]*?<svg[^>]*>/i, "")
          .replace(/<\/svg>[\s\S]*$/i, "")
          .trim();
        setArtworkMarkup(inner);
      })
      .catch(() => {
        if (!cancelled) setArtworkMarkup(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <svg
      viewBox={HIRE_INSPECTION_DIAGRAM_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      className="size-full"
      role="img"
      aria-label="Vehicle damage diagram"
    >
      <defs>
        <style>{`
          ${HIRE_INSPECTION_DIAGRAM_ARTWORK_STYLES}
          .diagram-canvas { fill: #faf7f7; }
          .hit {
            fill: transparent;
            stroke: transparent;
            stroke-width: 0;
            pointer-events: all;
            cursor: pointer;
            transition: fill .12s ease;
          }
          .hit:hover {
            fill: rgba(148, 163, 184, 0.22);
          }
          .hit.selected {
            fill: rgba(59, 130, 246, 0.44);
            stroke: transparent;
            stroke-width: 0;
          }
          .hit.selected:hover {
            fill: rgba(59, 130, 246, 0.5);
          }
          .hit.damaged-minor {
            fill: rgba(245, 158, 11, 0.38);
          }
          .hit.damaged-moderate {
            fill: rgba(249, 115, 22, 0.42);
          }
          .hit.damaged-major {
            fill: rgba(239, 68, 68, 0.44);
          }
          .hit.damaged-minor:hover {
            fill: rgba(245, 158, 11, 0.48);
          }
          .hit.damaged-moderate:hover {
            fill: rgba(249, 115, 22, 0.52);
          }
          .hit.damaged-major:hover {
            fill: rgba(239, 68, 68, 0.54);
          }
        `}</style>
      </defs>

      <rect className="diagram-canvas" width="1920" height="1080" />

      {artworkMarkup ? (
        <g
          className="hire-diagram-artwork pointer-events-none"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: artworkMarkup }}
        />
      ) : (
        <rect
          className="animate-pulse"
          x="0"
          y="0"
          width="1920"
          height="1080"
          fill="#f1f5f9"
          aria-hidden
        />
      )}

      {HIRE_INSPECTION_PANELS.map((panel) => (
        <g key={panel.id} data-panel={panel.id} data-label={panel.label}>
          {panel.hits.map((hit, index) => {
            const key = hitKey(panel.id, hit.view, index);
            const severity = damagedHits.get(damageKey(panel.id, hit.view)) ?? null;
            const selected =
              selectedPanelId === panel.id && selectedPanelView === hit.view;
            const className = hitClassName(severity, selected);

            if (!interactive) {
              return <g key={key}>{renderHitShape(hit, className, false)}</g>;
            }

            return (
              <g key={key} aria-hidden>
                {renderHitShape(hit, className, true, () => {
                  const pin = getHireInspectionHitPin(hit);
                  onHitActivate?.(panel.id, hit.view, pin);
                })}
              </g>
            );
          })}
        </g>
      ))}

      {damagePins.map((pin) => {
        const pinClass = pin.preExisting
          ? "fill-rph-fg-muted stroke-rph-border-strong"
          : hireDamageSeverityPinClass(pin.severity);
        const radius = pin.selected ? 16 : 13;
        return (
          <g
            key={pin.id}
            className={onDamagePinSelect ? "cursor-pointer" : ""}
            onClick={onDamagePinSelect ? () => onDamagePinSelect(pin.id) : undefined}
            role={onDamagePinSelect ? "button" : undefined}
            aria-label={pin.ariaLabel}
          >
            <circle cx={pin.x} cy={pin.y} r={radius} className={`${pinClass} stroke-2`} />
            <text
              x={pin.x}
              y={pin.y + 5}
              textAnchor="middle"
              className="fill-white pointer-events-none font-bold"
              style={{ fontSize: 11 }}
            >
              {pin.listIndex + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
