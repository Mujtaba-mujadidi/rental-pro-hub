import { formatUkDateTime } from "@/lib/datetime/uk";
import {
  hirePaymentRowBalanceGbp,
  hirePaymentRowPaidGbp,
  isHirePaymentRowAccrued,
  type HirePaymentScheduleRowInput,
} from "@/lib/fleet/hire-payment-summary";
import { calendarDaysInclusive } from "@/lib/fleet/hire-payment-analytics";
import { hireActivityTitle } from "@/lib/fleet/hire-activity-display";
import { computeVehiclePnl } from "@/lib/fleet/vehicle-pnl";
import {
  missingRequiredDocTypes,
  VEHICLE_DOC_TYPE_LABELS,
  type VehicleDocType,
  type VehicleStatus,
} from "@/lib/fleet/vehicles";
import { vehicleExpiryAttentionItems } from "@/lib/fleet/vehicle-expiry-attention";
import type { CompanyNotificationSettings } from "@/lib/settings/notification-settings";
import type { RentCadence } from "@/lib/fleet/hire-types";
import {
  chartMonthKeysForPeriod,
  monthBucketLabel,
  monthKeyFromYmd,
  type CompanyDashboardPeriod,
} from "@/lib/fleet/company-dashboard-period";
import {
  summarizeHireRentSettlement,
} from "@/lib/fleet/hire-rent-settlement";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import {
  computeHireWorkspaceSettlementBalance,
} from "@/lib/fleet/hire-workspace-settlement-balance";

export type CompanyDashboardAttentionSeverity = "critical" | "warning" | "info";

export type CompanyDashboardSubcompanyOption = {
  id: string;
  name: string;
  isPrimary: boolean;
};

export type CompanyDashboardComparisonRow = {
  subcompanyId: string;
  name: string;
  vehicleCount: number;
  onHireCount: number;
  utilisationPct: number | null;
  revenueGbp: number;
  costsGbp: number;
  netProfitGbp: number;
  profitMarginPct: number | null;
  complianceAlertCount: number;
};

export type CompanyDashboardVehicleProfitRow = {
  vehicleId: string;
  vrm: string;
  make: string;
  model: string;
  subcompanyName: string;
  hireRevenueGbp: number;
  costsGbp: number;
  netContributionGbp: number;
  profitMarginPct: number | null;
  hireDays: number;
  utilisationPct: number | null;
  href: string;
};

export type CompanyDashboardAttentionItem = {
  id: string;
  severity: CompanyDashboardAttentionSeverity;
  severityLabel: string;
  title: string;
  detail: string;
  href: string;
};

export type CompanyDashboardActivityItem = {
  id: string;
  title: string;
  detail: string;
  atLabel: string;
  href: string;
};

export type CompanyDashboardFinancialBucket = {
  key: string;
  label: string;
  revenueGbp: number;
  costsGbp: number;
  profitGbp: number;
};

export type CompanyDashboardInsight = {
  tone: "ok" | "warn" | "neutral";
  message: string;
  href: string;
  hrefLabel: string;
};

export type CompanyDashboardPayload = {
  companyName: string;
  selectedSubcompanyId: string | null;
  selectedSubcompanyName: string;
  period: {
    kind: CompanyDashboardPeriod["kind"];
    startYmd: string;
    endYmd: string;
    label: string;
    rangeLabel: string;
    comparisonLabel: string;
  };
  capabilities: {
    canWriteRentals: boolean;
    canManageFleet: boolean;
  };
  subcompanies: CompanyDashboardSubcompanyOption[];
  insight: CompanyDashboardInsight | null;
  kpis: {
    revenueGbp: number;
    revenueChangePct: number | null;
    netProfitGbp: number;
    netProfitChangePct: number | null;
    profitMarginPct: number | null;
    profitMarginChangePts: number | null;
    operatingCostsGbp: number;
    fleetUtilisationPct: number | null;
    vehiclesOnHire: number;
    fleetActiveCount: number;
    amountDueGbp: number;
    amountDueAlertCount: number;
    complianceAlertCount: number;
  };
  financial: {
    revenueGbp: number;
    operatingCostsGbp: number;
    netProfitGbp: number;
    profitMarginPct: number | null;
    buckets: CompanyDashboardFinancialBucket[];
    empty: boolean;
    fullFinancialsHref: string;
  };
  fleet: {
    totalVehicles: number;
    onHire: number;
    available: number;
    reserved: number;
    offRoad: number;
    sold: number;
    utilisationPct: number | null;
    activeHires: number;
    averageDailyRentGbp: number | null;
    revenuePerVehicleGbp: number | null;
    investmentValueGbp: number;
    complianceAlertCount: number;
    empty: boolean;
  };
  comparison: CompanyDashboardComparisonRow[];
  mostProfitableVehicles: CompanyDashboardVehicleProfitRow[];
  leastProfitableVehicles: CompanyDashboardVehicleProfitRow[];
  attention: CompanyDashboardAttentionItem[];
  activity: CompanyDashboardActivityItem[];
};

export type DashboardVehicleFact = {
  id: string;
  vrm: string;
  make: string;
  model: string;
  status: VehicleStatus;
  subcompanyId: string;
  subcompanyName: string;
  motExpiry: string | null;
  taxExpiry: string | null;
  phvLicenceExpiry: string | null;
  gpsPrimaryImei: string | null;
  presentDocTypes: string[];
  purchaseGbp: number | null;
};

export type DashboardHireFact = {
  id: string;
  vehicleId: string;
  subcompanyId: string;
  status: string;
  startDateYmd: string | null;
  activatedAtYmd: string | null;
  endedAtYmd: string | null;
  terminatedAtYmd: string | null;
  rentAmountGbp: number;
  rentCadence: RentCadence;
  unsignedAgreementCount: number;
  insuranceStatus: "ok" | "awaiting" | "expiring" | "expired" | "none";
  /** Live open settlement on ended hires (`vehicle_hire_groups.settlement_balance_*`). */
  settlementBalanceDirection: "driver_owes_company" | "company_owes_driver" | "settled" | null;
  settlementOpenBalanceGbp: number;
  /** Billing mode chosen at termination — drives prorata vs full-period due. */
  rentBillingMode: HireTerminationRentBillingMode | null;
};

export type DashboardScheduleFact = {
  hireGroupId: string;
  vehicleId: string;
  subcompanyId: string;
  periodStart: string;
  periodEnd: string;
  rowKind: string;
  paymentStatus: HirePaymentScheduleRowInput["paymentStatus"];
  approvedAmountGbp: number | null;
  baseAmountGbp: number;
  discountTotalGbp: number;
};

export type DashboardMaintenanceFact = {
  vehicleId: string;
  subcompanyId: string;
  occurredOn: string;
  amountGbp: number;
};

export type DashboardActivityFact = {
  id: string;
  at: string;
  title: string;
  detail: string;
  href: string;
  groupKey: string;
};

export type BuildCompanyDashboardInput = {
  companyName: string;
  period: CompanyDashboardPeriod;
  todayYmd: string;
  selectedSubcompanyId: string | null;
  subcompanies: CompanyDashboardSubcompanyOption[];
  vehicles: DashboardVehicleFact[];
  hires: DashboardHireFact[];
  scheduleRows: DashboardScheduleFact[];
  maintenance: DashboardMaintenanceFact[];
  activity: DashboardActivityFact[];
  notifySettings: CompanyNotificationSettings;
  canWriteRentals: boolean;
  canManageFleet: boolean;
  canManageFleetTracking: boolean;
};

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

function nz(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return v;
}

export function dashboardProfitMarginPct(revenueGbp: number, netProfitGbp: number): number | null {
  if (!Number.isFinite(revenueGbp) || revenueGbp <= 0.005) return null;
  return roundPct((netProfitGbp / revenueGbp) * 100);
}

export function dashboardChangePct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (Math.abs(previous) < 0.005) return null;
  return roundPct(((current - previous) / Math.abs(previous)) * 100);
}

export function dashboardChangePts(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return roundPct(current - previous);
}

export function operationalFleetCount(status: VehicleStatus): boolean {
  return status !== "sold";
}

export function isOffRoadVehicleStatus(status: VehicleStatus): boolean {
  return status === "repair" || status === "accident_claim";
}

export function fleetUtilisationPct(onHire: number, operationalCount: number): number | null {
  if (operationalCount <= 0) return null;
  return Math.round((onHire / operationalCount) * 100);
}

export function rentAmountToDailyGbp(amountGbp: number, cadence: RentCadence): number {
  const amount = Math.max(0, nz(amountGbp));
  if (cadence === "daily") return roundGbp(amount);
  if (cadence === "weekly") return roundGbp(amount / 7);
  return roundGbp(amount / 30);
}

export function overlappingInclusiveDays(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): number {
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  return calendarDaysInclusive(start, end);
}

function toScheduleInput(row: DashboardScheduleFact): HirePaymentScheduleRowInput {
  return {
    id: row.hireGroupId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    rowKind: row.rowKind === "deposit" ? "deposit" : "rent",
    baseAmountGbp: row.baseAmountGbp,
    discountTotalGbp: row.discountTotalGbp,
    paymentStatus: row.paymentStatus,
    approvedAmountGbp: row.approvedAmountGbp,
    pendingSubmittedGbp: null,
    sortOrder: 0,
  };
}

export function scheduleRowPaidInWindowGbp(row: DashboardScheduleFact, startYmd: string, endYmd: string): number {
  if (row.rowKind !== "rent") return 0;
  if (row.periodStart < startYmd || row.periodStart > endYmd) return 0;
  return hirePaymentRowPaidGbp(toScheduleInput(row));
}

export function maintenanceInWindowGbp(rows: DashboardMaintenanceFact[], startYmd: string, endYmd: string): number {
  let total = 0;
  for (const row of rows) {
    if (row.occurredOn < startYmd || row.occurredOn > endYmd) continue;
    total += nz(row.amountGbp);
  }
  return roundGbp(total);
}

function hireWindow(hire: DashboardHireFact, todayYmd: string): { start: string; end: string } | null {
  if (hire.status === "draft" || hire.status === "cancelled") return null;
  const start = (hire.activatedAtYmd ?? hire.startDateYmd ?? "").slice(0, 10);
  if (!start) return null;
  const ended = (hire.endedAtYmd ?? hire.terminatedAtYmd ?? "").slice(0, 10);
  const end = ended || todayYmd;
  if (end < start) return { start, end: start };
  return { start, end };
}

export function hireDaysInPeriod(hire: DashboardHireFact, startYmd: string, endYmd: string, todayYmd: string): number {
  const window = hireWindow(hire, todayYmd);
  if (!window) return 0;
  return overlappingInclusiveDays(window.start, window.end, startYmd, endYmd);
}

function vehicleComplianceAlertCount(
  vehicle: DashboardVehicleFact,
  notifySettings: CompanyNotificationSettings,
): number {
  const expiry = vehicleExpiryAttentionItems(
    {
      mot_expiry: vehicle.motExpiry,
      tax_expiry: vehicle.taxExpiry,
      phv_licence_expiry: vehicle.phvLicenceExpiry,
    },
    notifySettings,
  ).length;
  const missing = missingRequiredDocTypes(vehicle.presentDocTypes).length;
  return expiry + missing;
}

function filterBySubcompany<T extends { subcompanyId: string }>(
  rows: T[],
  selectedSubcompanyId: string | null,
): T[] {
  if (!selectedSubcompanyId) return rows;
  return rows.filter((row) => row.subcompanyId === selectedSubcompanyId);
}

export function isEndedHireStatus(status: string): boolean {
  return status === "completed" || status === "terminated";
}

export function hireContractEndedYmd(hire: Pick<DashboardHireFact, "terminatedAtYmd" | "endedAtYmd" | "status">): string | null {
  if (!isEndedHireStatus(hire.status)) return null;
  return hire.terminatedAtYmd?.slice(0, 10) ?? hire.endedAtYmd?.slice(0, 10) ?? null;
}

/**
 * Money the driver still owes the company on an ended hire.
 * Prefers live settlement_balance_* (includes deposit disposition + settlement payments).
 * Falls back to termination rent settlement using the hire's billing mode (actual vs end_of_period).
 */
export function endedHireDriverOwesCompanyGbp(
  hire: DashboardHireFact,
  scheduleRows: readonly DashboardScheduleFact[],
): number {
  if (!isEndedHireStatus(hire.status)) return 0;

  if (hire.settlementBalanceDirection) {
    const balance = computeHireWorkspaceSettlementBalance({
      settlementBalanceDirection: hire.settlementBalanceDirection,
      settlementBalanceGbp: hire.settlementOpenBalanceGbp,
    });
    if (!balance) return 0;
    if (balance.settlementDirection !== "driver_owes_company") return 0;
    return balance.openBalanceGbp;
  }

  const endedYmd = hireContractEndedYmd(hire);
  if (!endedYmd) return 0;

  const rentRows = scheduleRows
    .filter((row) => row.hireGroupId === hire.id && row.rowKind === "rent")
    .map((row) => toScheduleInput(row));
  const settlement = summarizeHireRentSettlement(rentRows, endedYmd, {
    billingMode: hire.rentBillingMode ?? "end_of_period",
    rentCadence: hire.rentCadence,
  });
  return Math.max(0, roundGbp(settlement.signedRentSettlementGbp));
}

/**
 * Amount due = open-hire accrued schedule rent balances + ended-hire settlement amounts
 * where the driver still owes the company. Ignores prorated leftovers and post-end schedule rows.
 */
export function computeDashboardAmountDue(input: {
  hires: readonly DashboardHireFact[];
  scheduleRows: readonly DashboardScheduleFact[];
  todayYmd: string;
}): { gbp: number; alertCount: number; byHireId: Map<string, number> } {
  const byHireId = new Map<string, number>();
  const hireById = new Map(input.hires.map((hire) => [hire.id, hire]));

  for (const hire of input.hires) {
    if (!isEndedHireStatus(hire.status)) continue;
    const owed = endedHireDriverOwesCompanyGbp(hire, input.scheduleRows);
    if (owed <= 0.005) continue;
    byHireId.set(hire.id, owed);
  }

  for (const row of input.scheduleRows) {
    if (row.rowKind !== "rent") continue;
    const hire = hireById.get(row.hireGroupId);
    if (!hire || isEndedHireStatus(hire.status) || hire.status === "cancelled" || hire.status === "draft") {
      continue;
    }
    const schedule = toScheduleInput(row);
    if (!isHirePaymentRowAccrued(schedule, input.todayYmd)) continue;
    const balance = hirePaymentRowBalanceGbp(schedule);
    if (balance <= 0.005) continue;
    byHireId.set(row.hireGroupId, roundGbp((byHireId.get(row.hireGroupId) ?? 0) + balance));
  }

  let gbp = 0;
  for (const amount of byHireId.values()) gbp += amount;
  return { gbp: roundGbp(gbp), alertCount: byHireId.size, byHireId };
}

/**
 * Overdue rent for attention queue.
 * Open hires: unpaid accrued rows whose period has fully ended.
 * Ended hires: only live settlement amounts still owed by the driver (billing-mode aware via settlement).
 */
export function computeDashboardOverdueByHire(input: {
  hires: readonly DashboardHireFact[];
  scheduleRows: readonly DashboardScheduleFact[];
  todayYmd: string;
}): Map<string, number> {
  const byHireId = new Map<string, number>();
  const hireById = new Map(input.hires.map((hire) => [hire.id, hire]));

  for (const hire of input.hires) {
    if (!isEndedHireStatus(hire.status)) continue;
    const owed = endedHireDriverOwesCompanyGbp(hire, input.scheduleRows);
    if (owed <= 0.005) continue;
    byHireId.set(hire.id, owed);
  }

  for (const row of input.scheduleRows) {
    if (row.rowKind !== "rent") continue;
    const hire = hireById.get(row.hireGroupId);
    if (!hire || isEndedHireStatus(hire.status) || hire.status === "cancelled" || hire.status === "draft") {
      continue;
    }
    const schedule = toScheduleInput(row);
    if (!isHirePaymentRowAccrued(schedule, input.todayYmd)) continue;
    if (row.periodEnd >= input.todayYmd) continue;
    const balance = hirePaymentRowBalanceGbp(schedule);
    if (balance <= 0.005) continue;
    byHireId.set(row.hireGroupId, roundGbp((byHireId.get(row.hireGroupId) ?? 0) + balance));
  }

  return byHireId;
}

function averageDailyRent(hires: DashboardHireFact[]): number | null {
  const active = hires.filter((h) => h.status === "active");
  if (!active.length) return null;
  const total = active.reduce((sum, hire) => sum + rentAmountToDailyGbp(hire.rentAmountGbp, hire.rentCadence), 0);
  return roundGbp(total / active.length);
}

function financialTotals(
  scheduleRows: DashboardScheduleFact[],
  maintenance: DashboardMaintenanceFact[],
  startYmd: string,
  endYmd: string,
): { revenueGbp: number; costsGbp: number; netProfitGbp: number; profitMarginPct: number | null } {
  let revenueGbp = 0;
  for (const row of scheduleRows) {
    revenueGbp += scheduleRowPaidInWindowGbp(row, startYmd, endYmd);
  }
  revenueGbp = roundGbp(revenueGbp);
  const costsGbp = maintenanceInWindowGbp(maintenance, startYmd, endYmd);
  const pnl = computeVehiclePnl({
    purchaseGbp: null,
    saleGbp: null,
    maintenanceTotalGbp: costsGbp,
    rentalIncomeGbp: revenueGbp,
    pcnTotalGbp: 0,
    claimsNetGbp: 0,
  });
  const netProfitGbp = roundGbp(revenueGbp - pnl.operatingCostGbp);
  return {
    revenueGbp,
    costsGbp: pnl.operatingCostGbp,
    netProfitGbp,
    profitMarginPct: dashboardProfitMarginPct(revenueGbp, netProfitGbp),
  };
}

export function buildFinancialMonthBuckets(
  scheduleRows: DashboardScheduleFact[],
  maintenance: DashboardMaintenanceFact[],
  period: CompanyDashboardPeriod,
): CompanyDashboardFinancialBucket[] {
  const keys = chartMonthKeysForPeriod(period);
  return keys.map((key) => {
    const monthStart = `${key}-01`;
    const [y, m] = key.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${key}-${String(lastDay).padStart(2, "0")}`;
    const totals = financialTotals(scheduleRows, maintenance, monthStart, monthEnd);
    return {
      key,
      label: monthBucketLabel(key),
      revenueGbp: totals.revenueGbp,
      costsGbp: totals.costsGbp,
      profitGbp: totals.netProfitGbp,
    };
  });
}

function vehicleProfitRows(
  vehicles: DashboardVehicleFact[],
  hires: DashboardHireFact[],
  scheduleRows: DashboardScheduleFact[],
  maintenance: DashboardMaintenanceFact[],
  period: CompanyDashboardPeriod,
  todayYmd: string,
): CompanyDashboardVehicleProfitRow[] {
  const periodDays = calendarDaysInclusive(period.startYmd, period.endYmd) || 1;
  const hiresByVehicle = new Map<string, DashboardHireFact[]>();
  for (const hire of hires) {
    const list = hiresByVehicle.get(hire.vehicleId) ?? [];
    list.push(hire);
    hiresByVehicle.set(hire.vehicleId, list);
  }
  const rows: CompanyDashboardVehicleProfitRow[] = [];
  for (const vehicle of vehicles) {
    if (vehicle.status === "sold") continue;
    const revenueGbp = roundGbp(
      scheduleRows
        .filter((row) => row.vehicleId === vehicle.id)
        .reduce((sum, row) => sum + scheduleRowPaidInWindowGbp(row, period.startYmd, period.endYmd), 0),
    );
    const costsGbp = maintenanceInWindowGbp(
      maintenance.filter((row) => row.vehicleId === vehicle.id),
      period.startYmd,
      period.endYmd,
    );
    const hireDays = (hiresByVehicle.get(vehicle.id) ?? []).reduce(
      (sum, hire) => sum + hireDaysInPeriod(hire, period.startYmd, period.endYmd, todayYmd),
      0,
    );
    if (revenueGbp <= 0.005 && costsGbp <= 0.005 && hireDays <= 0) continue;
    const netContributionGbp = roundGbp(revenueGbp - costsGbp);
    rows.push({
      vehicleId: vehicle.id,
      vrm: vehicle.vrm,
      make: vehicle.make,
      model: vehicle.model,
      subcompanyName: vehicle.subcompanyName,
      hireRevenueGbp: revenueGbp,
      costsGbp,
      netContributionGbp,
      profitMarginPct: dashboardProfitMarginPct(revenueGbp, netContributionGbp),
      hireDays,
      utilisationPct: fleetUtilisationPct(Math.min(hireDays, periodDays), periodDays),
      href: `/rental/vehicles/${vehicle.id}`,
    });
  }
  return rows;
}

function comparisonRows(
  subcompanies: CompanyDashboardSubcompanyOption[],
  vehicles: DashboardVehicleFact[],
  scheduleRows: DashboardScheduleFact[],
  maintenance: DashboardMaintenanceFact[],
  period: CompanyDashboardPeriod,
  notifySettings: CompanyNotificationSettings,
): CompanyDashboardComparisonRow[] {
  return subcompanies.map((sub) => {
    const subVehicles = vehicles.filter((v) => v.subcompanyId === sub.id);
    const operational = subVehicles.filter((v) => operationalFleetCount(v.status));
    const onHire = operational.filter((v) => v.status === "on_rent").length;
    const totals = financialTotals(
      scheduleRows.filter((row) => row.subcompanyId === sub.id),
      maintenance.filter((row) => row.subcompanyId === sub.id),
      period.startYmd,
      period.endYmd,
    );
    const complianceAlertCount = subVehicles.reduce(
      (sum, vehicle) => sum + (vehicleComplianceAlertCount(vehicle, notifySettings) > 0 ? 1 : 0),
      0,
    );
    return {
      subcompanyId: sub.id,
      name: sub.name,
      vehicleCount: operational.length,
      onHireCount: onHire,
      utilisationPct: fleetUtilisationPct(onHire, operational.length),
      revenueGbp: totals.revenueGbp,
      costsGbp: totals.costsGbp,
      netProfitGbp: totals.netProfitGbp,
      profitMarginPct: totals.profitMarginPct,
      complianceAlertCount,
    };
  });
}

export function buildNeedsAttentionItems(input: {
  vehicles: DashboardVehicleFact[];
  hires: DashboardHireFact[];
  scheduleRows: DashboardScheduleFact[];
  todayYmd: string;
  notifySettings: CompanyNotificationSettings;
  canManageFleetTracking: boolean;
}): CompanyDashboardAttentionItem[] {
  const items: CompanyDashboardAttentionItem[] = [];
  const vehicleById = new Map(input.vehicles.map((v) => [v.id, v]));

  for (const vehicle of input.vehicles) {
    const expiryItems = vehicleExpiryAttentionItems(
      {
        mot_expiry: vehicle.motExpiry,
        tax_expiry: vehicle.taxExpiry,
        phv_licence_expiry: vehicle.phvLicenceExpiry,
      },
      input.notifySettings,
    );
    for (const expiry of expiryItems) {
      items.push({
        id: `${vehicle.id}-${expiry.kind}`,
        severity: expiry.tone === "expired" ? "critical" : "warning",
        severityLabel: expiry.tone === "expired" ? "Expired" : "Due soon",
        title: `${vehicle.vrm} — ${expiry.label} ${expiry.tone === "expired" ? "expired" : "expiring"}`,
        detail: expiry.message,
        href: `/rental/vehicles/${vehicle.id}/details`,
      });
    }

    for (const missing of missingRequiredDocTypes(vehicle.presentDocTypes)) {
      const label = VEHICLE_DOC_TYPE_LABELS[missing as VehicleDocType] ?? missing;
      items.push({
        id: `${vehicle.id}-missing-${missing}`,
        severity: "warning",
        severityLabel: "Missing document",
        title: `${vehicle.vrm} — ${label} missing`,
        detail: `Upload the current ${label} document.`,
        href: `/rental/vehicles/${vehicle.id}/details`,
      });
    }

    if (!vehicle.presentDocTypes.includes("insurance")) {
      items.push({
        id: `${vehicle.id}-missing-insurance`,
        severity: "warning",
        severityLabel: "Missing document",
        title: `${vehicle.vrm} — Insurance document missing`,
        detail: "No current vehicle insurance document is on file.",
        href: `/rental/vehicles/${vehicle.id}/details`,
      });
    }

    if (isOffRoadVehicleStatus(vehicle.status)) {
      items.push({
        id: `${vehicle.id}-off-road`,
        severity: "warning",
        severityLabel: "Off road",
        title: `${vehicle.vrm} — Vehicle off road`,
        detail: vehicle.status === "repair" ? "Marked as repair." : "Marked as accident claim.",
        href: `/rental/vehicles/${vehicle.id}`,
      });
    }

    if (input.canManageFleetTracking && !vehicle.gpsPrimaryImei?.trim()) {
      items.push({
        id: `${vehicle.id}-unmapped-gps`,
        severity: "info",
        severityLabel: "Tracking",
        title: `${vehicle.vrm} — Tracking device not mapped`,
        detail: "No primary GPS IMEI is recorded for this vehicle.",
        href: `/rental/vehicles/${vehicle.id}/tracking`,
      });
    }
  }

  for (const hire of input.hires) {
    const vehicle = vehicleById.get(hire.vehicleId);
    const vrm = vehicle?.vrm ?? "Hire";
    if (hire.unsignedAgreementCount > 0 && (hire.status === "pending_signature" || hire.status === "reserved")) {
      items.push({
        id: `${hire.id}-unsigned`,
        severity: "warning",
        severityLabel: "Unsigned",
        title: `${vrm} — Unsigned agreement`,
        detail:
          hire.unsignedAgreementCount === 1
            ? "One hire agreement is still unsigned."
            : `${hire.unsignedAgreementCount} hire agreements are still unsigned.`,
        href: `/rental/hires/${hire.id}`,
      });
    }
    if (hire.insuranceStatus === "awaiting" || hire.insuranceStatus === "expired" || hire.insuranceStatus === "expiring") {
      items.push({
        id: `${hire.id}-insurance`,
        severity: hire.insuranceStatus === "expired" ? "critical" : "warning",
        severityLabel: hire.insuranceStatus === "expired" ? "Expired" : "Insurance",
        title:
          hire.insuranceStatus === "expired"
            ? `${vrm} — Hire insurance expired`
            : hire.insuranceStatus === "expiring"
              ? `${vrm} — Hire insurance expiring`
              : `${vrm} — Hire insurance required`,
        detail:
          hire.insuranceStatus === "awaiting"
            ? "Upload the hire insurance certificate."
            : "Review the hire insurance document.",
        href: `/rental/hires/${hire.id}/details`,
      });
    }
  }

  const overdueByHire = computeDashboardOverdueByHire({
    hires: input.hires,
    scheduleRows: input.scheduleRows,
    todayYmd: input.todayYmd,
  });
  for (const [hireId, amount] of overdueByHire) {
    const hire = input.hires.find((h) => h.id === hireId);
    const vehicle = hire ? vehicleById.get(hire.vehicleId) : null;
    const ended = hire ? isEndedHireStatus(hire.status) : false;
    items.push({
      id: `${hireId}-overdue`,
      severity: "critical",
      severityLabel: ended ? "Outstanding" : "Overdue",
      title: ended
        ? `${vehicle?.vrm ?? "Hire"} — Final balance outstanding`
        : `${vehicle?.vrm ?? "Hire"} — Payment overdue`,
      detail: ended
        ? `${formatGbpPlain(amount)} is still owed after contract end.`
        : `${formatGbpPlain(amount)} is unpaid after the rent period ended.`,
      href: ended ? `/rental/balances/${hireId}` : `/rental/hires/${hireId}/payments`,
    });
  }

  const rank: Record<CompanyDashboardAttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => rank[a.severity] - rank[b.severity] || a.title.localeCompare(b.title));
  return items.slice(0, 12);
}

function formatGbpPlain(amount: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

export function groupDashboardActivityItems(facts: DashboardActivityFact[]): CompanyDashboardActivityItem[] {
  const sorted = [...facts].sort((a, b) => b.at.localeCompare(a.at));
  const grouped: CompanyDashboardActivityItem[] = [];
  const seen = new Set<string>();

  for (const fact of sorted) {
    const day = fact.at.slice(0, 10);
    const key = `${fact.groupKey}|${day}|${fact.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sameDay = sorted.filter(
      (other) => other.groupKey === fact.groupKey && other.at.slice(0, 10) === day && other.title === fact.title,
    );
    const detail =
      sameDay.length > 1 ? `${fact.detail} (${sameDay.length} related updates)` : fact.detail;
    grouped.push({
      id: fact.id,
      title: fact.title,
      detail,
      atLabel: formatUkDateTime(fact.at),
      href: fact.href,
    });
    if (grouped.length >= 8) break;
  }
  return grouped;
}

export function dashboardActivityTitleForHireEvent(eventType: string, toStatus?: string | null): string | null {
  if (eventType === "checkout_completed") return "Hire started";
  if (eventType === "checkin_completed" || eventType === "hire_terminated") return "Hire completed";
  if (eventType === "esign_completed") return "Agreement signed";
  if (eventType === "hire_cancelled") return "Hire cancelled";
  if (eventType === "hire_status_changed") {
    if (toStatus === "active") return "Hire started";
    if (toStatus === "completed") return "Hire completed";
    if (toStatus === "terminated") return "Hire completed";
    if (toStatus === "reserved") return "Hire reserved";
    return null;
  }
  if (
    eventType === "draft_step_saved" ||
    eventType === "vehicle_status_synced" ||
    eventType === "hire_pdfs_refreshed" ||
    eventType === "draft_created"
  ) {
    return null;
  }
  return hireActivityTitle(eventType);
}

function buildInsight(
  scopedTotals: ReturnType<typeof financialTotals>,
  previousTotals: ReturnType<typeof financialTotals>,
  comparison: CompanyDashboardComparisonRow[],
  selectedSubcompanyId: string | null,
): CompanyDashboardInsight | null {
  const delta = roundGbp(scopedTotals.netProfitGbp - previousTotals.netProfitGbp);
  if (Math.abs(scopedTotals.revenueGbp) < 0.005 && Math.abs(previousTotals.revenueGbp) < 0.005) {
    return null;
  }
  const leader = !selectedSubcompanyId
    ? [...comparison].sort((a, b) => b.netProfitGbp - a.netProfitGbp)[0]
    : null;
  const absLabel = formatGbpPlain(Math.abs(delta));
  if (delta > 0.005 && (scopedTotals.profitMarginPct ?? 0) >= 40) {
    return {
      tone: "ok",
      message: `Strong operating margin. Net profit is ${absLabel} higher than last period${
        leader ? `, led by ${leader.name}` : ""
      }.`,
      href: "/rental/balances",
      hrefLabel: "Review financial activity",
    };
  }
  if (delta > 0.005) {
    return {
      tone: "ok",
      message: `Net profit is ${absLabel} higher than last period.`,
      href: "/rental/balances",
      hrefLabel: "Review financial activity",
    };
  }
  if (delta < -0.005) {
    return {
      tone: "warn",
      message: `Net profit is ${absLabel} lower than last period.`,
      href: "/rental/balances",
      hrefLabel: "Review financial activity",
    };
  }
  return {
    tone: "neutral",
    message: "Net profit is in line with the previous period.",
    href: "/rental/balances",
    hrefLabel: "Review financial activity",
  };
}

export function buildCompanyDashboardPayload(input: BuildCompanyDashboardInput): CompanyDashboardPayload {
  const selectedId = input.selectedSubcompanyId;
  const selectedName =
    selectedId == null
      ? "All subcompanies"
      : input.subcompanies.find((s) => s.id === selectedId)?.name ?? "Selected subcompany";

  const scopedVehicles = filterBySubcompany(input.vehicles, selectedId);
  const scopedHires = filterBySubcompany(input.hires, selectedId);
  const scopedSchedule = filterBySubcompany(input.scheduleRows, selectedId);
  const scopedMaintenance = filterBySubcompany(input.maintenance, selectedId);

  const current = financialTotals(scopedSchedule, scopedMaintenance, input.period.startYmd, input.period.endYmd);
  const previous = financialTotals(
    scopedSchedule,
    scopedMaintenance,
    input.period.previousStartYmd,
    input.period.previousEndYmd,
  );

  const operational = scopedVehicles.filter((v) => operationalFleetCount(v.status));
  const onHire = operational.filter((v) => v.status === "on_rent").length;
  const available = operational.filter((v) => v.status === "available").length;
  const reserved = operational.filter((v) => v.status === "reserved").length;
  const offRoad = operational.filter((v) => isOffRoadVehicleStatus(v.status)).length;
  const sold = scopedVehicles.filter((v) => v.status === "sold").length;
  const utilisationPct = fleetUtilisationPct(onHire, operational.length);
  const due = computeDashboardAmountDue({
    hires: scopedHires,
    scheduleRows: scopedSchedule,
    todayYmd: input.todayYmd,
  });
  const complianceAlertCount = scopedVehicles.reduce(
    (sum, vehicle) => sum + (vehicleComplianceAlertCount(vehicle, input.notifySettings) > 0 ? 1 : 0),
    0,
  );
  const investmentValueGbp = roundGbp(
    operational.reduce((sum, vehicle) => sum + nz(vehicle.purchaseGbp), 0),
  );
  const activeHires = scopedHires.filter((h) => h.status === "active").length;
  const avgDaily = averageDailyRent(scopedHires);
  const revenuePerVehicleGbp =
    operational.length > 0 ? roundGbp(current.revenueGbp / operational.length) : null;

  const comparison = comparisonRows(
    input.subcompanies,
    input.vehicles,
    input.scheduleRows,
    input.maintenance,
    input.period,
    input.notifySettings,
  );

  const profitRows = vehicleProfitRows(
    scopedVehicles,
    scopedHires,
    scopedSchedule,
    scopedMaintenance,
    input.period,
    input.todayYmd,
  ).sort((a, b) => b.netContributionGbp - a.netContributionGbp);

  const mostProfitableVehicles = profitRows.slice(0, 5);
  const leastProfitableVehicles =
    profitRows.length > 5
      ? [...profitRows].sort((a, b) => a.netContributionGbp - b.netContributionGbp).slice(0, 5)
      : [];

  const buckets = buildFinancialMonthBuckets(scopedSchedule, scopedMaintenance, input.period);
  const financialEmpty = current.revenueGbp <= 0.005 && current.costsGbp <= 0.005;

  return {
    companyName: input.companyName,
    selectedSubcompanyId: selectedId,
    selectedSubcompanyName: selectedName,
    period: {
      kind: input.period.kind,
      startYmd: input.period.startYmd,
      endYmd: input.period.endYmd,
      label: input.period.label,
      rangeLabel: input.period.rangeLabel,
      comparisonLabel: input.period.comparisonLabel,
    },
    capabilities: {
      canWriteRentals: input.canWriteRentals,
      canManageFleet: input.canManageFleet,
    },
    subcompanies: input.subcompanies,
    insight: buildInsight(current, previous, comparison, selectedId),
    kpis: {
      revenueGbp: current.revenueGbp,
      revenueChangePct: dashboardChangePct(current.revenueGbp, previous.revenueGbp),
      netProfitGbp: current.netProfitGbp,
      netProfitChangePct: dashboardChangePct(current.netProfitGbp, previous.netProfitGbp),
      profitMarginPct: current.profitMarginPct,
      profitMarginChangePts: dashboardChangePts(current.profitMarginPct, previous.profitMarginPct),
      operatingCostsGbp: current.costsGbp,
      fleetUtilisationPct: utilisationPct,
      vehiclesOnHire: onHire,
      fleetActiveCount: operational.length,
      amountDueGbp: due.gbp,
      amountDueAlertCount: due.alertCount,
      complianceAlertCount,
    },
    financial: {
      revenueGbp: current.revenueGbp,
      operatingCostsGbp: current.costsGbp,
      netProfitGbp: current.netProfitGbp,
      profitMarginPct: current.profitMarginPct,
      buckets,
      empty: financialEmpty,
      fullFinancialsHref: "/rental/balances",
    },
    fleet: {
      totalVehicles: operational.length,
      onHire,
      available,
      reserved,
      offRoad,
      sold,
      utilisationPct,
      activeHires,
      averageDailyRentGbp: avgDaily,
      revenuePerVehicleGbp,
      investmentValueGbp,
      complianceAlertCount,
      empty: operational.length === 0,
    },
    comparison,
    mostProfitableVehicles,
    leastProfitableVehicles,
    attention: buildNeedsAttentionItems({
      vehicles: scopedVehicles,
      hires: scopedHires,
      scheduleRows: scopedSchedule,
      todayYmd: input.todayYmd,
      notifySettings: input.notifySettings,
      canManageFleetTracking: input.canManageFleetTracking,
    }),
    activity: groupDashboardActivityItems(input.activity),
  };
}

function csvSafeText(value: string): string {
  return value
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u202F\u2007\u2009]/g, " ")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/\u00A3/g, "GBP ")
    .replace(/[^\t\n\r\x20-\x7E]/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

function csvCell(value: string | number | null | undefined): string {
  const text = csvSafeText(value == null ? "" : String(value));
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCompanyDashboardExportCsv(payload: CompanyDashboardPayload): string {
  const lines: string[] = [];
  lines.push(["Section", "Item", "Value"].map(csvCell).join(","));
  lines.push(["Filters", "Subcompany", payload.selectedSubcompanyName].map(csvCell).join(","));
  lines.push(["Filters", "Period", `${payload.period.label} (${payload.period.rangeLabel})`].map(csvCell).join(","));
  lines.push(["KPI", "Revenue GBP", payload.kpis.revenueGbp].map(csvCell).join(","));
  lines.push(["KPI", "Net profit GBP", payload.kpis.netProfitGbp].map(csvCell).join(","));
  lines.push(["KPI", "Profit margin %", payload.kpis.profitMarginPct ?? ""].map(csvCell).join(","));
  lines.push(["KPI", "Fleet utilisation %", payload.kpis.fleetUtilisationPct ?? ""].map(csvCell).join(","));
  lines.push(["KPI", "Amount due GBP", payload.kpis.amountDueGbp].map(csvCell).join(","));
  for (const row of payload.comparison) {
    lines.push(
      [
        "Subcompany",
        row.name,
        `vehicles=${row.vehicleCount}; onHire=${row.onHireCount}; revenue=${row.revenueGbp}; costs=${row.costsGbp}; profit=${row.netProfitGbp}; margin=${row.profitMarginPct ?? ""}`,
      ].map(csvCell).join(","),
    );
  }
  for (const row of payload.mostProfitableVehicles) {
    lines.push(
      ["Vehicle", row.vrm, `net=${row.netContributionGbp}; revenue=${row.hireRevenueGbp}; costs=${row.costsGbp}`]
        .map(csvCell)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function companyDashboardExportFileName(period: CompanyDashboardPayload["period"]): string {
  return `company-dashboard-${period.startYmd}-to-${period.endYmd}.csv`;
}

export function ymdInMonthKey(ymd: string, monthKey: string): boolean {
  return monthKeyFromYmd(ymd) === monthKey;
}
