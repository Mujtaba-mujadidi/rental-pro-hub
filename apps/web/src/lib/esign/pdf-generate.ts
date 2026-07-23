import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import {
  CONTRACT_HEADER_LOGO_MAX_HEIGHT,
  CONTRACT_HEADER_LOGO_MAX_WIDTH,
  fitImageWithinBox,
} from "@/lib/companies/company-logo";
import {
  ESIGN_OWNER_ROLE,
  ESIGN_RECIPIENT_ROLE,
  type EsignFieldLayoutItem,
} from "@/lib/esign/types";
import { formatUkDateLong } from "@/lib/datetime/uk";
import {
  CONTRACT_LETTERHEAD_MIN_H,
  CONTRACT_MARGIN_TOP,
  CONTRACT_PARAPH_LABEL_FROM_TOP,
  CONTRACT_PARAPH_SIG_FROM_TOP,
  CONTRACT_PARAPH_SIG_H,
  CONTRACT_PARAPH_STRIP_H,
  CONTRACT_PAGE_H,
  contractContentBottomReserve,
  contractParaphStripBottomY,
  contractParaphStripTopFromPageTop,
  formatContractLetterheadContactLine,
} from "@/lib/esign/contract-pdf-layout";

export type ContractPdfParty = {
  roleLabel: string;
  name: string;
  lines: string[];
};

export type ContractPdfCommercialRow = {
  label: string;
  value: string;
};

export type ContractPdfDetailRow = {
  label: string;
  value: string;
};

export type ContractPdfHireDetails = {
  driver: ContractPdfDetailRow[];
  vehicle: ContractPdfDetailRow[];
  rental: ContractPdfDetailRow[];
};

export type ContractPdfHireRunningHeader = {
  vrm: string;
  hirer: string;
  hirerAddress: string;
  phvLicenceNumber: string;
  hireStartDate: string;
};

export type ContractPdfInput = {
  title: string;
  subtitle?: string | null;
  documentLabel?: string | null;
  issuedAt?: Date | null;
  platformName?: string | null;
  /** Optional company/platform logo for the header (PNG or JPEG bytes). */
  logoBytes?: Uint8Array | null;
  logoContentType?: string | null;
  parties: ContractPdfParty[];
  commercialRows: ContractPdfCommercialRow[];
  termsHeading?: string;
  termsParagraphs: string[];
  permissionHeading?: string;
  permissionParagraphs?: string[];
  acceptanceText?: string;
  /** Which execution blocks to draw. Default: both. */
  signatureMode?: "recipient_only" | "owner_and_recipient";
  companyNumber?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  hireDetails?: ContractPdfHireDetails;
  hireRunningHeader?: ContractPdfHireRunningHeader;
};

const PAGE_W = 595.28;
const PAGE_H = CONTRACT_PAGE_H;
const MARGIN_X = 48;
const MARGIN_TOP = CONTRACT_MARGIN_TOP;
const MARGIN_BOTTOM = 56;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const ink = rgb(0.12, 0.14, 0.18);
const muted = rgb(0.38, 0.42, 0.48);
const rule = rgb(0.82, 0.84, 0.88);
const accent = rgb(0.12, 0.28, 0.42);
const accentSoft = rgb(0.93, 0.95, 0.97);
const white = rgb(1, 1, 1);
const cardBorder = rgb(0.78, 0.81, 0.86);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        cur = word;
      } else {
        // Hard-break oversized tokens
        let chunk = "";
        for (const ch of word) {
          const tryChunk = chunk + ch;
          if (font.widthOfTextAtSize(tryChunk, size) <= maxWidth) chunk = tryChunk;
          else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        cur = chunk;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function formatIssuedDate(d: Date | null | undefined): string {
  return formatUkDateLong(d ?? new Date());
}

type LetterheadConfig = {
  companyName: string;
  companyNumber: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  documentLabel: string | null;
  logo: { image: PDFImage; width: number; height: number } | null;
};

type DrawCtx = {
  doc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  page: PDFPage;
  y: number;
  pageIndex: number;
  letterhead: LetterheadConfig;
  /** When set, page breaks inside this section repeat the heading with "(continued)". */
  continuationSection: string | null;
  hireRunningHeader: ContractPdfHireRunningHeader | null;
};

/** Draw repeating letterhead (logo, company name, contact, document label). Returns content start y. */
function drawLetterhead(ctx: DrawCtx): number {
  const lh = ctx.letterhead;
  const yTop = PAGE_H - MARGIN_TOP;
  let logoW = 0;
  let logoH = 0;
  if (lh.logo) {
    logoW = lh.logo.width;
    logoH = lh.logo.height;
    ctx.page.drawImage(lh.logo.image, {
      x: MARGIN_X,
      y: yTop - logoH,
      width: logoW,
      height: logoH,
    });
  }

  const textX = logoW > 0 ? MARGIN_X + logoW + 12 : MARGIN_X;
  const textMaxW = PAGE_W - MARGIN_X - textX - (lh.documentLabel ? 120 : 0);
  const nameY = yTop - (logoH > 0 ? Math.min(16, logoH * 0.55) : 12);
  ctx.page.drawText(lh.companyName.toUpperCase(), {
    x: textX,
    y: nameY,
    size: 9,
    font: ctx.fontBold,
    color: accent,
  });

  const contactLine = formatContractLetterheadContactLine({
    companyNumber: lh.companyNumber,
    email: lh.contactEmail,
    phone: lh.contactPhone,
  });
  let contactLines = 0;
  if (contactLine) {
    const wrapped = wrapText(contactLine, ctx.font, 7.5, Math.max(textMaxW, 180));
    contactLines = wrapped.length;
    let cy = nameY - 13;
    for (const line of wrapped.slice(0, 2)) {
      ctx.page.drawText(line, {
        x: textX,
        y: cy,
        size: 7.5,
        font: ctx.font,
        color: muted,
      });
      cy -= 10;
    }
  }

  if (lh.documentLabel) {
    const label = lh.documentLabel.toUpperCase();
    const labelW = ctx.font.widthOfTextAtSize(label, 8);
    ctx.page.drawText(label, {
      x: PAGE_W - MARGIN_X - labelW,
      y: yTop - 10,
      size: 8,
      font: ctx.font,
      color: muted,
    });
  }

  const textBand = Math.max(logoH, 18 + contactLines * 10);
  const bandH = Math.max(CONTRACT_LETTERHEAD_MIN_H, textBand);
  const ruleY = yTop - bandH - 4;
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: PAGE_W - MARGIN_X, y: ruleY },
    thickness: 0.7,
    color: rule,
  });
  let contentY = ruleY - 12;

  if (ctx.pageIndex > 1 && ctx.hireRunningHeader) {
    const h = ctx.hireRunningHeader;
    const rows = [
      `VRM: ${h.vrm}`,
      `Hirer: ${h.hirer}`,
      `Hirer address: ${h.hirerAddress}`,
      `PHV/Taxi licence number: ${h.phvLicenceNumber}`,
      `Hire start date: ${h.hireStartDate}`,
    ];
    let yy = contentY - 8;
    for (const line of rows) {
      for (const wl of wrapText(line, ctx.font, 7.5, CONTENT_W)) {
        ctx.page.drawText(wl, {
          x: MARGIN_X,
          y: yy - 7.5,
          size: 7.5,
          font: ctx.font,
          color: muted,
        });
        yy -= 9;
      }
    }
    contentY = yy - 6;
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: contentY },
      end: { x: PAGE_W - MARGIN_X, y: contentY },
      thickness: 0.5,
      color: rule,
    });
    contentY -= 10;
  }

  return contentY;
}

function newPage(ctx: DrawCtx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageIndex += 1;
  drawPageChrome(ctx);
  ctx.y = drawLetterhead(ctx);
  if (ctx.continuationSection) {
    drawSectionHeading(ctx, `${ctx.continuationSection} (continued)`, { keepWith: 24 });
  }
}

function contentBottomReserve(): number {
  return contractContentBottomReserve();
}

function ensureSpace(ctx: DrawCtx, need: number): void {
  const floor = contentBottomReserve();
  while (ctx.y - need <= floor) {
    newPage(ctx);
  }
}

function drawPageChrome(ctx: DrawCtx): void {
  // Top accent bar
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - 8,
    width: PAGE_W,
    height: 8,
    color: accent,
  });
  // Footer rule + page number (filled later in finalize, but draw baseline)
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: MARGIN_BOTTOM - 10 },
    end: { x: PAGE_W - MARGIN_X, y: MARGIN_BOTTOM - 10 },
    thickness: 0.6,
    color: rule,
  });
}

function drawFooterNumbers(doc: PDFDocument, font: PDFFont, platformName: string): void {
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const label = `${platformName}  ·  Confidential  ·  Page ${i + 1} of ${total}`;
    const size = 8;
    const w = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: (PAGE_W - w) / 2,
      y: MARGIN_BOTTOM - 28,
      size,
      font,
      color: muted,
    });
  });
}

const PARAPH_GAP = 10;

function drawPerPageSignatureParaphs(
  doc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  mode: "recipient_only" | "owner_and_recipient",
  skipPage?: number,
): EsignFieldLayoutItem[] {
  const includeOwner = mode === "owner_and_recipient";
  const pages = doc.getPages();
  const derived: EsignFieldLayoutItem[] = [];
  const stripTopFromTop = contractParaphStripTopFromPageTop();
  const yBottom = contractParaphStripBottomY();

  pages.forEach((page, index) => {
    const pageNum = index + 1;
    // Execution page already has full signature cards — omit per-page paraph strip there.
    if (skipPage != null && pageNum >= skipPage) return;

    page.drawRectangle({
      x: MARGIN_X,
      y: yBottom,
      width: CONTENT_W,
      height: CONTRACT_PARAPH_STRIP_H,
      color: accentSoft,
      borderColor: cardBorder,
      borderWidth: 0.5,
    });

    if (includeOwner) {
      const colW = (CONTENT_W - PARAPH_GAP) / 2;
      const ownerX = MARGIN_X + 8;
      const recipientX = MARGIN_X + colW + PARAPH_GAP + 8;
      const innerW = colW - 16;
      const labelY = yBottom + CONTRACT_PARAPH_STRIP_H - CONTRACT_PARAPH_LABEL_FROM_TOP;
      page.drawText("OWNER / LESSOR", {
        x: ownerX,
        y: labelY,
        size: 6.5,
        font: fontBold,
        color: muted,
      });
      page.drawText("HIRER", {
        x: recipientX,
        y: labelY,
        size: 6.5,
        font: fontBold,
        color: muted,
      });
      const sigY = yBottom + CONTRACT_PARAPH_STRIP_H - CONTRACT_PARAPH_SIG_FROM_TOP - CONTRACT_PARAPH_SIG_H;
      page.drawRectangle({
        x: ownerX,
        y: sigY,
        width: innerW,
        height: CONTRACT_PARAPH_SIG_H,
        borderColor: rule,
        borderWidth: 0.6,
        color: white,
      });
      page.drawRectangle({
        x: recipientX,
        y: sigY,
        width: innerW,
        height: CONTRACT_PARAPH_SIG_H,
        borderColor: rule,
        borderWidth: 0.6,
        color: white,
      });
      derived.push({
        id: `owner_sig_p${pageNum}`,
        type: "signature",
        role: ESIGN_OWNER_ROLE,
        page: pageNum,
        derivedFrom: "owner_sig",
        label: "Owner paraph",
        ...toNormRect(
          ownerX,
          stripTopFromTop + CONTRACT_PARAPH_SIG_FROM_TOP,
          innerW,
          CONTRACT_PARAPH_SIG_H,
        ),
      });
      derived.push({
        id: `recipient_sig_p${pageNum}`,
        type: "signature",
        role: ESIGN_RECIPIENT_ROLE,
        page: pageNum,
        derivedFrom: "recipient_sig",
        label: "Hirer paraph",
        ...toNormRect(
          recipientX,
          stripTopFromTop + CONTRACT_PARAPH_SIG_FROM_TOP,
          innerW,
          CONTRACT_PARAPH_SIG_H,
        ),
      });
    } else {
      const innerW = Math.min(CONTENT_W - 16, 280);
      const x = MARGIN_X + 8;
      page.drawText("HIRER", {
        x,
        y: yBottom + CONTRACT_PARAPH_STRIP_H - CONTRACT_PARAPH_LABEL_FROM_TOP,
        size: 6.5,
        font: fontBold,
        color: muted,
      });
      page.drawRectangle({
        x,
        y: yBottom + CONTRACT_PARAPH_STRIP_H - CONTRACT_PARAPH_SIG_FROM_TOP - CONTRACT_PARAPH_SIG_H,
        width: innerW,
        height: CONTRACT_PARAPH_SIG_H,
        borderColor: rule,
        borderWidth: 0.6,
        color: white,
      });
      derived.push({
        id: `recipient_sig_p${pageNum}`,
        type: "signature",
        role: ESIGN_RECIPIENT_ROLE,
        page: pageNum,
        derivedFrom: "recipient_sig",
        label: "Hirer paraph",
        ...toNormRect(x, stripTopFromTop + CONTRACT_PARAPH_SIG_FROM_TOP, innerW, CONTRACT_PARAPH_SIG_H),
      });
    }
  });

  return derived;
}

function drawText(
  ctx: DrawCtx,
  text: string,
  opts: { x?: number; size: number; font?: PDFFont; color?: RGB; maxWidth?: number; lineGap?: number },
): number {
  const font = opts.font ?? ctx.font;
  const color = opts.color ?? ink;
  const x = opts.x ?? MARGIN_X;
  const maxWidth = opts.maxWidth ?? CONTENT_W;
  const lineGap = opts.lineGap ?? opts.size * 0.45;
  const lines = wrapText(text, font, opts.size, maxWidth);
  for (const line of lines) {
    ensureSpace(ctx, opts.size + lineGap + 3);
    if (line) {
      ctx.page.drawText(line, {
        x,
        y: ctx.y - opts.size,
        size: opts.size,
        font,
        color,
      });
    }
    ctx.y -= opts.size + lineGap;
  }
  return lines.length;
}

function drawSectionHeading(ctx: DrawCtx, title: string, opts?: { keepWith?: number }): void {
  const headingBlock = 34;
  ensureSpace(ctx, headingBlock + (opts?.keepWith ?? 0));
  ctx.y -= 10;
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - 22,
    width: CONTENT_W,
    height: 22,
    color: accentSoft,
  });
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - 22,
    width: 3,
    height: 22,
    color: accent,
  });
  ctx.page.drawText(title.toUpperCase(), {
    x: MARGIN_X + 12,
    y: ctx.y - 15,
    size: 9,
    font: ctx.fontBold,
    color: accent,
  });
  ctx.y -= 34;
}

/** Start a major section on a dedicated page (never continue under prior section content). */
function beginMajorSection(ctx: DrawCtx): void {
  newPage(ctx);
}

function drawMetaPill(ctx: DrawCtx, label: string, value: string, x: number, width: number): void {
  ctx.page.drawText(label.toUpperCase(), {
    x,
    y: ctx.y - 9,
    size: 7,
    font: ctx.fontBold,
    color: muted,
  });
  const valueLines = wrapText(value, ctx.font, 10, width - 4);
  let yy = ctx.y - 24;
  for (const line of valueLines.slice(0, 2)) {
    ctx.page.drawText(line, {
      x,
      y: yy,
      size: 10,
      font: ctx.font,
      color: ink,
    });
    yy -= 12;
  }
}

function drawParties(ctx: DrawCtx, parties: ContractPdfParty[]): void {
  drawSectionHeading(ctx, "Parties");
  const gap = 14;
  const colW = (CONTENT_W - gap) / 2;
  const cards = parties.slice(0, 2);
  while (cards.length < 2) {
    cards.push({ roleLabel: cards.length === 0 ? "Platform" : "Customer", name: "—", lines: [] });
  }

  // Estimate height for both cards
  const lineH = 11;
  const heights = cards.map((p) => {
    const nameLines = wrapText(p.name || "—", ctx.fontBold, 11, colW - 24);
    let body = 0;
    for (const line of p.lines) {
      body += wrapText(line, ctx.font, 9, colW - 24).length * lineH;
    }
    return 28 + nameLines.length * 14 + 8 + body + 16;
  });
  const cardH = Math.max(...heights, 88);
  ensureSpace(ctx, cardH + 8);

  cards.forEach((party, i) => {
    const x = MARGIN_X + i * (colW + gap);
    const top = ctx.y;
    ctx.page.drawRectangle({
      x,
      y: top - cardH,
      width: colW,
      height: cardH,
      borderColor: cardBorder,
      borderWidth: 1,
      color: white,
    });
    ctx.page.drawRectangle({
      x,
      y: top - 18,
      width: colW,
      height: 18,
      color: i === 0 ? accent : rgb(0.96, 0.97, 0.98),
    });
    ctx.page.drawText(party.roleLabel.toUpperCase(), {
      x: x + 10,
      y: top - 13,
      size: 7.5,
      font: ctx.fontBold,
      color: i === 0 ? white : accent,
    });

    let yy = top - 36;
    for (const nl of wrapText(party.name || "—", ctx.fontBold, 11, colW - 24)) {
      ctx.page.drawText(nl, {
        x: x + 10,
        y: yy,
        size: 11,
        font: ctx.fontBold,
        color: ink,
      });
      yy -= 14;
    }
    yy -= 4;
    for (const line of party.lines) {
      for (const wl of wrapText(line, ctx.font, 9, colW - 24)) {
        ctx.page.drawText(wl, {
          x: x + 10,
          y: yy,
          size: 9,
          font: ctx.font,
          color: muted,
        });
        yy -= lineH;
      }
    }
  });

  ctx.y -= cardH + 16;
}

function drawCommercialTable(ctx: DrawCtx, rows: ContractPdfCommercialRow[]): void {
  if (!rows.length) return;
  drawSectionHeading(ctx, "Commercial terms");

  const labelW = 170;
  const valueW = CONTENT_W - labelW;
  const padY = 7;
  const rowSize = 9.5;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const labelLines = wrapText(row.label, ctx.fontBold, rowSize, labelW - 16);
    const valueLines = wrapText(row.value, ctx.font, rowSize, valueW - 16);
    const lines = Math.max(labelLines.length, valueLines.length);
    const rowH = Math.max(26, lines * (rowSize + 3) + padY * 2);
    ensureSpace(ctx, rowH + 2);

    const bg = i % 2 === 0 ? accentSoft : white;
    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: ctx.y - rowH,
      width: CONTENT_W,
      height: rowH,
      color: bg,
      borderColor: rule,
      borderWidth: 0.5,
    });

    let ly = ctx.y - padY - rowSize;
    for (const ll of labelLines) {
      ctx.page.drawText(ll, {
        x: MARGIN_X + 10,
        y: ly,
        size: rowSize,
        font: ctx.fontBold,
        color: ink,
      });
      ly -= rowSize + 3;
    }
    let vy = ctx.y - padY - rowSize;
    for (const vl of valueLines) {
      ctx.page.drawText(vl, {
        x: MARGIN_X + labelW + 8,
        y: vy,
        size: rowSize,
        font: ctx.font,
        color: ink,
      });
      vy -= rowSize + 3;
    }
    ctx.y -= rowH;
  }
  ctx.y -= 12;
}

/** Full-width 4-column rows: key|value beside key|value (two fields per row). */
function drawFourColumnSectionRowsAt(
  ctx: DrawCtx,
  rows: ContractPdfDetailRow[],
  startY: number,
): number {
  const gutter = 12;
  const pairW = (CONTENT_W - gutter) / 2;
  const labelW = Math.min(92, pairW * 0.38);
  const valueW = pairW - labelW;
  const leftLabelX = MARGIN_X;
  const leftValueX = leftLabelX + labelW + 4;
  const rightLabelX = MARGIN_X + pairW + gutter;
  const rightValueX = rightLabelX + labelW + 4;
  const padY = 4;
  const rowSize = 8.5;
  let y = startY;

  for (let i = 0; i < rows.length; i += 2) {
    const left = rows[i];
    const right = rows[i + 1];
    const leftLabelLines = left ? wrapText(left.label, ctx.fontBold, rowSize, labelW - 6) : [""];
    const leftValueLines = left ? wrapText(left.value || "—", ctx.font, rowSize, valueW - 6) : [""];
    const rightLabelLines = right ? wrapText(right.label, ctx.fontBold, rowSize, labelW - 6) : [""];
    const rightValueLines = right ? wrapText(right.value || "—", ctx.font, rowSize, valueW - 6) : [""];
    const lines = Math.max(
      leftLabelLines.length,
      leftValueLines.length,
      rightLabelLines.length,
      rightValueLines.length,
    );
    const rowIndex = i / 2;
    const rowH = Math.max(17, lines * (rowSize + 2) + padY * 2);
    const bg = rowIndex % 2 === 0 ? accentSoft : white;

    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: y - rowH,
      width: CONTENT_W,
      height: rowH,
      color: bg,
      borderColor: rule,
      borderWidth: 0.5,
    });
    ctx.page.drawLine({
      start: { x: MARGIN_X + pairW + gutter / 2, y: y - rowH },
      end: { x: MARGIN_X + pairW + gutter / 2, y: y },
      thickness: 0.5,
      color: rule,
    });

    const drawCell = (lines: string[], x: number, font: PDFFont) => {
      let cy = y - padY - rowSize;
      for (const line of lines) {
        if (!line) continue;
        ctx.page.drawText(line, { x, y: cy, size: rowSize, font, color: ink });
        cy -= rowSize + 2;
      }
    };

    drawCell(leftLabelLines, leftLabelX + 6, ctx.fontBold);
    drawCell(leftValueLines, leftValueX, ctx.font);
    if (right) {
      drawCell(rightLabelLines, rightLabelX + 6, ctx.fontBold);
      drawCell(rightValueLines, rightValueX, ctx.font);
    }
    y -= rowH;
  }
  return y;
}

function drawColumnSectionHeadingAt(
  ctx: DrawCtx,
  title: string,
  x: number,
  width: number,
  topY: number,
): number {
  const h = 18;
  ctx.page.drawRectangle({
    x,
    y: topY - h,
    width,
    height: h,
    color: accentSoft,
  });
  ctx.page.drawRectangle({
    x,
    y: topY - h,
    width: 3,
    height: h,
    color: accent,
  });
  ctx.page.drawText(title.toUpperCase(), {
    x: x + 8,
    y: topY - 12,
    size: 8,
    font: ctx.fontBold,
    color: accent,
  });
  return topY - h - 4;
}

const HIRE_DETAILS_SECTION_GAP = 14;

function estimateFourColumnSectionHeight(rowCount: number): number {
  const rowPairs = Math.ceil(rowCount / 2);
  return 22 + rowPairs * 19;
}

/** Stacked sections: driver, vehicle, then rental — each with a 4-column key|value grid. */
function drawHireDetailsCompact(ctx: DrawCtx, details: ContractPdfHireDetails): void {
  const estH =
    estimateFourColumnSectionHeight(details.driver.length) +
    HIRE_DETAILS_SECTION_GAP +
    estimateFourColumnSectionHeight(details.vehicle.length) +
    HIRE_DETAILS_SECTION_GAP +
    estimateFourColumnSectionHeight(details.rental.length) +
    8;
  ensureSpace(ctx, estH);

  let y = ctx.y;
  y = drawColumnSectionHeadingAt(ctx, "Driver details", MARGIN_X, CONTENT_W, y);
  y = drawFourColumnSectionRowsAt(ctx, details.driver, y);

  y -= HIRE_DETAILS_SECTION_GAP;
  y = drawColumnSectionHeadingAt(ctx, "Vehicle details", MARGIN_X, CONTENT_W, y);
  y = drawFourColumnSectionRowsAt(ctx, details.vehicle, y);

  y -= HIRE_DETAILS_SECTION_GAP;
  y = drawColumnSectionHeadingAt(ctx, "Rental details", MARGIN_X, CONTENT_W, y);
  y = drawFourColumnSectionRowsAt(ctx, details.rental, y);

  ctx.y = y - 8;
}

function drawLongFormSection(ctx: DrawCtx, heading: string, paragraphs: string[]): void {
  // Long sections start on a dedicated page after prior content.
  ctx.continuationSection = null;
  beginMajorSection(ctx);
  ctx.continuationSection = heading;
  drawSectionHeading(ctx, heading, { keepWith: 48 });
  for (const para of paragraphs) {
    const t = para.trim();
    if (!t) {
      ensureSpace(ctx, 8);
      ctx.y -= 6;
      continue;
    }
    if (t.startsWith("• ") || t.startsWith("- ")) {
      const bullet = t.replace(/^[-•]\s*/, "");
      const size = 10;
      const lineGap = 4;
      const maxWidth = CONTENT_W - 16;
      const lines = wrapText(bullet, ctx.font, size, maxWidth);
      const blockH = lines.length * (size + lineGap) + 6;
      ensureSpace(ctx, blockH);
      const bulletY = ctx.y;
      ctx.page.drawText("•", {
        x: MARGIN_X + 4,
        y: bulletY - size,
        size,
        font: ctx.font,
        color: accent,
      });
      drawText(ctx, bullet, {
        x: MARGIN_X + 16,
        size,
        maxWidth,
        lineGap,
        color: ink,
      });
      ctx.y -= 4;
      continue;
    }
    // Numbered clause heading style e.g. "1. Definitions"
    if (/^\d+(\.\d+)*\s+\S/.test(t) && t.length < 120) {
      ctx.y -= 4;
      drawText(ctx, t, {
        size: 10.5,
        font: ctx.fontBold,
        color: ink,
        lineGap: 3,
      });
      ctx.y -= 2;
      continue;
    }
    drawText(ctx, t, {
      size: 10,
      lineGap: 4,
      color: ink,
    });
    ctx.y -= 8;
  }
  ctx.continuationSection = null;
}

type SignatureBlockLayout = {
  page: number;
  ownerSig: { x: number; y: number; w: number; h: number } | null;
  ownerName: { x: number; y: number; w: number; h: number } | null;
  ownerDate: { x: number; y: number; w: number; h: number } | null;
  recipientSig: { x: number; y: number; w: number; h: number };
  recipientName: { x: number; y: number; w: number; h: number };
  recipientDate: { x: number; y: number; w: number; h: number };
};

function toNormRect(x: number, topFromTop: number, w: number, h: number) {
  return {
    x: x / PAGE_W,
    y: topFromTop / PAGE_H,
    w: w / PAGE_W,
    h: h / PAGE_H,
  };
}

const SIG_CARD_H = 158;
/** Vertical layout inside each signature card (offsets from card top, downward). */
const SIG_LAYOUT = {
  titleBottom: 20,
  padTop: 24,
  padH: 46,
  nameLabelTop: 78,
  nameFieldTop: 88,
  nameFieldH: 16,
  dateLabelTop: 114,
  dateFieldTop: 124,
  dateFieldH: 16,
} as const;

function drawOneSignatureCard(
  ctx: DrawCtx,
  opts: {
    x: number;
    top: number;
    width: number;
    height: number;
    title: string;
    hint: string;
  },
) {
  const { x, top, width, height, title, hint } = opts;
  const L = SIG_LAYOUT;
  ctx.page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    borderColor: cardBorder,
    borderWidth: 1,
    color: white,
  });
  ctx.page.drawText(title.toUpperCase(), {
    x: x + 12,
    y: top - 14,
    size: 8,
    font: ctx.fontBold,
    color: accent,
  });

  // Signature pad — field overlays this box (under the party title)
  const padBottom = top - (L.padTop + L.padH);
  ctx.page.drawRectangle({
    x: x + 12,
    y: padBottom,
    width: width - 24,
    height: L.padH,
    color: accentSoft,
    borderColor: rule,
    borderWidth: 0.6,
  });
  ctx.page.drawText(hint, {
    x: x + 18,
    y: top - L.padTop - L.padH / 2 - 3,
    size: 8,
    font: ctx.font,
    color: muted,
  });

  // Full name — printed label above the writable field area
  ctx.page.drawText("Full name", {
    x: x + 12,
    y: top - L.nameLabelTop,
    size: 7.5,
    font: ctx.font,
    color: muted,
  });
  ctx.page.drawLine({
    start: { x: x + 12, y: top - (L.nameFieldTop + L.nameFieldH) },
    end: { x: x + width - 12, y: top - (L.nameFieldTop + L.nameFieldH) },
    thickness: 0.6,
    color: rule,
  });

  // Date & time — printed label above the writable field area
  ctx.page.drawText("Date & time", {
    x: x + 12,
    y: top - L.dateLabelTop,
    size: 7.5,
    font: ctx.font,
    color: muted,
  });
  ctx.page.drawLine({
    start: { x: x + 12, y: top - (L.dateFieldTop + L.dateFieldH) },
    end: { x: x + width - 12, y: top - (L.dateFieldTop + L.dateFieldH) },
    thickness: 0.6,
    color: rule,
  });
}

function cardFieldRects(x: number, top: number, width: number) {
  const L = SIG_LAYOUT;
  const sigX = x + 12;
  const sigW = width - 24;
  // Fields sit inside the pad / under labels (not over the printed labels)
  const sigTopFromTop = PAGE_H - top + L.padTop;
  const nameTopFromTop = PAGE_H - top + L.nameFieldTop;
  const dateTopFromTop = PAGE_H - top + L.dateFieldTop;
  return {
    sig: toNormRect(sigX, sigTopFromTop, sigW, L.padH),
    name: toNormRect(sigX, nameTopFromTop, sigW, L.nameFieldH),
    date: toNormRect(sigX, dateTopFromTop, Math.min(sigW * 0.85, 168), L.dateFieldH),
  };
}

function estimateWrappedHeight(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  lineGap: number,
): number {
  const lines = wrapText(text, font, size, maxWidth);
  return lines.length * (size + lineGap);
}

function drawAcceptanceAndSignatureBlocks(
  ctx: DrawCtx,
  acceptanceText: string,
  mode: "recipient_only" | "owner_and_recipient",
): SignatureBlockLayout {
  const includeOwner = mode === "owner_and_recipient";
  const gap = 14;
  const blockH = SIG_CARD_H;
  const acceptanceH = estimateWrappedHeight(acceptanceText, ctx.font, 9.5, CONTENT_W, 4);
  // Keep Execution heading + acceptance + cards together (no orphan heading at page end)
  const sectionBodyNeed = acceptanceH + 14 + blockH + 16;
  ctx.continuationSection = null;
  beginMajorSection(ctx);
  drawSectionHeading(ctx, "Execution", { keepWith: sectionBodyNeed });
  drawText(ctx, acceptanceText, {
    size: 9.5,
    lineGap: 4,
    color: muted,
  });
  ctx.y -= 14;

  ensureSpace(ctx, blockH + 8);

  const page = ctx.pageIndex;
  const top = ctx.y;

  if (includeOwner) {
    const colW = (CONTENT_W - gap) / 2;
    drawOneSignatureCard(ctx, {
      x: MARGIN_X,
      top,
      width: colW,
      height: blockH,
      title: "Platform / Owner",
      hint: "Owner signs here",
    });
    drawOneSignatureCard(ctx, {
      x: MARGIN_X + colW + gap,
      top,
      width: colW,
      height: blockH,
      title: "Customer / Recipient",
      hint: "Recipient signs here",
    });
    ctx.y -= blockH + 10;

    const owner = cardFieldRects(MARGIN_X, top, colW);
    const recipient = cardFieldRects(MARGIN_X + colW + gap, top, colW);

    return {
      page,
      ownerSig: owner.sig,
      ownerName: owner.name,
      ownerDate: owner.date,
      recipientSig: recipient.sig,
      recipientName: recipient.name,
      recipientDate: recipient.date,
    };
  }

  // Recipient only — single customer block (no owner placeholder)
  const width = Math.min(CONTENT_W, 340);
  const x = MARGIN_X;
  drawOneSignatureCard(ctx, {
    x,
    top,
    width,
    height: blockH,
    title: "Customer / Recipient",
    hint: "Recipient signs here",
  });
  ctx.y -= blockH + 10;

  const recipient = cardFieldRects(x, top, width);

  return {
    page,
    ownerSig: null,
    ownerName: null,
    ownerDate: null,
    recipientSig: recipient.sig,
    recipientName: recipient.name,
    recipientDate: recipient.date,
  };
}

/**
 * Build a professional multi-page A4 contract PDF plus suggested signature field positions
 * aligned to the Execution section placeholders.
 */
export async function createProfessionalContractPdf(
  input: ContractPdfInput,
): Promise<{ bytes: Uint8Array; suggestedFields: EsignFieldLayoutItem[] }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const platformName = (input.platformName ?? "RMS").trim() || "RMS";

  let embeddedLogo: LetterheadConfig["logo"] = null;
  if (input.logoBytes && input.logoBytes.length > 0) {
    try {
      const isJpeg =
        (input.logoContentType ?? "").includes("jpeg") || (input.logoContentType ?? "").includes("jpg");
      const img = isJpeg
        ? await doc.embedJpg(input.logoBytes)
        : await doc.embedPng(input.logoBytes);
      const fitted = fitImageWithinBox(
        img.width,
        img.height,
        CONTRACT_HEADER_LOGO_MAX_WIDTH,
        CONTRACT_HEADER_LOGO_MAX_HEIGHT,
      );
      embeddedLogo = { image: img, width: fitted.width, height: fitted.height };
    } catch (e) {
      console.warn("[contract-pdf] logo embed failed", e);
    }
  }

  const letterhead: LetterheadConfig = {
    companyName: platformName,
    companyNumber: input.companyNumber?.trim() || null,
    contactEmail: input.contactEmail?.trim() || null,
    contactPhone: input.contactPhone?.trim() || null,
    documentLabel: input.documentLabel?.trim() || "Platform services agreement",
    logo: embeddedLogo,
  };

  const ctx: DrawCtx = {
    doc,
    font,
    fontBold,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN_TOP,
    pageIndex: 1,
    letterhead,
    continuationSection: null,
    hireRunningHeader: input.hireRunningHeader ?? null,
  };
  drawPageChrome(ctx);
  ctx.y = drawLetterhead(ctx);

  drawText(ctx, input.title, {
    size: 18,
    font: fontBold,
    color: ink,
    lineGap: 4,
  });
  if (input.subtitle?.trim()) {
    ctx.y -= 2;
    drawText(ctx, input.subtitle.trim(), {
      size: 10,
      color: muted,
      lineGap: 3,
    });
  }
  ctx.y -= 8;

  if (!input.hireDetails) {
    ensureSpace(ctx, 44);
    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: ctx.y - 40,
      width: CONTENT_W,
      height: 40,
      color: accentSoft,
      borderColor: rule,
      borderWidth: 0.5,
    });
    const col = CONTENT_W / 3;
    const metaY = ctx.y;
    ctx.y = metaY;
    drawMetaPill(ctx, "Issued", formatIssuedDate(input.issuedAt), MARGIN_X + 12, col - 20);
    ctx.y = metaY;
    drawMetaPill(ctx, "Document", "Electronic agreement", MARGIN_X + col + 8, col - 16);
    ctx.y = metaY;
    drawMetaPill(ctx, "Signature", "Simple e-sign (not eIDAS QES)", MARGIN_X + col * 2 + 4, col - 16);
    ctx.y = metaY - 52;
  } else {
    ctx.y -= 4;
  }

  if (input.hireDetails) {
    drawHireDetailsCompact(ctx, input.hireDetails);
  } else {
    drawParties(ctx, input.parties);
    drawCommercialTable(ctx, input.commercialRows);
  }
  drawLongFormSection(ctx, input.termsHeading ?? "Terms and Conditions", input.termsParagraphs);

  const permissionParagraphs = (input.permissionParagraphs ?? []).filter((p) => p.trim());
  if (permissionParagraphs.length) {
    drawLongFormSection(ctx, input.permissionHeading ?? "Permission letter", permissionParagraphs);
  }

  const acceptance =
    input.acceptanceText?.trim() ||
    "By signing this document, each party confirms they have read and agree to the terms and commercial summary above. This is an electronic signature for contractual acceptance and is not a qualified electronic signature under eIDAS.";
  const mode = input.signatureMode ?? "owner_and_recipient";
  const blocks = drawAcceptanceAndSignatureBlocks(ctx, acceptance, mode);

  drawFooterNumbers(doc, font, platformName);
  const paraphFields = drawPerPageSignatureParaphs(doc, font, fontBold, mode, blocks.page);
  const bytes = await doc.save();

  const suggestedFields: EsignFieldLayoutItem[] = [];
  if (blocks.ownerSig && blocks.ownerName && blocks.ownerDate) {
    suggestedFields.push(
      {
        id: "owner_sig",
        type: "signature",
        role: ESIGN_OWNER_ROLE,
        page: blocks.page,
        ...blocks.ownerSig,
        label: "Owner signature",
      },
      {
        id: "owner_name",
        type: "text",
        role: ESIGN_OWNER_ROLE,
        page: blocks.page,
        ...blocks.ownerName,
        label: "Owner full name",
      },
      {
        id: "owner_date",
        type: "date",
        role: ESIGN_OWNER_ROLE,
        page: blocks.page,
        ...blocks.ownerDate,
        label: "Owner date & time",
      },
    );
  }
  suggestedFields.push(
    {
      id: "recipient_sig",
      type: "signature",
      role: ESIGN_RECIPIENT_ROLE,
      page: blocks.page,
      ...blocks.recipientSig,
      label: "Recipient signature",
    },
    {
      id: "recipient_name",
      type: "text",
      role: ESIGN_RECIPIENT_ROLE,
      page: blocks.page,
      ...blocks.recipientName,
      label: "Recipient full name",
    },
    {
      id: "recipient_date",
      type: "date",
      role: ESIGN_RECIPIENT_ROLE,
      page: blocks.page,
      ...blocks.recipientDate,
      label: "Recipient date & time",
    },
  );

  suggestedFields.push(...paraphFields);

  return { bytes, suggestedFields };
}

/** @deprecated Prefer createProfessionalContractPdf — kept for simple text fallbacks. */
export async function createPdfFromPlainText(title: string, lines: string[]): Promise<Uint8Array> {
  const { bytes } = await createProfessionalContractPdf({
    title,
    parties: [
      { roleLabel: "Platform", name: "RMS", lines: [] },
      { roleLabel: "Customer", name: "—", lines: [] },
    ],
    commercialRows: [],
    termsParagraphs: lines.filter((l) => l.trim().length > 0 || l === ""),
  });
  return bytes;
}
