/** Keep in sync with apps/web/src/lib/fleet/hire-inspection-diagram-views.ts */

export function diagramViewFromPoint(x, y) {
  if (x >= 1450 && y < 220) return "spare";
  if (y < 220 && x >= 700) return "left_side";
  if (y > 780) return "right_side";
  if (x < 450 && y >= 220 && y <= 800) return "front";
  if (x > 1550 && y >= 220 && y <= 800) return "rear";
  return "top";
}
