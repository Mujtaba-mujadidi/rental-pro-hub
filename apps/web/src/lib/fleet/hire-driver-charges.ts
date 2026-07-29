import type { HireInspectionDamageChargeResolution } from "@/lib/fleet/hire-inspection-damage-charges";

/** Extensible charge types — add new values here and in product flows as needed. */
export const HIRE_DRIVER_CHARGE_TYPES = ["damage"] as const;

export type HireDriverChargeType = (typeof HIRE_DRIVER_CHARGE_TYPES)[number];

export const HIRE_DRIVER_CHARGE_SOURCE_KINDS = [
  "checkin_inspection_damage",
] as const;

export type HireDriverChargeSourceKind = (typeof HIRE_DRIVER_CHARGE_SOURCE_KINDS)[number];

export const HIRE_BALANCE_PAYMENT_CATEGORIES = ["settlement", "driver_charge"] as const;

export type HireBalancePaymentCategory = (typeof HIRE_BALANCE_PAYMENT_CATEGORIES)[number];

export type HireDriverChargeLineItemInput = {
  chargeType: HireDriverChargeType;
  amountGbp: number;
  resolution: HireInspectionDamageChargeResolution;
  sourceKind: HireDriverChargeSourceKind;
  sourceId?: string | null;
  description?: string | null;
};

export type HireDriverChargeLineItemRow = HireDriverChargeLineItemInput & {
  id: string;
  hireGroupId: string;
  balancePaymentId?: string | null;
  createdAt?: string;
};

export type HireBalancePaymentIncomeRow = {
  hireGroupId?: string | null;
  amountGbp: number;
  direction: string | null;
  paymentCategory?: HireBalancePaymentCategory | string | null;
};

export function hireDriverChargeTypeLabel(chargeType: HireDriverChargeType): string {
  const labels: Record<HireDriverChargeType, string> = {
    damage: "Damage",
  };
  return labels[chargeType] ?? chargeType;
}

export function hireDriverChargeResolutionLabel(
  resolution: HireInspectionDamageChargeResolution,
): string {
  const labels: Record<HireInspectionDamageChargeResolution, string> = {
    waived: "No charge",
    paid_now: "Charged now",
    add_to_balance: "Added to balance",
  };
  return labels[resolution];
}

export function isRecognizedDriverChargeResolution(
  resolution: HireInspectionDamageChargeResolution,
): boolean {
  return resolution === "paid_now" || resolution === "add_to_balance";
}

function roundGbp(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Income recognised from itemized driver charges (accrual at charge time). */
export function sumDriverChargeIncomeGbp(
  lineItems: readonly Pick<HireDriverChargeLineItemInput, "amountGbp" | "resolution">[],
): number {
  let total = 0;
  for (const item of lineItems) {
    if (!isRecognizedDriverChargeResolution(item.resolution)) continue;
    const amount = Number(item.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}

export function sumDriverChargeIncomeByTypeGbp(
  lineItems: readonly (Pick<HireDriverChargeLineItemInput, "amountGbp" | "resolution"> & {
    chargeType: HireDriverChargeType;
  })[],
): Partial<Record<HireDriverChargeType, number>> {
  const totals: Partial<Record<HireDriverChargeType, number>> = {};
  for (const item of lineItems) {
    if (!isRecognizedDriverChargeResolution(item.resolution)) continue;
    const amount = Number(item.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    totals[item.chargeType] = roundGbp((totals[item.chargeType] ?? 0) + amount);
  }
  return totals;
}

/** Keep rent settlement collections separate from driver-charge cash receipts. */
export function partitionBalancePaymentsForIncome(
  payments: readonly HireBalancePaymentIncomeRow[],
): {
  settlementPayments: HireBalancePaymentIncomeRow[];
  driverChargePayments: HireBalancePaymentIncomeRow[];
} {
  const settlementPayments: HireBalancePaymentIncomeRow[] = [];
  const driverChargePayments: HireBalancePaymentIncomeRow[] = [];
  for (const payment of payments) {
    const category = payment.paymentCategory ?? "settlement";
    if (category === "driver_charge") {
      driverChargePayments.push(payment);
    } else {
      settlementPayments.push(payment);
    }
  }
  return { settlementPayments, driverChargePayments };
}

export function buildDriverChargeDraftsFromCheckinDamages(
  damages: readonly {
    id: string;
    panelId: string;
    panelLabel?: string;
    damageType: string;
    severity: string;
    checkoutDamageId: string | null;
    chargeGbp: number | null;
    chargeResolution: HireInspectionDamageChargeResolution | null;
  }[],
): HireDriverChargeLineItemInput[] {
  const drafts: HireDriverChargeLineItemInput[] = [];
  for (const damage of damages) {
    if (damage.checkoutDamageId != null) continue;
    if (!damage.chargeResolution || damage.chargeResolution === "waived") continue;
    const amount = Number(damage.chargeGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const panel = damage.panelLabel ?? damage.panelId.replace(/_/g, " ");
    drafts.push({
      chargeType: "damage",
      amountGbp: roundGbp(amount),
      resolution: damage.chargeResolution,
      sourceKind: "checkin_inspection_damage",
      sourceId: damage.id,
      description: `${panel} · ${damage.damageType} · ${damage.severity}`,
    });
  }
  return drafts;
}

export type DriverChargeLineItemDbRow = {
  id: string;
  hire_group_id: string;
  charge_type: string;
  amount_gbp: number | string;
  resolution: string;
  source_kind: string;
  source_id?: string | null;
  description?: string | null;
  balance_payment_id?: string | null;
  created_at?: string;
};

function isHireDriverChargeType(value: string): value is HireDriverChargeType {
  return (HIRE_DRIVER_CHARGE_TYPES as readonly string[]).includes(value);
}

function isHireDriverChargeSourceKind(value: string): value is HireDriverChargeSourceKind {
  return (HIRE_DRIVER_CHARGE_SOURCE_KINDS as readonly string[]).includes(value);
}

export function mapDriverChargeLineItemFromDb(
  row: DriverChargeLineItemDbRow,
): HireDriverChargeLineItemRow | null {
  const chargeType = row.charge_type;
  const resolution = row.resolution as HireInspectionDamageChargeResolution;
  const sourceKind = row.source_kind;
  if (!isHireDriverChargeType(chargeType)) return null;
  if (!isHireDriverChargeSourceKind(sourceKind)) return null;
  if (resolution !== "waived" && resolution !== "paid_now" && resolution !== "add_to_balance") {
    return null;
  }
  const amountGbp = Number(row.amount_gbp);
  if (!Number.isFinite(amountGbp) || amountGbp <= 0) return null;

  return {
    id: row.id,
    hireGroupId: row.hire_group_id,
    chargeType,
    amountGbp: roundGbp(amountGbp),
    resolution,
    sourceKind,
    sourceId: row.source_id ?? null,
    description: row.description ?? null,
    balancePaymentId: row.balance_payment_id ?? null,
    createdAt: row.created_at,
  };
}

export function mapDriverChargeLineItemsFromDb(
  rows: readonly DriverChargeLineItemDbRow[],
): HireDriverChargeLineItemRow[] {
  const items: HireDriverChargeLineItemRow[] = [];
  for (const row of rows) {
    const mapped = mapDriverChargeLineItemFromDb(row);
    if (mapped) items.push(mapped);
  }
  return items;
}
