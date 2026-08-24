import type { HirePaymentStatus } from "@/lib/fleet/hire-types";
import type { HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import { roundGbp } from "@/lib/fleet/hire-money";

/** User-facing payment row status for tables and filters. */
export type HirePaymentDisplayStatus =
  | "paid"
  | "partially_paid"
  | "pending_approval"
  | "rejected"
  | "overdue"
  | "due"
  | "upcoming"
  | "cleared"
  | "waived"
  | "refunded"
  | "prepaid_refunded"
  | "prepaid_partially_refunded"
  | "prepaid_settled";

export type HirePaymentDisplayAudience = "driver" | "staff";

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
  "waived",
  "refunded",
  "prepaid_refunded",
  "prepaid_partially_refunded",
  "prepaid_settled",
] as const;

const HIRE_PAYMENT_DISPLAY_STATUS_META_BASE: Record<
  Exclude<HirePaymentDisplayStatus, "refunded">,
  HirePaymentDisplayStatusMeta
> = {
  paid: { label: "Paid", tone: "success" },
  partially_paid: { label: "Partially paid", tone: "warning" },
  pending_approval: { label: "Pending approval", tone: "pending" },
  rejected: { label: "Rejected", tone: "error" },
  overdue: { label: "Overdue", tone: "error" },
  due: { label: "Due", tone: "warning" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  cleared: { label: "Cleared", tone: "success" },
  waived: { label: "Waived — contract ended", tone: "neutral" },
  prepaid_refunded: { label: "Refunded", tone: "success" },
  prepaid_partially_refunded: { label: "Partially refunded", tone: "warning" },
  prepaid_settled: { label: "Settled", tone: "neutral" },
};

export type HirePaymentDisplayStatusInput = {
  id?: string;
  paymentStatus: HirePaymentStatus;
  balanceGbp: number;
  paidGbp: number;
  netDueGbp: number;
  accrued: boolean;
  periodStart: string;
  periodEnd: string;
  pendingSubmittedGbp?: number | null;
};

export type HirePaymentDisplayOptions = {
  /** Last day of the hire (YYYY-MM-DD) when the contract has ended. */
  contractEndedYmd?: string | null;
  /** Final settlement balance has been cleared on the hire record. */
  settlementSettled?: boolean;
  audience?: HirePaymentDisplayAudience;
  /** Company-issued refunds allocated onto schedule row ids. */
  refundMarkByRowId?: ReadonlyMap<string, "refunded" | "partial">;
};

function isPostEndPrepaidRow(
  row: HirePaymentDisplayStatusInput,
  contractEndedYmd: string | null,
): boolean {
  if (!contractEndedYmd || row.periodStart <= contractEndedYmd) return false;
  return row.paidGbp > 0.005 || row.paymentStatus === "approved";
}

/** Derive a human-readable row status from workflow state, balance, and dates. */
export function deriveHirePaymentDisplayStatus(
  row: HirePaymentDisplayStatusInput,
  todayYmd: string,
  options?: HirePaymentDisplayOptions,
): HirePaymentDisplayStatus {
  const contractEndedYmd = options?.contractEndedYmd?.trim() || null;
  if (contractEndedYmd && row.periodStart > contractEndedYmd) {
    if (row.paymentStatus === "pending_approval") return "pending_approval";
    if (row.pendingSubmittedGbp != null && row.pendingSubmittedGbp > 0) return "pending_approval";
    if (isPostEndPrepaidRow(row, contractEndedYmd)) {
      const mark = row.id ? options?.refundMarkByRowId?.get(row.id) : undefined;
      if (mark === "refunded") return "prepaid_refunded";
      if (mark === "partial") return "prepaid_partially_refunded";
      return options?.settlementSettled ? "prepaid_settled" : "refunded";
    }
    return "waived";
  }

  const depositMark = row.id ? options?.refundMarkByRowId?.get(row.id) : undefined;
  if (depositMark === "refunded") return "prepaid_refunded";
  if (depositMark === "partial") return "prepaid_partially_refunded";

  if (row.paymentStatus === "pending_approval") return "pending_approval";
  if (row.pendingSubmittedGbp != null && row.pendingSubmittedGbp > 0) return "pending_approval";
  // Rejected early submissions on future periods are not actionable until the period starts.
  if (row.paymentStatus === "rejected" && row.accrued) return "rejected";

  if (row.balanceGbp <= 0) {
    if (row.netDueGbp <= 0) return "cleared";
    return "paid";
  }

  if (row.paidGbp > 0) return "partially_paid";
  if (!row.accrued) return "upcoming";
  if (row.periodEnd < todayYmd) return "overdue";
  return "due";
}

export function hirePaymentDisplayStatusMeta(
  status: HirePaymentDisplayStatus,
  options?: Pick<HirePaymentDisplayOptions, "audience">,
): HirePaymentDisplayStatusMeta {
  if (status === "refunded") {
    return options?.audience === "staff"
      ? { label: "Prepaid — refund due", tone: "warning" }
      : { label: "Refund expected", tone: "success" };
  }
  return HIRE_PAYMENT_DISPLAY_STATUS_META_BASE[status];
}

export function hirePaymentDisplayStatusLabel(
  row: HirePaymentDisplayStatusInput,
  todayYmd: string,
  options?: HirePaymentDisplayOptions,
): string {
  const status = deriveHirePaymentDisplayStatus(row, todayYmd, options);
  return hirePaymentDisplayStatusMeta(status, options).label;
}

/** Driver/staff submission awaiting approval — falls back to row balance when amount is missing. */
export function hirePaymentPendingApprovalAmountGbp(
  row: Pick<HirePaymentDisplayStatusInput, "paymentStatus" | "pendingSubmittedGbp" | "balanceGbp">,
): number {
  if (row.paymentStatus !== "pending_approval") return 0;
  const submitted = row.pendingSubmittedGbp;
  if (submitted != null && Number.isFinite(submitted) && submitted > 0.005) {
    return roundGbp(submitted);
  }
  return roundGbp(Math.max(0, row.balanceGbp));
}
