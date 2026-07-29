import { readFile } from "node:fs/promises";
import path from "node:path";
import type { HireInspectionDiagramViewId } from "@/lib/fleet/hire-inspection-diagram";
import { getPanelPinPosition, panelPinOffset, type HireDamageSeverity } from "@/lib/fleet/vehicle-damage-panels";

export type HireInspectionDiagramPin = {
  panelId: string;
  diagramView?: HireInspectionDiagramViewId | null;
  pinX?: number | null;
  pinY?: number | null;
  severity: HireDamageSeverity;
  listIndex: number;
};

const SEVERITY_FILL: Record<HireDamageSeverity, string> = {
  minor: "#f59e0b",
  moderate: "#f97316",
  major: "#ef4444",
};

const SEVERITY_STROKE: Record<HireDamageSeverity, string> = {
  minor: "#b45309",
  moderate: "#c2410c",
  major: "#b91c1c",
};

function resolvePinPosition(pin: HireInspectionDiagramPin): { x: number; y: number } | null {
  if (pin.pinX != null && pin.pinY != null) {
    return { x: pin.pinX, y: pin.pinY };
  }
  const fallback = getPanelPinPosition(pin.panelId, pin.diagramView ?? null);
  if (!fallback) return null;
  return { x: fallback.pinX, y: fallback.pinY };
}

/** Build SVG overlay markup for numbered damage pins on the diagram artwork. */
export function buildHireInspectionDiagramPinMarkup(pins: HireInspectionDiagramPin[]): string {
  const panelCounts = new Map<string, number>();
  return pins
    .map((pin) => {
      const pos = resolvePinPosition(pin);
      if (!pos) return "";
      const indexOnPanel = panelCounts.get(pin.panelId) ?? 0;
      panelCounts.set(pin.panelId, indexOnPanel + 1);
      const offset = panelPinOffset(indexOnPanel);
      const x = pos.x + offset.dx;
      const y = pos.y + offset.dy;
      const fill = SEVERITY_FILL[pin.severity];
      const stroke = SEVERITY_STROKE[pin.severity];
      const label = String(pin.listIndex + 1);
      return `<g><circle cx="${x}" cy="${y}" r="16" fill="${fill}" stroke="${stroke}" stroke-width="3" /><text x="${x}" y="${y + 5}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff">${label}</text></g>`;
    })
    .join("");
}

export async function renderHireInspectionDiagramPng(
  pins: HireInspectionDiagramPin[],
): Promise<Buffer | null> {
  const artworkPath = path.join(
    process.cwd(),
    "public/assets/hire-inspection-diagrams/hire-inspection-diagram.svg",
  );
  let svg = await readFile(artworkPath, "utf8");
  const pinMarkup = buildHireInspectionDiagramPinMarkup(pins);
  if (pinMarkup) {
    svg = svg.replace("</svg>", `${pinMarkup}</svg>`);
  }

  try {
    const sharp = (await import("sharp")).default;
    return await sharp(Buffer.from(svg)).png().toBuffer();
  } catch {
    return null;
  }
}
