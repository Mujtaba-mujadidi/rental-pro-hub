import catalog from "@/lib/fleet/hire-inspection-diagram.catalog.json";
import { svgBBoxCenter, svgPathBBox } from "@/lib/fleet/svg-path-bbox";

export const HIRE_INSPECTION_DIAGRAM_VIEWBOX = catalog.viewBox;
export const HIRE_INSPECTION_DIAGRAM_BACKGROUND =
  catalog.artwork.backgroundImage ?? "/assets/hire-inspection-diagrams/hire-inspection-diagram.png";

export type HireInspectionDiagramViewId = (typeof catalog.views)[number]["id"];

export type HireInspectionDiagramHit =
  | { view: HireInspectionDiagramViewId; shape: "path"; d: string }
  | {
      view: HireInspectionDiagramViewId;
      shape: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
    }
  | {
      view: HireInspectionDiagramViewId;
      shape: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
    };

export type HireInspectionPanel = {
  id: string;
  label: string;
  category: string;
  pins: Partial<Record<HireInspectionDiagramViewId, readonly [number, number]>>;
  hits: readonly HireInspectionDiagramHit[];
};

export const HIRE_INSPECTION_PANELS: readonly HireInspectionPanel[] = catalog.panels.map((panel) => ({
  id: panel.id,
  label: panel.label,
  category: panel.category,
  pins: panel.pins,
  hits: (panel.hits ?? []) as HireInspectionDiagramHit[],
}));

const PANEL_BY_ID = new Map(HIRE_INSPECTION_PANELS.map((panel) => [panel.id, panel]));

type BBox = { minX: number; minY: number; maxX: number; maxY: number };

function emptyBBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function unionBBox(hits: readonly HireInspectionDiagramHit[]): BBox {
  const bbox = emptyBBox();
  for (const hit of hits) {
    const box = hitBBox(hit);
    if (box.minX < bbox.minX) bbox.minX = box.minX;
    if (box.minY < bbox.minY) bbox.minY = box.minY;
    if (box.maxX > bbox.maxX) bbox.maxX = box.maxX;
    if (box.maxY > bbox.maxY) bbox.maxY = box.maxY;
  }
  return bbox;
}

function hitBBox(hit: HireInspectionDiagramHit): BBox {
  if (hit.shape === "path") return svgPathBBox(hit.d);
  if (hit.shape === "rect") {
    return { minX: hit.x, minY: hit.y, maxX: hit.x + hit.width, maxY: hit.y + hit.height };
  }
  return {
    minX: hit.cx - hit.rx,
    minY: hit.cy - hit.ry,
    maxX: hit.cx + hit.rx,
    maxY: hit.cy + hit.ry,
  };
}

/** Pin at the visual centre of all highlight shapes for a panel view. */
function pinFromHits(hits: readonly HireInspectionDiagramHit[]): { pinX: number; pinY: number } {
  if (hits.length === 0) return { pinX: 0, pinY: 0 };
  if (hits.length === 1) return getHireInspectionHitPin(hits[0]!);
  const center = svgBBoxCenter(unionBBox(hits));
  return { pinX: center.x, pinY: center.y };
}

/** Centroid of a single hit shape (where the user clicked). */
export function getHireInspectionHitPin(hit: HireInspectionDiagramHit): { pinX: number; pinY: number } {
  const center = svgBBoxCenter(hitBBox(hit));
  return { pinX: center.x, pinY: center.y };
}

const PANEL_VIEW_PRIORITY: readonly HireInspectionDiagramViewId[] = [
  "top",
  "left_side",
  "right_side",
  "front",
  "rear",
  "spare",
];

/** Prefer a view that has hit shapes, then the panel category. */
export function primaryHireInspectionPanelView(
  panel: HireInspectionPanel,
): HireInspectionDiagramViewId | null {
  const category = panel.category as HireInspectionDiagramViewId;
  if (panel.hits.some((hit) => hit.view === category)) {
    return category;
  }
  for (const view of PANEL_VIEW_PRIORITY) {
    if (panel.hits.some((hit) => hit.view === view)) return view;
  }
  for (const view of PANEL_VIEW_PRIORITY) {
    if (panel.pins[view]) return view;
  }
  const first = Object.keys(panel.pins)[0] as HireInspectionDiagramViewId | undefined;
  return first ?? null;
}

/** Pin for a panel, optionally on the view the user clicked. */
export function getHireInspectionPanelPin(
  panelId: string,
  viewId?: string | null,
): { pinX: number; pinY: number } | null {
  const panel = getHireInspectionPanel(panelId);
  if (!panel) return null;

  const resolvedView = resolveHireInspectionPanelHighlightView(panelId, viewId);
  if (resolvedView) {
    const viewHits = panel.hits.filter((hit) => hit.view === resolvedView);
    if (viewHits.length > 0) {
      return pinFromHits(viewHits);
    }
    const pin = panel.pins[resolvedView];
    if (pin) return { pinX: pin[0], pinY: pin[1] };
  }

  return primaryHireInspectionPanelPin(panel);
}

/** Prefer the plan view pin for stacked damage markers. */
export function primaryHireInspectionPanelPin(panel: HireInspectionPanel): { pinX: number; pinY: number } {
  const view = primaryHireInspectionPanelView(panel);
  if (view) {
    const viewHits = panel.hits.filter((hit) => hit.view === view);
    if (viewHits.length > 0) {
      return pinFromHits(viewHits);
    }
    const pin = panel.pins[view];
    if (pin) return { pinX: pin[0], pinY: pin[1] };
  }
  const first = Object.values(panel.pins)[0];
  if (!first) return { pinX: 0, pinY: 0 };
  return { pinX: first[0], pinY: first[1] };
}

export function resolveHireInspectionPanelHighlightView(
  panelId: string,
  clickedViewId?: string | null,
): HireInspectionDiagramViewId | null {
  const panel = getHireInspectionPanel(panelId);
  if (!panel) return null;
  if (clickedViewId) {
    const view = clickedViewId as HireInspectionDiagramViewId;
    if (panel.pins[view] || panel.hits.some((hit) => hit.view === view)) {
      return view;
    }
  }
  return primaryHireInspectionPanelView(panel);
}

export function getHireInspectionPanel(panelId: string): HireInspectionPanel | null {
  return PANEL_BY_ID.get(panelId) ?? null;
}

export function isValidHireInspectionPanelId(panelId: string): boolean {
  return PANEL_BY_ID.has(panelId);
}
