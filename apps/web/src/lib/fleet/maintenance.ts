/** Shared types for vehicle maintenance expenses and company payment lookups. */

export const MAINTENANCE_CATEGORIES = [
  "service",
  "mot",
  "tax",
  "phv_taxi_licence",
  "repair",
  "tyres",
  "bodywork",
  "glass",
  "electrical",
  "other",
] as const;

export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];

export const MAINTENANCE_CATEGORY_LABELS: Record<MaintenanceCategory, string> = {
  service: "Service",
  mot: "MOT",
  tax: "Tax",
  phv_taxi_licence: "PHV/Taxi licence",
  repair: "Repair",
  tyres: "Tyres",
  bodywork: "Bodywork",
  glass: "Glass",
  electrical: "Electrical",
  other: "Other",
};

export function isMaintenanceCategory(v: string): v is MaintenanceCategory {
  return (MAINTENANCE_CATEGORIES as readonly string[]).includes(v);
}

export type PaymentMethodRow = {
  id: string;
  parent_company_id: string;
  name: string;
  is_active: boolean;
  requires_account: boolean;
  sort_order: number;
  created_at: string;
};

export type PaymentAccountRow = {
  id: string;
  parent_company_id: string;
  name: string;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type MaintenanceRecordRow = {
  id: string;
  parent_company_id: string;
  subcompany_id: string;
  vehicle_id: string;
  occurred_on: string;
  category: MaintenanceCategory;
  description: string;
  amount_gbp: number;
  odometer_miles: number | null;
  paid_to: string;
  paid_by_user_id: string | null;
  paid_by_label: string | null;
  payment_method_id: string;
  payment_account_id: string | null;
  payment_reference: string;
  source: "manual" | "csv" | "excel";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  payment_method_name?: string | null;
  payment_account_name?: string | null;
  paid_by_display?: string | null;
};

export const DEFAULT_PAYMENT_METHOD_NAMES = ["Cash", "Card", "Bank transfer"] as const;

/** Import / Excel column headers (order matters for template). */
export const MAINTENANCE_IMPORT_HEADERS = [
  "occurred_on",
  "category",
  "description",
  "amount_gbp",
  "paid_to",
  "paid_by",
  "payment_method",
  "payment_account",
  "payment_reference",
  "odometer_miles",
  "mot_date",
  "mot_expiry",
  "tax_expiry",
  "phv_start_date",
  "phv_licence_expiry",
  "service_due_at",
  "next_service_mileage",
] as const;

/** @deprecated alias — prefer MAINTENANCE_IMPORT_HEADERS */
export const MAINTENANCE_CSV_HEADERS = MAINTENANCE_IMPORT_HEADERS;

export function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

/** True when this payment method needs a bank/cash account (Cash does not). */
export function paymentMethodRequiresAccount(
  method: Pick<PaymentMethodRow, "name" | "requires_account"> | null | undefined,
): boolean {
  if (!method) return true;
  return normalizeRequiresAccount(method.name, method.requires_account);
}

/**
 * Normalize DB/API `requires_account` for display and validation.
 * Cash never requires an account, even if the column still says true.
 */
export function normalizeRequiresAccount(
  name: string,
  requiresAccount: boolean | null | undefined,
): boolean {
  return requiresAccount !== false && name.trim().toLowerCase() !== "cash";
}

/**
 * Expiry = start/test date + 1 calendar year (same day).
 * Used for MOT and PHV/Taxi licence defaults.
 * Example: 2026-07-19 → 2027-07-19.
 */
export function expiryOneYearFromDate(isoDate: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Prefer an explicit expiry override; otherwise start date + 1 year.
 * `startIso` / `overrideIso` must already be valid YYYY-MM-DD when provided.
 */
export function expiryFromStartOrOverride(
  startIso: string,
  overrideIso?: string | null,
): string | null {
  const override = overrideIso?.trim();
  if (override) return override.slice(0, 10);
  return expiryOneYearFromDate(startIso);
}

/** @deprecated Prefer expiryOneYearFromDate */
export function motExpiryFromTestDate(isoDate: string): string | null {
  return expiryOneYearFromDate(isoDate);
}
