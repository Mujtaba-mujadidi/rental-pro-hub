import DOMPurify from "isomorphic-dompurify";
import type { ContractPdfCommercialRow, ContractPdfInput, ContractPdfParty } from "@/lib/esign/pdf-generate";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bodyToHtmlFragment(body: string): string {
  const t = body?.trim() ?? "";
  if (!t) return "<p><em>(No terms body was stored for this version.)</em></p>";
  if (/<[a-z][\s\S]*>/i.test(t)) return t;
  const paras = t.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return paras.join("") || "<p><em>(Empty terms.)</em></p>";
}

function sanitizeTermsFragment(htmlFragment: string): string {
  return DOMPurify.sanitize(htmlFragment, {
    ALLOWED_TAGS: ["p", "br", "b", "i", "u", "strong", "em", "ul", "ol", "li", "a", "span", "div", "h1", "h2", "h3"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}

function snapshotString(row: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!row || typeof row !== "object") return null;
  const v = row[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMoneyish(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  }
  return String(value).trim() || null;
}

const COMMERCIAL_LABELS: Record<string, string> = {
  currency: "Currency",
  pricing_model_type: "Pricing model",
  pricing_model: "Pricing model",
  billing_frequency: "Billing frequency",
  billing_cycle: "Billing cycle",
  payment_terms_days: "Payment terms (days)",
  monthly_fee: "Monthly fee",
  platform_fee: "Platform fee",
  setup_fee: "Setup fee",
  deposit: "Deposit",
  per_vehicle_fee: "Per-vehicle fee",
  per_driver_fee: "Per-driver fee",
  notes: "Notes",
  preset_name: "Pricing preset",
};

const SKIP_COMMERCIAL_KEYS = new Set(["id", "created_at", "updated_at", "pricing_preset_id", "parameters"]);

function formatCommercialRows(commercial: Record<string, unknown> | null | undefined): ContractPdfCommercialRow[] {
  if (!commercial || typeof commercial !== "object") return [];
  const rows: ContractPdfCommercialRow[] = [];
  const preferred = [
    "preset_name",
    "pricing_model_type",
    "pricing_model",
    "currency",
    "billing_frequency",
    "billing_cycle",
    "payment_terms_days",
    "monthly_fee",
    "platform_fee",
    "setup_fee",
    "deposit",
    "per_vehicle_fee",
    "per_driver_fee",
    "notes",
  ];
  const seen = new Set<string>();

  for (const key of preferred) {
    if (!(key in commercial) || SKIP_COMMERCIAL_KEYS.has(key)) continue;
    const raw = commercial[key];
    if (raw == null || raw === "") continue;
    const value =
      typeof raw === "object" ? JSON.stringify(raw) : (formatMoneyish(raw) ?? String(raw));
    rows.push({ label: COMMERCIAL_LABELS[key] ?? humanizeKey(key), value });
    seen.add(key);
  }

  for (const [key, raw] of Object.entries(commercial)) {
    if (seen.has(key) || SKIP_COMMERCIAL_KEYS.has(key)) continue;
    if (raw == null || raw === "") continue;
    if (typeof raw === "object") {
      try {
        rows.push({ label: COMMERCIAL_LABELS[key] ?? humanizeKey(key), value: JSON.stringify(raw) });
      } catch {
        /* skip */
      }
      continue;
    }
    rows.push({
      label: COMMERCIAL_LABELS[key] ?? humanizeKey(key),
      value: formatMoneyish(raw) ?? String(raw),
    });
  }
  return rows;
}

function legalPartyLines(legal: Record<string, unknown> | null | undefined): string[] {
  if (!legal || typeof legal !== "object") return [];
  const lines: string[] = [];
  const number =
    snapshotString(legal, "company_number") ?? snapshotString(legal, "companies_house_number");
  if (number) lines.push(`Company number: ${number}`);
  const vat = snapshotString(legal, "vat_number");
  if (vat) lines.push(`VAT: ${vat}`);
  const address = [
    snapshotString(legal, "registered_address_line1"),
    snapshotString(legal, "registered_address_line2"),
    [snapshotString(legal, "registered_town"), snapshotString(legal, "registered_county")].filter(Boolean).join(", ") ||
      null,
    snapshotString(legal, "registered_postcode"),
    snapshotString(legal, "country"),
  ].filter(Boolean);
  if (address.length) lines.push(address.join(", "));
  const contact = [
    snapshotString(legal, "primary_contact_name"),
    snapshotString(legal, "primary_contact_email"),
  ].filter(Boolean);
  if (contact.length) lines.push(contact.join(" · "));
  return lines;
}

function termsToParagraphs(bodyRaw: string): string[] {
  const safe = sanitizeTermsFragment(bodyToHtmlFragment(bodyRaw));
  const withMarkers = safe
    .replace(/<\/h[1-3]>/gi, "\n\n")
    .replace(/<h[1-3][^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/?(ul|ol|div|span)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return withMarkers
    .split(/\n/)
    .map((l) => l.trimEnd())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
}

/** Structured contract content for the professional PDF renderer. */
export function buildContractPdfDocument(input: {
  termsSnapshot: Record<string, unknown> | null | undefined;
  commercialSnapshot: Record<string, unknown> | null | undefined;
  legalSnapshot: Record<string, unknown> | null | undefined;
  companyName?: string | null;
  platformName?: string | null;
}): ContractPdfInput {
  const ts = input.termsSnapshot && typeof input.termsSnapshot === "object" ? input.termsSnapshot : {};
  const titleRaw = typeof ts.title === "string" ? ts.title.trim() : "";
  const versionLabel = typeof ts.version_label === "string" ? ts.version_label.trim() : "";
  const title =
    titleRaw || (versionLabel ? `Rental terms (${versionLabel})` : "Platform services agreement");

  const customerName =
    snapshotString(input.legalSnapshot, "legal_name") ??
    snapshotString(input.legalSnapshot, "name") ??
    input.companyName?.trim() ??
    "Customer";

  const platformName = input.platformName?.trim() || "RMS";
  const companyNumber =
    snapshotString(input.legalSnapshot, "company_number") ??
    snapshotString(input.legalSnapshot, "companies_house_number");
  const contactEmail = snapshotString(input.legalSnapshot, "primary_contact_email");
  const contactPhone = snapshotString(input.legalSnapshot, "primary_contact_phone");

  const parties: ContractPdfParty[] = [
    {
      roleLabel: "Platform",
      name: platformName,
      lines: ["Contract owner / service provider", "Electronic signature required before send"],
    },
    {
      roleLabel: "Customer",
      name: customerName,
      lines: legalPartyLines(input.legalSnapshot),
    },
  ];

  const bodyRaw = typeof ts.body === "string" ? ts.body : "";
  const termsParagraphs = termsToParagraphs(bodyRaw);

  return {
    title,
    subtitle: versionLabel ? `Version ${versionLabel}` : null,
    documentLabel: "Platform company agreement",
    issuedAt: new Date(),
    platformName,
    parties,
    commercialRows: formatCommercialRows(input.commercialSnapshot),
    termsHeading: "Terms and Conditions",
    termsParagraphs:
      termsParagraphs.length > 0
        ? termsParagraphs
        : ["No terms body was stored for this contract version."],
    companyNumber,
    contactEmail,
    contactPhone,
    acceptanceText:
      "By signing, each party confirms they have read and agree to the terms and commercial summary in this agreement. This is an electronic signature for contractual acceptance (not a qualified electronic signature under eIDAS).",
  };
}

/** Plain-text lines for PDF generation (legacy helper / tests). */
export function buildContractDocumentPlainText(input: {
  termsSnapshot: Record<string, unknown> | null | undefined;
  commercialSnapshot: Record<string, unknown> | null | undefined;
  legalSnapshot: Record<string, unknown> | null | undefined;
}): { title: string; lines: string[] } {
  const doc = buildContractPdfDocument(input);
  const lines: string[] = [];
  for (const p of doc.parties) {
    lines.push(`${p.roleLabel}: ${p.name}`);
    lines.push(...p.lines);
    lines.push("");
  }
  if (doc.commercialRows.length) {
    lines.push("Commercial summary");
    for (const r of doc.commercialRows) lines.push(`${r.label}: ${r.value}`);
    lines.push("");
  }
  lines.push("Terms and conditions", "");
  lines.push(...doc.termsParagraphs);
  lines.push("", "Customer acceptance", doc.acceptanceText ?? "");
  return { title: doc.title, lines };
}
