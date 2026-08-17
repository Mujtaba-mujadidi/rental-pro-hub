/**
 * Company Balances page — pure summary over hire schedule + settlement facts.
 * UI and server action must both use these helpers so KPI cards match table rows.
 */

import { ukTodayYmd } from "@/lib/datetime/uk";
import {
  endedHireDriverOwesCompanyGbp,
  isEndedHireStatus,
  scheduleRowPaidInWindowGbp,
  type DashboardHireFact,
  type DashboardScheduleFact,
} from "@/lib/fleet/company-dashboard-display";
import { resolveCompanyDashboardPeriod } from "@/lib/fleet/company-dashboard-period";
import {
  hirePaymentRowBalanceGbp,
  isHirePaymentRowAccrued,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import { computeHireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";
import type { HirePaymentStatus } from "@/lib/fleet/hire-types";

export const COMPANY_BALANCES_TABS = ["open", "settled", "activity"] as const;
export type CompanyBalancesTab = (typeof COMPANY_BALANCES_TABS)[number];

export const COMPANY_BALANCES_TAB_OPTIONS: { value: CompanyBalancesTab; label: string }[] = [
  { value: "open", label: "Open balances" },
  { value: "settled", label: "Settled" },
  { value: "activity", label: "All activity" },
];

export type CompanyBalancesOpenKind = "rent_due" | "settlement" | "refund_owed" | "pending_approval";

export type CompanyBalancesHireFact = Pick<
  DashboardHireFact,
  | "id"
  | "status"
  | "settlementBalanceDirection"
  | "settlementOpenBalanceGbp"
  | "rentBillingMode"
  | "rentCadence"
  | "terminatedAtYmd"
  | "endedAtYmd"
> & {
  vehicleVrm: string | null;
  driverLabel: string | null;
};

export type CompanyBalancesScheduleFact = DashboardScheduleFact & {
  scheduleRowId: string;
  pendingSubmittedGbp: number | null;
};

export type CompanyBalancesSettlementPaymentFact = {
  id: string;
  hireGroupId: string;
  amountGbp: number;
  direction: "received_from_driver" | "paid_to_driver";
  paymentCategory: string;
  paidAt: string;
  vehicleVrm: string | null;
  driverLabel: string | null;
};

export type CompanyBalancesOpenRow = {
  id: string;
  hireGroupId: string;
  kind: CompanyBalancesOpenKind;
  kindLabel: string;
  vehicleVrm: string | null;
  driverLabel: string | null;
  amountGbp: number;
  /** ISO timestamp or calendar YMD for display sorting. */
  at: string | null;
  href: string;
};

export type CompanyBalancesSettledRow = {
  hireGroupId: string;
  vehicleVrm: string | null;
  driverLabel: string | null;
  settledAt: string | null;
  href: string;
};

export type CompanyBalancesActivityRow = {
  id: string;
  hireGroupId: string;
  title: string;
  detail: string;
  amountGbp: number;
  at: string;
  href: string;
};

export type CompanyBalancesKpis = {
  /** Company owes drivers (open settlement refunds). */
  openBalanceGbp: number;
  openBalanceHireCount: number;
  /** Drivers owe company (active rent arrears + ended settlement). */
  driverPaymentsDueGbp: number;
  driverPaymentsDueHireCount: number;
  collectedThisMonthGbp: number;
  collectedThisMonthPaymentCount: number;
  pendingApprovalGbp: number;
  pendingApprovalCount: number;
};

export type CompanyBalancesPageData = {
  kpis: CompanyBalancesKpis;
  openRows: CompanyBalancesOpenRow[];
  settledRows: CompanyBalancesSettledRow[];
  activityRows: CompanyBalancesActivityRow[];
  defaultTab: CompanyBalancesTab;
  monthStartYmd: string;
  monthEndYmd: string;
};

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

function toScheduleInput(row: CompanyBalancesScheduleFact): HirePaymentScheduleRowInput {
  return {
    id: row.scheduleRowId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind === "deposit" ? "deposit" : "rent",
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: row.pendingSubmittedGbp,
    sortOrder: 0,
  };
}

function toDashboardHire(hire: CompanyBalancesHireFact): DashboardHireFact {
  return {
    id: hire.id,
    vehicleId: "",
    subcompanyId: "",
    status: hire.status,
    startDateYmd: null,
    activatedAtYmd: null,
    endedAtYmd: hire.endedAtYmd,
    terminatedAtYmd: hire.terminatedAtYmd,
    rentAmountGbp: 0,
    rentCadence: hire.rentCadence,
    unsignedAgreementCount: 0,
    insuranceStatus: "none",
    settlementBalanceDirection: hire.settlementBalanceDirection,
    settlementOpenBalanceGbp: hire.settlementOpenBalanceGbp,
    rentBillingMode: hire.rentBillingMode,
  };
}

function toDashboardSchedule(row: CompanyBalancesScheduleFact): DashboardScheduleFact {
  return {
    hireGroupId: row.hireGroupId,
    vehicleId: "",
    subcompanyId: "",
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
  };
}

export function companyBalancesKindLabel(kind: CompanyBalancesOpenKind): string {
  if (kind === "rent_due") return "Rent due";
  if (kind === "settlement") return "Settlement";
  if (kind === "refund_owed") return "Refund owed";
  return "Pending approval";
}

export function companyBalancesOpenHref(kind: CompanyBalancesOpenKind, hireGroupId: string): string {
  if (kind === "settlement" || kind === "refund_owed") {
    return `/rental/balances/${hireGroupId}`;
  }
  return `/rental/hires/${hireGroupId}/payments`;
}

export function companyBalancesKpiSubtext(kpis: CompanyBalancesKpis): {
  openBalance: string;
  driverPaymentsDue: string;
  collectedThisMonth: string;
  pendingApproval: string;
} {
  return {
    openBalance:
      kpis.openBalanceHireCount === 0
        ? "Company-level balance"
        : `${kpis.openBalanceHireCount.toLocaleString("en-GB")} ${
            kpis.openBalanceHireCount === 1 ? "refund" : "refunds"
          }`,
    driverPaymentsDue:
      kpis.driverPaymentsDueHireCount === 0
        ? "No hires due"
        : `${kpis.driverPaymentsDueHireCount.toLocaleString("en-GB")} ${
            kpis.driverPaymentsDueHireCount === 1 ? "hire" : "hires"
          }`,
    collectedThisMonth:
      kpis.collectedThisMonthPaymentCount === 0
        ? "No collections yet"
        : `${kpis.collectedThisMonthPaymentCount.toLocaleString("en-GB")} ${
            kpis.collectedThisMonthPaymentCount === 1 ? "payment" : "payments"
          }`,
    pendingApproval:
      kpis.pendingApprovalCount === 0
        ? "No submissions waiting"
        : `${kpis.pendingApprovalCount.toLocaleString("en-GB")} ${
            kpis.pendingApprovalCount === 1 ? "submission" : "submissions"
          }`,
  };
}

export function defaultCompanyBalancesTab(kpis: CompanyBalancesKpis): CompanyBalancesTab {
  if (kpis.driverPaymentsDueGbp > 0.005 || kpis.openBalanceGbp > 0.005 || kpis.pendingApprovalGbp > 0.005) {
    return "open";
  }
  return "settled";
}

/** Open settlement where the company owes the driver. */
export function endedHireCompanyOwesDriverGbp(hire: CompanyBalancesHireFact): number {
  if (!isEndedHireStatus(hire.status)) return 0;
  const balance = computeHireWorkspaceSettlementBalance({
    settlementBalanceDirection: hire.settlementBalanceDirection,
    settlementBalanceGbp: hire.settlementOpenBalanceGbp,
  });
  if (!balance || balance.settlementDirection !== "company_owes_driver") return 0;
  if (balance.openBalanceGbp <= 0.005) return 0;
  return balance.openBalanceGbp;
}

/**
 * Accrued rent still chaseable on a schedule row.
 * Pending submissions are not chased again; any shortfall after a partial submit stays due.
 */
export function chaseableScheduleRentGbp(row: CompanyBalancesScheduleFact, todayYmd: string): number {
  if (row.rowKind !== "rent") return 0;
  const schedule = toScheduleInput(row);
  if (!isHirePaymentRowAccrued(schedule, todayYmd)) return 0;
  const balance = hirePaymentRowBalanceGbp(schedule);
  if (balance <= 0.005) return 0;

  if (row.paymentStatus !== ("pending_approval" as HirePaymentStatus)) {
    return roundGbp(balance);
  }

  const submittedRaw = row.pendingSubmittedGbp;
  const submitted =
    submittedRaw != null && Number.isFinite(submittedRaw) && submittedRaw > 0.005
      ? roundGbp(submittedRaw)
      : roundGbp(balance);
  return roundGbp(Math.max(0, balance - submitted));
}

export function pendingApprovalAmountGbp(row: CompanyBalancesScheduleFact): number {
  if (row.paymentStatus !== ("pending_approval" as HirePaymentStatus)) return 0;
  const schedule = toScheduleInput(row);
  const balance = Math.max(0, hirePaymentRowBalanceGbp(schedule));
  const submitted = row.pendingSubmittedGbp;
  if (submitted != null && Number.isFinite(submitted) && submitted > 0.005) {
    return roundGbp(submitted);
  }
  return roundGbp(balance);
}

export function buildCompanyBalancesOpenRows(input: {
  hires: readonly CompanyBalancesHireFact[];
  scheduleRows: readonly CompanyBalancesScheduleFact[];
  todayYmd: string;
}): CompanyBalancesOpenRow[] {
  const rows: CompanyBalancesOpenRow[] = [];
  const hireById = new Map(input.hires.map((h) => [h.id, h]));
  const dueByHireId = new Map<string, number>();

  for (const hire of input.hires) {
    if (!isEndedHireStatus(hire.status)) continue;
    const owed = endedHireDriverOwesCompanyGbp(toDashboardHire(hire), input.scheduleRows.map(toDashboardSchedule));
    if (owed <= 0.005) continue;
    dueByHireId.set(hire.id, owed);
  }

  for (const row of input.scheduleRows) {
    const hire = hireById.get(row.hireGroupId);
    if (!hire || isEndedHireStatus(hire.status) || hire.status === "cancelled" || hire.status === "draft") {
      continue;
    }
    const chaseable = chaseableScheduleRentGbp(row, input.todayYmd);
    if (chaseable <= 0.005) continue;
    dueByHireId.set(row.hireGroupId, roundGbp((dueByHireId.get(row.hireGroupId) ?? 0) + chaseable));
  }

  for (const [hireId, amountGbp] of dueByHireId) {
    const hire = hireById.get(hireId);
    if (!hire || amountGbp <= 0.005) continue;
    const ended = isEndedHireStatus(hire.status);
    const kind: CompanyBalancesOpenKind = ended ? "settlement" : "rent_due";
    rows.push({
      id: `${kind}:${hireId}`,
      hireGroupId: hireId,
      kind,
      kindLabel: companyBalancesKindLabel(kind),
      vehicleVrm: hire.vehicleVrm,
      driverLabel: hire.driverLabel,
      amountGbp: roundGbp(amountGbp),
      at: ended ? hire.terminatedAtYmd ?? hire.endedAtYmd : null,
      href: companyBalancesOpenHref(kind, hireId),
    });
  }

  for (const hire of input.hires) {
    const amountGbp = endedHireCompanyOwesDriverGbp(hire);
    if (amountGbp <= 0.005) continue;
    rows.push({
      id: `refund_owed:${hire.id}`,
      hireGroupId: hire.id,
      kind: "refund_owed",
      kindLabel: companyBalancesKindLabel("refund_owed"),
      vehicleVrm: hire.vehicleVrm,
      driverLabel: hire.driverLabel,
      amountGbp,
      at: hire.terminatedAtYmd ?? hire.endedAtYmd,
      href: companyBalancesOpenHref("refund_owed", hire.id),
    });
  }

  for (const row of input.scheduleRows) {
    const amountGbp = pendingApprovalAmountGbp(row);
    if (amountGbp <= 0.005) continue;
    const hire = hireById.get(row.hireGroupId);
    if (!hire || hire.status === "cancelled" || hire.status === "draft") continue;
    rows.push({
      id: `pending_approval:${row.scheduleRowId}`,
      hireGroupId: row.hireGroupId,
      kind: "pending_approval",
      kindLabel: companyBalancesKindLabel("pending_approval"),
      vehicleVrm: hire.vehicleVrm,
      driverLabel: hire.driverLabel,
      amountGbp,
      at: row.periodStart,
      href: companyBalancesOpenHref("pending_approval", row.hireGroupId),
    });
  }

  rows.sort((a, b) => {
    if (b.amountGbp !== a.amountGbp) return b.amountGbp - a.amountGbp;
    return (b.at ?? "").localeCompare(a.at ?? "");
  });
  return rows;
}

export function buildCompanyBalancesSettledRows(
  hires: readonly CompanyBalancesHireFact[],
): CompanyBalancesSettledRow[] {
  const rows: CompanyBalancesSettledRow[] = [];
  for (const hire of hires) {
    if (!isEndedHireStatus(hire.status)) continue;
    if (hire.settlementBalanceDirection !== "settled") continue;
    rows.push({
      hireGroupId: hire.id,
      vehicleVrm: hire.vehicleVrm,
      driverLabel: hire.driverLabel,
      settledAt: hire.terminatedAtYmd ?? hire.endedAtYmd,
      href: `/rental/balances/${hire.id}`,
    });
  }
  rows.sort((a, b) => (b.settledAt ?? "").localeCompare(a.settledAt ?? ""));
  return rows;
}

function paidAtYmd(paidAt: string): string | null {
  const raw = paidAt.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function buildCompanyBalancesActivityRows(input: {
  hires: readonly CompanyBalancesHireFact[];
  scheduleRows: readonly CompanyBalancesScheduleFact[];
  settlementPayments: readonly CompanyBalancesSettlementPaymentFact[];
  monthStartYmd: string;
  monthEndYmd: string;
}): CompanyBalancesActivityRow[] {
  const hireById = new Map(input.hires.map((h) => [h.id, h]));
  const rows: CompanyBalancesActivityRow[] = [];

  for (const row of input.scheduleRows) {
    if (row.rowKind !== "rent") continue;
    const paid = scheduleRowPaidInWindowGbp(row, input.monthStartYmd, input.monthEndYmd);
    if (paid <= 0.005) continue;
    const hire = hireById.get(row.hireGroupId);
    rows.push({
      id: `schedule:${row.scheduleRowId}`,
      hireGroupId: row.hireGroupId,
      title: "Rent collected",
      detail: [hire?.vehicleVrm, hire?.driverLabel].filter(Boolean).join(" · ") || "Hire payment",
      amountGbp: roundGbp(paid),
      at: `${row.periodStart}T00:00:00.000Z`,
      href: `/rental/hires/${row.hireGroupId}/payments`,
    });
  }

  for (const payment of input.settlementPayments) {
    if (payment.direction !== "received_from_driver") continue;
    const ymd = paidAtYmd(payment.paidAt);
    if (!ymd || ymd < input.monthStartYmd || ymd > input.monthEndYmd) continue;
    const amount = roundGbp(Math.abs(Number(payment.amountGbp) || 0));
    if (amount <= 0.005) continue;
    rows.push({
      id: `settlement:${payment.id}`,
      hireGroupId: payment.hireGroupId,
      title: payment.paymentCategory === "driver_charge" ? "Driver charge collected" : "Settlement collected",
      detail: [payment.vehicleVrm, payment.driverLabel].filter(Boolean).join(" · ") || "Settlement payment",
      amountGbp: amount,
      at: payment.paidAt,
      href: `/rental/balances/${payment.hireGroupId}`,
    });
  }

  rows.sort((a, b) => b.at.localeCompare(a.at));
  return rows;
}

export function sumCompanyBalancesOpenByKinds(
  rows: readonly CompanyBalancesOpenRow[],
  kinds: readonly CompanyBalancesOpenKind[],
): { gbp: number; hireCount: number } {
  const kindSet = new Set(kinds);
  const hireIds = new Set<string>();
  let gbp = 0;
  for (const row of rows) {
    if (!kindSet.has(row.kind)) continue;
    gbp = roundGbp(gbp + row.amountGbp);
    hireIds.add(row.hireGroupId);
  }
  return { gbp, hireCount: hireIds.size };
}

/** KPIs are derived only from row lists so UI cards always match table totals. */
export function buildCompanyBalancesKpis(input: {
  openRows: readonly CompanyBalancesOpenRow[];
  activityRows: readonly CompanyBalancesActivityRow[];
}): CompanyBalancesKpis {
  const openBalance = sumCompanyBalancesOpenByKinds(input.openRows, ["refund_owed"]);
  const driverDue = sumCompanyBalancesOpenByKinds(input.openRows, ["rent_due", "settlement"]);
  const pendingRows = input.openRows.filter((r) => r.kind === "pending_approval");
  let pendingGbp = 0;
  for (const row of pendingRows) pendingGbp = roundGbp(pendingGbp + row.amountGbp);

  let collectedGbp = 0;
  for (const row of input.activityRows) {
    collectedGbp = roundGbp(collectedGbp + row.amountGbp);
  }

  return {
    openBalanceGbp: openBalance.gbp,
    openBalanceHireCount: openBalance.hireCount,
    driverPaymentsDueGbp: driverDue.gbp,
    driverPaymentsDueHireCount: driverDue.hireCount,
    collectedThisMonthGbp: collectedGbp,
    collectedThisMonthPaymentCount: input.activityRows.length,
    pendingApprovalGbp: pendingGbp,
    pendingApprovalCount: pendingRows.length,
  };
}

export function buildCompanyBalancesPage(input: {
  hires: readonly CompanyBalancesHireFact[];
  scheduleRows: readonly CompanyBalancesScheduleFact[];
  settlementPayments: readonly CompanyBalancesSettlementPaymentFact[];
  todayYmd?: string;
}): CompanyBalancesPageData {
  const todayYmd = input.todayYmd ?? ukTodayYmd();
  const period = resolveCompanyDashboardPeriod({ kind: "this_month", todayYmd });
  if ("error" in period) {
    throw new Error(period.error);
  }

  const openRows = buildCompanyBalancesOpenRows({
    hires: input.hires,
    scheduleRows: input.scheduleRows,
    todayYmd,
  });
  const settledRows = buildCompanyBalancesSettledRows(input.hires);
  const activityRows = buildCompanyBalancesActivityRows({
    hires: input.hires,
    scheduleRows: input.scheduleRows,
    settlementPayments: input.settlementPayments,
    monthStartYmd: period.startYmd,
    monthEndYmd: period.endYmd,
  });
  const kpis = buildCompanyBalancesKpis({ openRows, activityRows });

  return {
    kpis,
    openRows,
    settledRows,
    activityRows,
    defaultTab: defaultCompanyBalancesTab(kpis),
    monthStartYmd: period.startYmd,
    monthEndYmd: period.endYmd,
  };
}

export function companyBalancesOpenRowsForTab(
  openRows: readonly CompanyBalancesOpenRow[],
  tab: CompanyBalancesTab,
  kpiFocus: "open_balance" | "driver_due" | "pending" | null = null,
): CompanyBalancesOpenRow[] {
  if (tab !== "open") return [];
  if (kpiFocus === "open_balance") return openRows.filter((r) => r.kind === "refund_owed");
  if (kpiFocus === "driver_due") {
    return openRows.filter((r) => r.kind === "rent_due" || r.kind === "settlement");
  }
  if (kpiFocus === "pending") return openRows.filter((r) => r.kind === "pending_approval");
  // Default Open tab: everything still outstanding or awaiting approval.
  return [...openRows];
}

export function buildCompanyBalancesExportCsv(data: CompanyBalancesPageData, tab: CompanyBalancesTab): string {
  const lines: string[] = ["\uFEFFSection,Item,Value"];
  const cell = (v: string | number) => {
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  lines.push(["KPI", "Open balance GBP", data.kpis.openBalanceGbp].map(cell).join(","));
  lines.push(["KPI", "Driver payments due GBP", data.kpis.driverPaymentsDueGbp].map(cell).join(","));
  lines.push(["KPI", "Collected this month GBP", data.kpis.collectedThisMonthGbp].map(cell).join(","));
  lines.push(["KPI", "Pending approval GBP", data.kpis.pendingApprovalGbp].map(cell).join(","));

  if (tab === "open") {
    for (const row of data.openRows) {
      lines.push(
        ["Open", `${row.kindLabel} · ${row.vehicleVrm ?? row.hireGroupId}`, row.amountGbp]
          .map(cell)
          .join(","),
      );
    }
  } else if (tab === "settled") {
    for (const row of data.settledRows) {
      lines.push(
        ["Settled", row.vehicleVrm ?? row.hireGroupId, row.settledAt ?? ""].map(cell).join(","),
      );
    }
  } else {
    for (const row of data.activityRows) {
      lines.push(["Activity", `${row.title} · ${row.detail}`, row.amountGbp].map(cell).join(","));
    }
  }

  return lines.join("\n");
}

export function companyBalancesExportFileName(todayYmd = ukTodayYmd()): string {
  return `balances-export-${todayYmd}.csv`;
}
