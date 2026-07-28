export type SvgBBox = { minX: number; minY: number; maxX: number; maxY: number };

function emptyBBox(): SvgBBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function extendBBox(bbox: SvgBBox, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  if (x < bbox.minX) bbox.minX = x;
  if (y < bbox.minY) bbox.minY = y;
  if (x > bbox.maxX) bbox.maxX = x;
  if (y > bbox.maxY) bbox.maxY = y;
}

function tokenizePath(d: string): string[] {
  return d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
}

/** Bounding box for an SVG path `d` attribute (absolute coordinates). */
export function svgPathBBox(d: string): SvgBBox {
  const bbox = emptyBBox();
  const tokens = tokenizePath(d);
  if (tokens.length === 0) return bbox;

  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";

  const read = (): number => Number(tokens[i++]);

  const point = (x: number, y: number, relative: boolean) => {
    cx = relative ? cx + x : x;
    cy = relative ? cy + y : y;
    extendBBox(bbox, cx, cy);
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (/[a-zA-Z]/.test(token)) {
      cmd = token;
      i++;
    }

    const relative = cmd === cmd.toLowerCase() && cmd !== "Z" && cmd !== "z";
    const upper = cmd.toUpperCase();

    if (upper === "Z") {
      cx = sx;
      cy = sy;
      extendBBox(bbox, cx, cy);
      continue;
    }

    if (upper === "M") {
      const x = read();
      const y = read();
      point(x, y, relative);
      sx = cx;
      sy = cy;
      cmd = relative ? "l" : "L";
      continue;
    }

    if (upper === "L") {
      point(read(), read(), relative);
      continue;
    }

    if (upper === "H") {
      point(read(), 0, relative);
      continue;
    }

    if (upper === "V") {
      point(0, read(), relative);
      continue;
    }

    if (upper === "C") {
      const x1 = read();
      const y1 = read();
      const x2 = read();
      const y2 = read();
      const x = read();
      const y = read();
      const ax1 = relative ? cx + x1 : x1;
      const ay1 = relative ? cy + y1 : y1;
      const ax2 = relative ? cx + x2 : x2;
      const ay2 = relative ? cy + y2 : y2;
      extendBBox(bbox, ax1, ay1);
      extendBBox(bbox, ax2, ay2);
      point(x, y, relative);
      continue;
    }

    if (upper === "S" || upper === "Q") {
      const x1 = read();
      const y1 = read();
      const x = read();
      const y = read();
      const ax1 = relative ? cx + x1 : x1;
      const ay1 = relative ? cy + y1 : y1;
      extendBBox(bbox, ax1, ay1);
      point(x, y, relative);
      continue;
    }

    if (upper === "T") {
      point(read(), read(), relative);
      continue;
    }

    if (upper === "A") {
      read();
      read();
      read();
      read();
      read();
      point(read(), read(), relative);
      continue;
    }

    break;
  }

  return bbox;
}

export function svgBBoxArea(bbox: SvgBBox): number {
  if (!Number.isFinite(bbox.minX)) return 0;
  return Math.max(0, bbox.maxX - bbox.minX) * Math.max(0, bbox.maxY - bbox.minY);
}

export function svgBBoxCenter(bbox: SvgBBox): { x: number; y: number } {
  return {
    x: Math.round((bbox.minX + bbox.maxX) / 2),
    y: Math.round((bbox.minY + bbox.maxY) / 2),
  };
}
