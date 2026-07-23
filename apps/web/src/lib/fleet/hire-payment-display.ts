import type { HirePaymentStatus } from "@/lib/fleet/hire-types";
import type { HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";

/** User-facing payment row status for tables and filters. */
export type HirePaymentDisplayStatus =
  | "paid"
  | "partially_paid"
  | "pending_approval"
  | "rejected"
  | "overdue"
  | "due"
  | "upcoming"
  | "cleared";

export type HirePaymentDisplayStatusMeta = {
  label: string;
  tone: HireTableStatusTone;
};

export const HIRE_PAYMENT_DISPLAY_STATUSES: readonly HirePaymentDisplayStatus[] = [
  "paid",
  "partially_paid",
  "pending_approval",
  "rejected",
  "overdue",
  "due",
  "upcoming",
  "cleared",
] as const;

export const HIRE_PAYMENT_DISPLAY_STATUS_META: Record<HirePaymentDisplayStatus, HirePaymentDisplayStatusMeta> = {
  paid: { label: "Paid", tone: "success" },
  partially_paid: { label: "Partially paid", tone: "warning" },
  pending_approval: { label: "Pending approval", tone: "pending" },
  rejected: { label: "Rejected", tone: "error" },
  overdue: { label: "Overdue", tone: "error" },
  due: { label: "Due", tone: "warning" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  cleared: { label: "Cleared", tone: "success" },
};

export type HirePaymentDisplayStatusInput = {
  paymentStatus: HirePaymentStatus;
  balanceGbp: number;
  paidGbp: number;
  netDueGbp: number;
  accrued: boolean;
  periodEnd: string;
  pendingSubmittedGbp?: number | null;
};

/** Derive a human-readable row status from workflow state, balance, and dates. */
export function deriveHirePaymentDisplayStatus(
  row: HirePaymentDisplayStatusInput,
  todayYmd: string,
): HirePaymentDisplayStatus {
  if (row.paymentStatus === "pending_approval") return "pending_approval";
  if (row.paymentStatus === "rejected") return "rejected";
  if (row.pendingSubmittedGbp != null && row.pendingSubmittedGbp > 0) return "pending_approval";

  if (row.balanceGbp <= 0) {
    if (row.netDueGbp <= 0) return "cleared";
    return "paid";
  }

  if (row.paidGbp > 0) return "partially_paid";
  if (!row.accrued) return "upcoming";
  if (row.periodEnd < todayYmd) return "overdue";
  return "due";
}

export function hirePaymentDisplayStatusMeta(status: HirePaymentDisplayStatus): HirePaymentDisplayStatusMeta {
  return HIRE_PAYMENT_DISPLAY_STATUS_META[status];
}

export function hirePaymentDisplayStatusLabel(
  row: HirePaymentDisplayStatusInput,
  todayYmd: string,
): string {
  return hirePaymentDisplayStatusMeta(deriveHirePaymentDisplayStatus(row, todayYmd)).label;
}
