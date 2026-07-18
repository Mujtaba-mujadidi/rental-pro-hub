/** Shared types for vehicle maintenance expenses and company payment lookups. */

export const MAINTENANCE_CATEGORIES = [
  "service",
  "mot",
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
  payment_account_id: string;
  source: "manual" | "csv";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Joined display */
  payment_method_name?: string | null;
  payment_account_name?: string | null;
  paid_by_display?: string | null;
};

export const DEFAULT_PAYMENT_METHOD_NAMES = ["Cash", "Card", "Bank transfer"] as const;

export const MAINTENANCE_CSV_HEADERS = [
  "occurred_on",
  "category",
  "description",
  "amount_gbp",
  "paid_to",
  "paid_by",
  "payment_method",
  "payment_account",
  "odometer_miles",
] as const;

export function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}
