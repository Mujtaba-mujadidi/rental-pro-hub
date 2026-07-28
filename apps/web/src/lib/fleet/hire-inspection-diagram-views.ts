export type HireInspectionDiagramViewId =
  | "left_side"
  | "front"
  | "right_side"
  | "spare"
  | "rear"
  | "top";

/**
 * Map a point on the composite 1920×1080 diagram to the diagram view it belongs to.
 * The purchased asset draws every elevation/plan at once; each panel can have hits in
 * several regions that must not share a single view id.
 */
export function diagramViewFromPoint(
  x: number,
  y: number,
): HireInspectionDiagramViewId {
  if (x >= 1450 && y < 220) return "spare";
  if (y < 220 && x >= 700) return "left_side";
  if (y > 780) return "right_side";
  if (x < 450 && y >= 220 && y <= 800) return "front";
  if (x > 1550 && y >= 220 && y <= 800) return "rear";
  return "top";
}
