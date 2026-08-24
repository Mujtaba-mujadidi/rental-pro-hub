import {
  deriveHireEnvelopePreparationStatus,
  type HireEnvelopeReadyRow,
} from "@/lib/fleet/hire-envelope-readiness";
import { formatUkCalendarDateTime, formatUkDateTime } from "@/lib/datetime/uk";
import { HIRE_PDF_DEFAULT_START_TIME, normalizeHireTime } from "@/lib/fleet/hire-pdf-details";

export type HireTableStatusTone = "neutral" | "pending" | "success" | "warning" | "error";

export type HireTableStatus = {
  label: string;
  tone: HireTableStatusTone;
};

export const DRIVER_ACCESS_TABLE_STATUS: Record<string, HireTableStatus> = {
  not_requested: { label: "Not requested", tone: "neutral" },
  pending: { label: "Pending approval", tone: "pending" },
  awaiting_registration: { label: "Awaiting registration", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "error" },
};

export function driverAccessTableStatus(status: string): HireTableStatus {
  return (
    DRIVER_ACCESS_TABLE_STATUS[status] ?? {
      label: status.replace(/_/g, " "),
      tone: "neutral",
    }
  );
}

/** Primary hire-group status for contracts tables (fleet hires list, vehicle rentals). */
export function hireGroupTableStatus(
  status: string,
  options?: { wizardStep?: number },
): HireTableStatus {
  if (status === "draft") {
    const step = options?.wizardStep;
    return {
      label: step != null ? `Draft · step ${step}` : "Draft",
      tone: "neutral",
    };
  }
  switch (status) {
    case "active":
      return { label: "On rent", tone: "success" };
    case "ending":
      return { label: "Ending hire", tone: "warning" };
    case "reserved":
      return { label: "Reserved", tone: "pending" };
    case "pending_signature":
      return { label: "Pending signature", tone: "pending" };
    case "terminated":
      return { label: "Contract ended", tone: "warning" };
    case "completed":
      return { label: "Hire completed", tone: "success" };
    case "cancelled":
      return { label: "Cancelled", tone: "error" };
    default:
      return { label: status.replace(/_/g, " "), tone: "neutral" };
  }
}

export function hireEsignTableStatus(input: {
  groupStatus: string;
  agreementCount: number;
  envelopeRows: HireEnvelopeReadyRow[];
  signingBundleSentAt: string | null;
  allAgreementsSigned: boolean;
}): HireTableStatus {
  if (input.agreementCount === 0) {
    return { label: "—", tone: "neutral" };
  }
  if (input.allAgreementsSigned) {
    return { label: "Fully signed", tone: "success" };
  }
  if (!input.envelopeRows.length) {
    if (input.groupStatus === "draft") return { label: "Draft", tone: "neutral" };
    return { label: "Contracts created", tone: "neutral" };
  }

  const signedCount = input.envelopeRows.filter((row) => row.signed).length;
  const total = input.envelopeRows.length;

  if (input.signingBundleSentAt) {
    if (signedCount > 0 && signedCount < total) {
      return { label: `Hirer signed ${signedCount}/${total}`, tone: "pending" };
    }
    return { label: "Awaiting hirer", tone: "pending" };
  }

  const prepStatuses = input.envelopeRows.map((row) =>
    deriveHireEnvelopePreparationStatus({
      envelopeId: row.envelopeId,
      status: row.status,
      requiresOwner: row.requiresOwner,
      ownerSignedAt: row.ownerSignedAt,
      fieldLayout: row.fieldLayout,
      signed: row.signed,
    }),
  );

  if (prepStatuses.every((status) => status === "lessor_signed" || status === "ready_to_send")) {
    return { label: "Ready to send", tone: "success" };
  }
  if (prepStatuses.some((status) => status === "awaiting_lessor")) {
    return { label: "Awaiting lessor", tone: "pending" };
  }
  if (prepStatuses.every((status) => status === "choose_signing")) {
    return { label: "Prepare documents", tone: "pending" };
  }

  return { label: "Preparing documents", tone: "pending" };
}

export function hireTableStatusToneClass(tone: HireTableStatusTone): string {
  switch (tone) {
    case "pending":
      return "border-amber-300/80 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100";
    case "success":
      return "border-emerald-300/80 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100";
    case "warning":
      return "border-amber-300/80 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100";
    case "error":
      return "border-red-300/80 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-100";
    default:
      return "border-rph-border bg-rph-chrome/50 text-rph-fg-secondary";
  }
}

export type HireContractTableDateRow = {
  activated_at: string | null;
  start_date: string | null;
  start_time: string | null;
  end_time: string | null;
  scheduled_end_date: string | null;
  terminated_at: string | null;
  ended_at: string | null;
};

/** Hires table — when the hire actually started (or is scheduled to). */
export function hireContractTableStartLabel(row: HireContractTableDateRow): string {
  if (row.activated_at) return formatUkDateTime(row.activated_at);
  if (row.start_date) {
    return `Scheduled ${formatUkCalendarDateTime(
      row.start_date,
      normalizeHireTime(row.start_time, HIRE_PDF_DEFAULT_START_TIME),
    )}`;
  }
  return "—";
}

/** Hires table — when the hire actually ended (termination or check-in complete). */
export function hireContractTableEndLabel(row: HireContractTableDateRow): string {
  if (row.terminated_at) return formatUkDateTime(row.terminated_at);
  if (row.ended_at) return formatUkDateTime(row.ended_at);
  return "—";
}
