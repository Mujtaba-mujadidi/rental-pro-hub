import { formatUkDateText, ukTodayYmd } from "@/lib/datetime/uk";
import {
  hireGroupTableStatus,
  type HireTableStatusTone,
} from "@/lib/fleet/hire-contract-table-display";
import { subcompanyHireRentLabel } from "@/lib/rental/subcompany-hires-display";

/** Fleet Hires list tabs (lifecycle buckets + attention). */
export const HIRE_LIST_TABS = [
  "needs_action",
  "active",
  "scheduled",
  "ended",
  "all",
] as const;

export type HireListTab = (typeof HIRE_LIST_TABS)[number];

export const HIRE_LIST_TAB_OPTIONS: { value: HireListTab; label: string }[] = [
  { value: "needs_action", label: "Needs action" },
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "ended", label: "Completed" },
  { value: "all", label: "All" },
];

export type HireListRowLike = {
  status: string;
  wizard_step?: number;
  start_date: string | null;
  activated_at: string | null;
  terminated_at: string | null;
  ended_at: string | null;
  /** End-hire wizard in progress — keep on Active tab until explicit finalisation. */
  end_hire_in_progress?: boolean;
  rent_amount_gbp: number;
  rent_cadence: string;
  lifecycle_label: string | null;
  lifecycle_tone: HireTableStatusTone;
  can_prepare_for_signature: boolean;
  can_send_for_signature: boolean;
  esign_label: string;
  esign_tone: HireTableStatusTone;
  driver_access_status: string;
  driver_access_label: string;
  driver_access_tone: HireTableStatusTone;
};

export function isHireListScheduledStatus(status: string): boolean {
  return status === "reserved" || status === "pending_signature";
}

export function isHireListEndedStatus(row: Pick<HireListRowLike, "status" | "end_hire_in_progress">): boolean {
  if (row.end_hire_in_progress) return false;
  return row.status === "completed" || row.status === "terminated";
}

/**
 * Staff attention from fields already on the hire list row.
 * Does not invent payment amounts — those are not loaded on the list today.
 */
export function hireListNeedsAction(row: HireListRowLike): boolean {
  if (row.status === "draft") return true;
  if (row.lifecycle_label) return true;
  if (row.can_prepare_for_signature || row.can_send_for_signature) return true;
  if (
    (row.status === "pending_signature" || row.status === "reserved") &&
    (row.esign_tone === "pending" || row.esign_tone === "warning")
  ) {
    return true;
  }
  if (
    (row.status === "active" ||
      row.status === "reserved" ||
      row.status === "pending_signature") &&
    (row.driver_access_tone === "pending" ||
      row.driver_access_tone === "warning" ||
      row.driver_access_tone === "error")
  ) {
    return true;
  }
  return false;
}

export function hireListMatchesTab(row: HireListRowLike, tab: HireListTab): boolean {
  if (tab === "all") return true;
  if (tab === "needs_action") return hireListNeedsAction(row);
  if (tab === "active") {
    return row.status === "active" || row.status === "ending" || row.end_hire_in_progress === true;
  }
  if (tab === "scheduled") return isHireListScheduledStatus(row.status);
  if (tab === "ended") return isHireListEndedStatus(row);
  return false;
}

function endedYmd(row: HireListRowLike): string | null {
  const raw = row.ended_at || row.terminated_at;
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

function ukMonthPrefix(todayYmd = ukTodayYmd()): string {
  return todayYmd.slice(0, 7);
}

export type HireListStats = {
  activeCount: number;
  scheduledCount: number;
  completedThisMonthCount: number;
  needsActionCount: number;
};

export function buildHireListStats(
  rows: readonly HireListRowLike[],
  todayYmd = ukTodayYmd(),
): HireListStats {
  const month = ukMonthPrefix(todayYmd);
  let activeCount = 0;
  let scheduledCount = 0;
  let completedThisMonthCount = 0;
  let needsActionCount = 0;
  for (const row of rows) {
    if (row.status === "active" || row.status === "ending" || row.end_hire_in_progress) activeCount += 1;
    if (isHireListScheduledStatus(row.status)) scheduledCount += 1;
    if (isHireListEndedStatus(row)) {
      const end = endedYmd(row);
      if (end && end.startsWith(month)) completedThisMonthCount += 1;
    }
    if (hireListNeedsAction(row)) needsActionCount += 1;
  }
  return { activeCount, scheduledCount, completedThisMonthCount, needsActionCount };
}

/** Prefer Needs action when anything needs staff work; otherwise Active. */
export function defaultHireListTab(stats: HireListStats): HireListTab {
  return stats.needsActionCount > 0 ? "needs_action" : "active";
}

export function hireListPeriodLabel(row: HireListRowLike): string {
  const startRaw = row.activated_at?.slice(0, 10) ?? row.start_date;
  const start = startRaw ? formatUkDateText(startRaw) : null;

  if (row.status === "active" || row.end_hire_in_progress) {
    return start ? `${start} — Ongoing` : "Ongoing";
  }

  if (isHireListEndedStatus(row)) {
    const endRaw = endedYmd(row);
    const end = endRaw ? formatUkDateText(endRaw) : null;
    if (start && end) return `${start} — ${end}`;
    if (start) return start;
    if (end) return `Ended ${end}`;
    return "—";
  }

  if (isHireListScheduledStatus(row.status) || row.status === "draft") {
    return start ? `Starts ${start}` : "—";
  }

  return start ?? "—";
}

export function hireListRentLabel(row: Pick<HireListRowLike, "rent_amount_gbp" | "rent_cadence">): string {
  return subcompanyHireRentLabel(row);
}

export type HireListProgress = {
  label: string;
  tone: HireTableStatusTone;
  detail: string | null;
};

function hireListProgressDetail(row: HireListRowLike): string | null {
  const parts: string[] = [];
  if (row.driver_access_status === "approved") {
    parts.push("Access on");
  } else if (row.driver_access_label && row.driver_access_label !== "—") {
    parts.push(row.driver_access_label);
  }
  if (row.esign_tone === "success") {
    parts.push("E-sign complete");
  } else if (row.esign_label && row.esign_label !== "—") {
    parts.push(row.esign_label);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Progress pill from existing list fields only (lifecycle, e-sign, access). */
export function hireListProgress(row: HireListRowLike): HireListProgress {
  const detail = hireListProgressDetail(row);

  if (row.lifecycle_label) {
    return { label: row.lifecycle_label, tone: row.lifecycle_tone, detail };
  }

  if (row.status === "draft") {
    const step = row.wizard_step;
    return {
      label: step != null ? `Draft · step ${step}` : "Draft",
      tone: "neutral",
      detail,
    };
  }

  if (
    row.can_prepare_for_signature ||
    row.can_send_for_signature ||
    ((row.status === "pending_signature" || row.status === "reserved") &&
      (row.esign_tone === "pending" || row.esign_tone === "warning"))
  ) {
    return {
      label: row.esign_label && row.esign_label !== "—" ? row.esign_label : "Awaiting signature",
      tone: row.esign_tone === "neutral" ? "pending" : row.esign_tone,
      detail,
    };
  }

  if (
    (row.status === "active" || row.status === "reserved" || row.status === "pending_signature") &&
    (row.driver_access_tone === "pending" ||
      row.driver_access_tone === "warning" ||
      row.driver_access_tone === "error")
  ) {
    return { label: row.driver_access_label, tone: row.driver_access_tone, detail };
  }

  if (row.status === "active" || row.status === "reserved") {
    return { label: "Ready", tone: "success", detail };
  }

  if (row.end_hire_in_progress) {
    return { label: "Ending hire", tone: "warning", detail };
  }

  const status = hireGroupTableStatus(row.status, { wizardStep: row.wizard_step });
  return { label: status.label, tone: status.tone, detail };
}
