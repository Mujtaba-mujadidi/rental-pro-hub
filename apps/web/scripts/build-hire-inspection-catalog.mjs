/**
 * Builds hire inspection diagram catalog + static artwork from the licensed
 * interactive-car-diagram asset. One catalog panel per purchased SVG part,
 * with every path/rect in that part as a clickable hit.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { svgBBoxCenter, svgPathBBox } from "./lib/svg-path-bbox.mjs";
import { diagramViewFromPoint } from "./lib/hire-inspection-diagram-views.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const sourceHtml = path.join(
  webRoot,
  "public/assets/interactive-car-diagram/main-file/index.html",
);
const catalogOut = path.join(webRoot, "src/lib/fleet/hire-inspection-diagram.catalog.json");
const artworkDir = path.join(webRoot, "public/assets/hire-inspection-diagrams");
const artworkOut = path.join(artworkDir, "hire-inspection-diagram.svg");

const VIEWBOX = "0 0 1920 1080";
const BACKGROUND_IMAGE = "/assets/hire-inspection-diagrams/hire-inspection-diagram.svg";

const ARTWORK_STYLES = `
.icst0 { fill: #ffffff; stroke: #000000; stroke-width: 0.5px; }
.icst1 { fill: #221F1F; }
.icst2 { display: none; fill: #221F1F; }
.icst3 { fill: #ffffff; fill-opacity: 0; }
.icst4 { fill: #231F20; }
.icst5 { font-family: arial, sans-serif; font-weight: bold; }
.icst6 { font-size: 32.0027px; }
text { fill: #000000; }
`;

const VIEWS = [
  { id: "left_side", label: "Left side" },
  { id: "front", label: "Front" },
  { id: "right_side", label: "Right side" },
  { id: "spare", label: "Spare" },
  { id: "rear", label: "Rear" },
  { id: "top", label: "Top" },
];

/** UK-friendly display labels; panel ids stay as purchased. */
const PANEL_LABEL_OVERRIDES = {
  front_rear_window: "Rear Windscreen",
};

function toPanelId(gid) {
  return gid.toLowerCase();
}

function panelLabel(panelId, tooltipLabel) {
  return PANEL_LABEL_OVERRIDES[panelId] ?? toPanelLabel(tooltipLabel);
}

function toPanelLabel(tooltipLabel) {
  return tooltipLabel
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function viewFromGid(gid) {
  if (gid.startsWith("SPARE_")) return "spare";
  if (
    gid.startsWith("LEFT_SIDE_") ||
    gid.startsWith("FRONT_LEFT_") ||
    gid.startsWith("REAR_LEFT_") ||
    gid === "LEFT_INNER_TAIL_LIGHT" ||
    gid === "LEFT_OUTER_TAIL_LIGHT" ||
    gid === "LEFT_FRONT_DRL_FOG_LIGHT" ||
    gid === "LEFT_QUATER_PANEL"
  ) {
    return "left_side";
  }
  if (
    gid.startsWith("RIGHT_SIDE_") ||
    gid.startsWith("FRONT_RIGHT_") ||
    gid.startsWith("REAR_RIGHT_") ||
    gid === "RIGHT_INNER_TAIL_LIGHT" ||
    gid === "RIGHT_OUTER_TAIL_LIGHT" ||
    gid === "RIGHT_FRONT_DRL_FOG_LIGHT" ||
    gid === "RIGHT_QUATER_PANEL"
  ) {
    return "right_side";
  }
  if (gid.startsWith("REAR_") || gid === "EXHAUST_TIPS") return "rear";
  if (gid.startsWith("FRONT_")) return "front";
  return "top";
}

function rectBBox(rect) {
  return {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
  };
}

function shapesPinPoint(shapes) {
  if (!shapes.length) return { cx: 0, cy: 0 };
  if (shapes.length === 1) {
    const box = shapes[0].shape === "path" ? svgPathBBox(shapes[0].d) : rectBBox(shapes[0]);
    const center = svgBBoxCenter(box);
    return { cx: center.x, cy: center.y };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of shapes) {
    const box = shape.shape === "path" ? svgPathBBox(shape.d) : rectBBox(shape);
    if (box.minX < minX) minX = box.minX;
    if (box.minY < minY) minY = box.minY;
    if (box.maxX > maxX) maxX = box.maxX;
    if (box.maxY > maxY) maxY = box.maxY;
  }
  const center = svgBBoxCenter({ minX, minY, maxX, maxY });
  return { cx: center.x, cy: center.y };
}

function parseRect(attrs) {
  const get = (name) => {
    const match = attrs.match(new RegExp(`${name}="([^"]+)"`));
    return match ? match[1] : undefined;
  };
  const x = Number(get("x"));
  const y = Number(get("y"));
  const width = Number(get("width"));
  const height = Number(get("height"));
  const rx = get("rx");
  return {
    shape: "rect",
    x,
    y,
    width,
    height,
    ...(rx ? { rx: Number(rx) } : {}),
  };
}

function extractShapes(inner) {
  const shapes = [];
  for (const match of inner.matchAll(/<path[^>]*\sd="([^"]+)"/g)) {
    shapes.push({
      shape: "path",
      d: match[1].replace(/\s+/g, " ").trim(),
    });
  }
  for (const match of inner.matchAll(/<rect\s+([^>/]+)(?:\/>|>\s*<\/rect>)/g)) {
    shapes.push(parseRect(match[1]));
  }
  return shapes;
}

function extractParts(html) {
  const svg = html.slice(html.indexOf("<svg"), html.lastIndexOf("</svg>") + 6);
  const parts = [];
  const anchorRe =
    /<a xlink:href="#" onmousemove="showTooltip\(evt, '([^']+)'\);" onmouseout="hideTooltip\(\);">\s*<g id="([^"]+)">([\s\S]*?)<\/g>\s*<\/a>/g;
  let match;
  while ((match = anchorRe.exec(svg)) !== null) {
    const [, label, gid, inner] = match;
    const shapes = extractShapes(inner);
    if (!shapes.length) {
      console.warn(`No shapes for ${gid}`);
      continue;
    }
    const view = viewFromGid(gid);
    const bbox = shapesPinPoint(shapes);
    parts.push({
      gid,
      id: toPanelId(gid),
      label: panelLabel(toPanelId(gid), label),
      category: view,
      view,
      shapes,
      bbox,
    });
  }
  return { svg, parts };
}

function buildArtworkSvg(sourceSvg) {
  const stripped = sourceSvg
    .replace(/<a xlink:href="#"[^>]*>/g, "")
    .replace(/<\/a>/g, "")
    .replace(/ onmousemove="[^"]*"/g, "")
    .replace(/ onmouseout="[^"]*"/g, "");

  return stripped.replace(
    /<svg([^>]*)>/,
    `<svg$1><defs><style>${ARTWORK_STYLES}</style></defs>`,
  );
}

function shapeDiagramView(shape) {
  const box = shape.shape === "path" ? svgPathBBox(shape.d) : rectBBox(shape);
  const center = svgBBoxCenter(box);
  return diagramViewFromPoint(center.x, center.y);
}

function buildCatalog(parts) {
  const panels = parts.map((part) => {
    const hits = part.shapes.map((shape) => ({
      view: shapeDiagramView(shape),
      ...shape,
    }));

    const pins = {};
    for (const viewId of new Set(hits.map((hit) => hit.view))) {
      const viewShapes = hits.filter((hit) => hit.view === viewId);
      const pin = shapesPinPoint(viewShapes);
      pins[viewId] = [pin.cx, pin.cy];
    }

    return {
      id: part.id,
      label: part.label,
      category: part.category,
      sourceId: part.gid,
      pins,
      hits,
    };
  });

  return {
    version: 3,
    viewBox: VIEWBOX,
    views: VIEWS,
    artwork: {
      backgroundImage: BACKGROUND_IMAGE,
    },
    source: {
      licensedAsset: "apps/web/public/assets/interactive-car-diagram",
      note: "Native purchased panel ids, labels, artwork styles, and all hit shapes.",
    },
    panels,
  };
}

const html = fs.readFileSync(sourceHtml, "utf8");
const { svg, parts } = extractParts(html);
const catalog = buildCatalog(parts);

fs.mkdirSync(artworkDir, { recursive: true });
fs.mkdirSync(path.dirname(catalogOut), { recursive: true });
fs.writeFileSync(catalogOut, `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(artworkOut, buildArtworkSvg(svg));

const hitCount = catalog.panels.reduce((sum, panel) => sum + panel.hits.length, 0);
console.log(
  `Wrote ${catalog.panels.length} panels, ${hitCount} hits -> ${path.relative(webRoot, catalogOut)}`,
);
