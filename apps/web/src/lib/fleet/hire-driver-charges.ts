import type { HireInspectionDamageChargeResolution } from "@/lib/fleet/hire-inspection-damage-charges";

/** Extensible charge types — add new values here and in product flows as needed. */
export const HIRE_DRIVER_CHARGE_TYPES = ["damage", "administration", "other"] as const;

export type HireDriverChargeType = (typeof HIRE_DRIVER_CHARGE_TYPES)[number];

export const HIRE_DRIVER_CHARGE_SOURCE_KINDS = [
  "checkin_inspection_damage",
  "staff_manual",
] as const;

export type HireDriverChargeSourceKind = (typeof HIRE_DRIVER_CHARGE_SOURCE_KINDS)[number];

export const HIRE_BALANCE_PAYMENT_CATEGORIES = ["settlement", "driver_charge"] as const;

export type HireBalancePaymentCategory = (typeof HIRE_BALANCE_PAYMENT_CATEGORIES)[number];

export type HireDriverChargeLineItemInput = {
  hireGroupId?: string | null;
  chargeType: HireDriverChargeType;
  amountGbp: number;
  resolution: HireInspectionDamageChargeResolution;
  sourceKind: HireDriverChargeSourceKind;
  sourceId?: string | null;
  description?: string | null;
  chargedOn?: string | null;
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

export function hireDriverChargeTypeLabel(chargeType: HireDriverChargeType | string): string {
  const labels: Record<HireDriverChargeType, string> = {
    damage: "Damage",
    administration: "Administration",
    other: "Other",
  };
  if (isHireDriverChargeType(chargeType)) return labels[chargeType];
  return chargeType;
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

export type RealisedDriverChargeIncomeInput = {
  charges: readonly Pick<HireDriverChargeLineItemInput, "amountGbp" | "resolution" | "chargeType">[];
  receipts?: readonly Pick<HireBalancePaymentIncomeRow, "amountGbp" | "direction" | "paymentCategory">[];
  /** Remaining unpaid add_to_balance extras are realised when the hire is settled. */
  hireSettled?: boolean;
};

/**
 * Vehicle P&L income from driver charges: collected cash, or extras netted when the hire is settled.
 * Unpaid add_to_balance extras on an open hire are owed, not profit.
 */
export function realisedDriverChargeIncomeGbp(input: RealisedDriverChargeIncomeInput): {
  totalGbp: number;
  byTypeGbp: Partial<Record<HireDriverChargeType, number>>;
} {
  const hireSettled = input.hireSettled === true;
  let paidNowGbp = 0;
  let addToBalanceGbp = 0;
  const paidNowByType: Partial<Record<HireDriverChargeType, number>> = {};
  const addToBalanceByType: Partial<Record<HireDriverChargeType, number>> = {};

  for (const item of input.charges) {
    if (!isRecognizedDriverChargeResolution(item.resolution)) continue;
    const amount = Number(item.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (item.resolution === "paid_now") {
      paidNowGbp += amount;
      paidNowByType[item.chargeType] = roundGbp((paidNowByType[item.chargeType] ?? 0) + amount);
    } else {
      addToBalanceGbp += amount;
      addToBalanceByType[item.chargeType] = roundGbp((addToBalanceByType[item.chargeType] ?? 0) + amount);
    }
  }
  paidNowGbp = roundGbp(paidNowGbp);
  addToBalanceGbp = roundGbp(addToBalanceGbp);

  let driverChargeReceivedGbp = 0;
  for (const payment of input.receipts ?? []) {
    if (payment.paymentCategory !== "driver_charge") continue;
    if (payment.direction !== "received_from_driver") continue;
    const amount = Number(payment.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    driverChargeReceivedGbp += amount;
  }
  const collectedAgainstExtrasGbp = roundGbp(
    Math.min(addToBalanceGbp, Math.max(0, roundGbp(driverChargeReceivedGbp) - paidNowGbp)),
  );
  const extrasRealisedGbp = hireSettled ? addToBalanceGbp : collectedAgainstExtrasGbp;

  const byTypeGbp: Partial<Record<HireDriverChargeType, number>> = { ...paidNowByType };
  const extrasByType = allocateGbpByWeight(extrasRealisedGbp, addToBalanceByType);
  for (const type of HIRE_DRIVER_CHARGE_TYPES) {
    const extra = extrasByType[type] ?? 0;
    if (extra <= 0.005 && (byTypeGbp[type] ?? 0) <= 0.005) continue;
    byTypeGbp[type] = roundGbp((byTypeGbp[type] ?? 0) + extra);
    if ((byTypeGbp[type] ?? 0) <= 0.005) delete byTypeGbp[type];
  }

  return {
    totalGbp: roundGbp(paidNowGbp + extrasRealisedGbp),
    byTypeGbp,
  };
}

function allocateGbpByWeight(
  amountGbp: number,
  weights: Partial<Record<HireDriverChargeType, number>>,
): Partial<Record<HireDriverChargeType, number>> {
  const totalWeight = roundGbp(
    HIRE_DRIVER_CHARGE_TYPES.reduce((sum, type) => sum + (weights[type] ?? 0), 0),
  );
  if (amountGbp <= 0.005 || totalWeight <= 0.005) return {};
  const allocated: Partial<Record<HireDriverChargeType, number>> = {};
  let remaining = amountGbp;
  const typesWithWeight = HIRE_DRIVER_CHARGE_TYPES.filter((type) => (weights[type] ?? 0) > 0.005);
  for (let i = 0; i < typesWithWeight.length; i += 1) {
    const type = typesWithWeight[i]!;
    const share =
      i === typesWithWeight.length - 1
        ? remaining
        : roundGbp((amountGbp * (weights[type] ?? 0)) / totalWeight);
    allocated[type] = share;
    remaining = roundGbp(remaining - share);
  }
  return allocated;
}

/** Income recognised on vehicle P&L from itemized driver charges (realised, not billed). */
export function sumDriverChargeIncomeGbp(
  lineItems: readonly Pick<HireDriverChargeLineItemInput, "amountGbp" | "resolution" | "chargeType">[],
  receipts: readonly Pick<HireBalancePaymentIncomeRow, "amountGbp" | "direction" | "paymentCategory">[] = [],
  options?: { hireSettled?: boolean },
): number {
  return realisedDriverChargeIncomeGbp({
    charges: lineItems,
    receipts,
    hireSettled: options?.hireSettled,
  }).totalGbp;
}

export function sumDriverChargeIncomeByTypeGbp(
  lineItems: readonly (Pick<HireDriverChargeLineItemInput, "amountGbp" | "resolution"> & {
    chargeType: HireDriverChargeType;
  })[],
  receipts: readonly Pick<HireBalancePaymentIncomeRow, "amountGbp" | "direction" | "paymentCategory">[] = [],
  options?: { hireSettled?: boolean },
): Partial<Record<HireDriverChargeType, number>> {
  return realisedDriverChargeIncomeGbp({
    charges: lineItems,
    receipts,
    hireSettled: options?.hireSettled,
  }).byTypeGbp;
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
  charged_on?: string | null;
  created_at?: string;
};

export function isHireDriverChargeType(value: string): value is HireDriverChargeType {
  return (HIRE_DRIVER_CHARGE_TYPES as readonly string[]).includes(value);
}

export function isHireDriverChargeSourceKind(value: string): value is HireDriverChargeSourceKind {
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
    chargedOn: row.charged_on ?? null,
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

/**
 * Extra charges still owed on an active hire (or still outstanding at terminate).
 * Check-in `paid_now` cash is linked to those lines; those receipts must not reduce
 * `add_to_balance` extras.
 */
export function outstandingExtraChargesGbp(
  charges: readonly Pick<HireDriverChargeLineItemRow, "amountGbp" | "resolution">[],
  receipts: readonly Pick<HireBalancePaymentIncomeRow, "amountGbp" | "direction" | "paymentCategory">[],
): number {
  let addToBalanceGbp = 0;
  let paidNowGbp = 0;
  for (const item of charges) {
    const amount = Number(item.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    if (item.resolution === "add_to_balance") addToBalanceGbp += amount;
    else if (item.resolution === "paid_now") paidNowGbp += amount;
  }

  let driverChargeReceivedGbp = 0;
  for (const payment of receipts) {
    if (payment.paymentCategory !== "driver_charge") continue;
    if (payment.direction !== "received_from_driver") continue;
    const amount = Number(payment.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    driverChargeReceivedGbp += amount;
  }

  const receiptsAgainstExtras = roundGbp(Math.max(0, driverChargeReceivedGbp - paidNowGbp));
  return roundGbp(Math.max(0, addToBalanceGbp - receiptsAgainstExtras));
}

export function isStaffManualChargeMutable(input: {
  sourceKind: string;
  balancePaymentId?: string | null;
}): boolean {
  return input.sourceKind === "staff_manual" && !input.balancePaymentId;
}

export type HireDriverChargeWorkspaceView = {
  id: string;
  chargeType: string;
  chargeTypeLabel: string;
  amountGbp: number;
  resolution: string;
  resolutionLabel: string;
  description: string | null;
  createdAt: string;
  chargedOn: string | null;
  sourceKind: string;
  canMutate: boolean;
};

export function toHireDriverChargeWorkspaceView(
  item: HireDriverChargeLineItemRow,
  options?: { allowMutate?: boolean },
): HireDriverChargeWorkspaceView {
  const allowMutate = options?.allowMutate === true;
  return {
    id: item.id,
    chargeType: item.chargeType,
    chargeTypeLabel: hireDriverChargeTypeLabel(item.chargeType),
    amountGbp: item.amountGbp,
    resolution: item.resolution,
    resolutionLabel: hireDriverChargeResolutionLabel(item.resolution),
    description: item.description ?? null,
    createdAt: item.createdAt ?? "",
    chargedOn: item.chargedOn ?? null,
    sourceKind: item.sourceKind,
    canMutate: allowMutate && isStaffManualChargeMutable(item),
  };
}
