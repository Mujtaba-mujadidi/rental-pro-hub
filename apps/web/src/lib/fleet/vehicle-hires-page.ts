import { calendarDaysInclusive } from "@/lib/fleet/hire-payment-analytics";
import { ukLondonDayYmd } from "@/lib/datetime/uk";
import type { HireGroupStatus } from "@/lib/fleet/hire-types";
import type { SettlementBalanceDirection } from "@/lib/fleet/hire-termination-summary";
import type { HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";
import {
  computeDashboardAmountDue,
  type DashboardHireFact,
  type DashboardScheduleFact,
} from "@/lib/fleet/company-dashboard-display";
import type { HireTerminationRentBillingMode } from "@/lib/fleet/hire-termination-billing";
import type { RentCadence } from "@/lib/fleet/hire-types";
import { computeHireWorkspaceSettlementBalance } from "@/lib/fleet/hire-workspace-settlement-balance";

export type VehicleHireDaysInput = {
  status: string;
  start_date: string | null;
  activated_at: string | null;
  ended_at: string | null;
  terminated_at: string | null;
};

export type VehicleHireSettlementInput = {
  settlement_balance_direction: SettlementBalanceDirection | string | null;
  settlement_balance_gbp: number | null;
};

const OPEN_HIRE_STATUSES = new Set<string>([
  "draft",
  "pending_signature",
  "reserved",
  "active",
]);

/**
 * Calendar day from a date column (`YYYY-MM-DD`) or timestamptz (Europe/London day).
 * Matches how hire windows should be read for UK fleet metrics.
 */
export function hireFactYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) && !trimmed.includes("T") && trimmed.length >= 10) {
    return trimmed.slice(0, 10);
  }
  return ukLondonDayYmd(trimmed);
}

export function isOpenHireGroupStatus(status: string): boolean {
  return OPEN_HIRE_STATUSES.has(status);
}

/** Non-draft hires (cancelled already filtered out by the loader). */
export function isCountedHireGroupStatus(status: string): boolean {
  return status !== "draft" && status !== "cancelled";
}

export function pickCurrentOpenHireId(
  rows: readonly { id: string; status: string; updated_at?: string | null; created_at?: string | null }[],
): string | null {
  const open = rows.filter((r) => isOpenHireGroupStatus(r.status));
  if (!open.length) return null;
  const rank = (status: string): number => {
    if (status === "active") return 0;
    if (status === "reserved") return 1;
    if (status === "pending_signature") return 2;
    if (status === "draft") return 3;
    return 4;
  };
  return (
    [...open].sort((a, b) => {
      const byRank = rank(a.status) - rank(b.status);
      if (byRank !== 0) return byRank;
      const aKey = a.updated_at ?? a.created_at ?? "";
      const bKey = b.updated_at ?? b.created_at ?? "";
      return bKey.localeCompare(aKey);
    })[0]?.id ?? null
  );
}

/**
 * On-hire window — same rules as company dashboard `hireWindow`:
 * draft/cancelled = none; start = activated ?? start_date; end = ended ?? terminated ?? today.
 */
export function vehicleHireDayWindow(
  row: VehicleHireDaysInput,
  todayYmd: string,
): { start: string; end: string } | null {
  if (row.status === "draft" || row.status === "cancelled") return null;
  const start = hireFactYmd(row.activated_at) ?? hireFactYmd(row.start_date);
  if (!start) return null;
  const ended = hireFactYmd(row.ended_at) ?? hireFactYmd(row.terminated_at);
  const end = ended || todayYmd;
  if (end < start) return { start, end: start };
  return { start, end };
}

export function hireOnHireStartYmd(row: VehicleHireDaysInput): string | null {
  if (row.status === "draft" || row.status === "cancelled") return null;
  return hireFactYmd(row.activated_at) ?? hireFactYmd(row.start_date);
}

export function hireOnHireEndYmd(row: VehicleHireDaysInput, todayYmd: string): string | null {
  return vehicleHireDayWindow(row, todayYmd)?.end ?? null;
}

export function hireDurationDays(row: VehicleHireDaysInput, todayYmd: string): number {
  const window = vehicleHireDayWindow(row, todayYmd);
  if (!window) return 0;
  return calendarDaysInclusive(window.start, window.end);
}

export function sumVehicleHireDays(rows: readonly VehicleHireDaysInput[], todayYmd: string): number {
  let total = 0;
  for (const row of rows) {
    total += hireDurationDays(row, todayYmd);
  }
  return total;
}

export function countVehicleHires(statuses: readonly string[]): number {
  return statuses.filter((status) => isCountedHireGroupStatus(status)).length;
}

/** Days since vehicle was added (created_at), inclusive through today. */
export function daysSinceVehicleAdded(vehicleCreatedAt: string | null | undefined, todayYmd: string): number {
  const start = hireFactYmd(vehicleCreatedAt);
  if (!start) return 0;
  return calendarDaysInclusive(start, todayYmd);
}

/**
 * Hire days ÷ days since vehicle added.
 * Caps hire days at the denominator (same approach as dashboard period utilisation).
 */
export function hireUtilisationPercent(hireDays: number, daysSinceAdded: number): number | null {
  if (daysSinceAdded <= 0) return null;
  const capped = Math.min(Math.max(0, hireDays), daysSinceAdded);
  return Math.round((capped / daysSinceAdded) * 100);
}

/**
 * Settlement-only outstanding (ended hires). Prefer {@link vehicleHiresAmountDueGbp} when
 * schedule rows are available so active-hire accrued balances are included.
 */
export function outstandingDriverOwesGbp(rows: readonly VehicleHireSettlementInput[]): number {
  let total = 0;
  for (const row of rows) {
    const balance = computeHireWorkspaceSettlementBalance({
      settlementBalanceDirection: (row.settlement_balance_direction as string | null) ?? null,
      settlementBalanceGbp: row.settlement_balance_gbp,
    });
    if (!balance || balance.settlementDirection !== "driver_owes_company") continue;
    if (balance.openBalanceGbp > 0) total += balance.openBalanceGbp;
  }
  return Math.round(total * 100) / 100;
}

/** Amount due for this vehicle — same rules as company dashboard amount due. */
export function vehicleHiresAmountDueGbp(input: {
  hires: readonly DashboardHireFact[];
  scheduleRows: readonly DashboardScheduleFact[];
  todayYmd: string;
}): number {
  return computeDashboardAmountDue(input).gbp;
}

export function settlementTablePill(
  direction: SettlementBalanceDirection | string | null | undefined,
  amountGbp: number | null | undefined,
): { label: string; tone: HireTableStatusTone } {
  const balance = computeHireWorkspaceSettlementBalance({
    settlementBalanceDirection: (direction as string | null) ?? null,
    settlementBalanceGbp: amountGbp ?? 0,
  });
  if (!balance || balance.settled || balance.openBalanceGbp <= 0.005) {
    return { label: "Settled", tone: "success" };
  }
  if (balance.settlementDirection === "driver_owes_company") {
    return { label: `Driver owes £${balance.openBalanceGbp.toFixed(2)}`, tone: "warning" };
  }
  if (balance.settlementDirection === "company_owes_driver") {
    return { label: `Owes driver £${balance.openBalanceGbp.toFixed(2)}`, tone: "pending" };
  }
  return { label: "Settled", tone: "success" };
}

export function mapVehicleHireToDashboardFact(input: {
  id: string;
  vehicleId: string;
  subcompanyId: string;
  status: string;
  start_date: string | null;
  activated_at: string | null;
  ended_at: string | null;
  terminated_at: string | null;
  rent_amount_gbp: number;
  rent_cadence: RentCadence;
  settlement_balance_direction: string | null;
  settlement_balance_gbp: number;
  rentBillingMode: HireTerminationRentBillingMode | null;
}): DashboardHireFact {
  const direction = input.settlement_balance_direction;
  return {
    id: input.id,
    vehicleId: input.vehicleId,
    subcompanyId: input.subcompanyId,
    status: input.status,
    startDateYmd: hireFactYmd(input.start_date),
    activatedAtYmd: hireFactYmd(input.activated_at),
    endedAtYmd: hireFactYmd(input.ended_at),
    terminatedAtYmd: hireFactYmd(input.terminated_at),
    rentAmountGbp: input.rent_amount_gbp,
    rentCadence: input.rent_cadence,
    unsignedAgreementCount: 0,
    insuranceStatus: "none",
    settlementBalanceDirection:
      direction === "driver_owes_company" ||
      direction === "company_owes_driver" ||
      direction === "settled"
        ? direction
        : null,
    settlementOpenBalanceGbp: input.settlement_balance_gbp,
    rentBillingMode: input.rentBillingMode,
  };
}

export function isHireGroupStatus(value: string): value is HireGroupStatus {
  return (
    value === "draft" ||
    value === "pending_signature" ||
    value === "reserved" ||
    value === "active" ||
    value === "completed" ||
    value === "terminated" ||
    value === "cancelled"
  );
}
