import { formatUkDateText, ukTodayYmd } from "@/lib/datetime/uk";
import type { HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import { formatGbp } from "@/lib/fleet/maintenance";

export type SubcompanyHireRowLike = {
  status: string;
  start_date: string | null;
  activated_at: string | null;
  terminated_at: string | null;
  ended_at: string | null;
  rent_amount_gbp: number;
  rent_cadence: string;
  esign_label: string;
  esign_tone: HireTableStatusTone;
  signed_agreement_count: number;
  agreement_count: number;
  can_view_signed_documents: boolean;
  driver_name: string | null;
  driver_email: string | null;
  driver_label: string | null;
};

export function isSubcompanyCurrentHireStatus(status: string): boolean {
  return status === "active" || status === "reserved" || status === "pending_signature";
}

export function isSubcompanyScheduledHireStatus(status: string): boolean {
  return status === "reserved" || status === "pending_signature";
}

export function subcompanyHirePeriodLabel(row: SubcompanyHireRowLike): string {
  if (row.status === "active") {
    const start =
      (row.start_date && formatUkDateText(row.start_date)) ||
      (row.activated_at && formatUkDateText(row.activated_at)) ||
      null;
    return start ? `${start} — Ongoing` : "Ongoing";
  }
  if (row.start_date) {
    return `Starts ${formatUkDateText(row.start_date)}`;
  }
  return "—";
}

export function subcompanyHireRentLabel(row: Pick<SubcompanyHireRowLike, "rent_amount_gbp" | "rent_cadence">): string {
  if (!(row.rent_amount_gbp > 0)) return "—";
  const cadence = row.rent_cadence.trim().toLowerCase();
  const pretty =
    cadence === "day" || cadence === "daily"
      ? "Day"
      : cadence === "week" || cadence === "weekly"
        ? "Week"
        : cadence === "month" || cadence === "monthly"
          ? "Month"
          : row.rent_cadence.trim() || "—";
  return `£${row.rent_amount_gbp.toFixed(2)} / ${pretty}`;
}

export function subcompanyHireDriverLabel(row: SubcompanyHireRowLike): string {
  return row.driver_name?.trim() || row.driver_label?.trim() || row.driver_email?.trim() || "—";
}

export function subcompanyHireAgreementBadge(row: SubcompanyHireRowLike): {
  label: string;
  tone: HireTableStatusTone;
} {
  if (
    row.can_view_signed_documents &&
    row.agreement_count > 0 &&
    row.signed_agreement_count >= row.agreement_count
  ) {
    return { label: "Signed", tone: "success" };
  }
  if (row.esign_tone === "success") {
    return { label: "Signed", tone: "success" };
  }
  const raw = row.esign_label.trim();
  if (!raw || raw === "—") {
    return { label: "Awaiting signature", tone: "pending" };
  }
  if (/awaiting|pending|prepare|hirer|lessor/i.test(raw)) {
    return { label: "Awaiting signature", tone: "pending" };
  }
  if (/signed|fully/i.test(raw)) {
    return { label: "Signed", tone: "success" };
  }
  return { label: raw, tone: row.esign_tone };
}

export function subcompanyHireStatusBadge(status: string): {
  label: string;
  tone: "active" | "scheduled" | "other";
  tableTone: HireTableStatusTone;
} {
  if (status === "active") {
    return { label: "Active", tone: "active", tableTone: "pending" };
  }
  if (isSubcompanyScheduledHireStatus(status)) {
    return { label: "Scheduled", tone: "scheduled", tableTone: "pending" };
  }
  if (status === "draft") {
    return { label: "Draft", tone: "other", tableTone: "neutral" };
  }
  if (status === "completed") {
    return { label: "Completed", tone: "other", tableTone: "success" };
  }
  if (status === "terminated") {
    return { label: "Ended", tone: "other", tableTone: "warning" };
  }
  return { label: status.replace(/_/g, " "), tone: "other", tableTone: "neutral" };
}

function endedYmd(row: SubcompanyHireRowLike): string | null {
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

export function buildSubcompanyHiresStats(
  rows: readonly SubcompanyHireRowLike[],
  incomeThisMonthGbp: number,
  todayYmd = ukTodayYmd(),
): {
  activeCount: number;
  scheduledCount: number;
  completedThisMonthCount: number;
  incomeThisMonthLabel: string;
} {
  const month = ukMonthPrefix(todayYmd);
  let activeCount = 0;
  let scheduledCount = 0;
  let completedThisMonthCount = 0;
  for (const row of rows) {
    if (row.status === "active") activeCount += 1;
    if (isSubcompanyScheduledHireStatus(row.status)) scheduledCount += 1;
    if (row.status === "completed" || row.status === "terminated") {
      const end = endedYmd(row);
      if (end && end.startsWith(month)) completedThisMonthCount += 1;
    }
  }
  return {
    activeCount,
    scheduledCount,
    completedThisMonthCount,
    incomeThisMonthLabel: formatGbp(incomeThisMonthGbp),
  };
}
