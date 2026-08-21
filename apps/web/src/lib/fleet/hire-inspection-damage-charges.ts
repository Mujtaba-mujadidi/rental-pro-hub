import {
  recomputeSettlementBalanceCache,
  type HireBalancePaymentInput,
} from "@/lib/fleet/hire-open-balance";
import { clampNonNegativeGbp, isZeroGbp, roundGbp } from "@/lib/fleet/hire-money";

export const HIRE_INSPECTION_DAMAGE_CHARGE_RESOLUTIONS = [
  "waived",
  "paid_now",
  "add_to_balance",
] as const;

export type HireInspectionDamageChargeResolution =
  (typeof HIRE_INSPECTION_DAMAGE_CHARGE_RESOLUTIONS)[number];

export type HireInspectionDamageChargeRow = {
  id: string;
  checkoutDamageId: string | null;
  chargeGbp: number | null;
  chargeResolution: HireInspectionDamageChargeResolution | null;
};

export function isNewInspectionDamage(damage: { checkoutDamageId: string | null }): boolean {
  return damage.checkoutDamageId == null;
}

export function isValidDamageChargeResolution(
  value: string | null | undefined,
): value is HireInspectionDamageChargeResolution {
  return (
    value != null &&
    (HIRE_INSPECTION_DAMAGE_CHARGE_RESOLUTIONS as readonly string[]).includes(value)
  );
}

export function parseDamageChargeGbp(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return roundGbp(value);
}

export function summarizeInspectionDamageCharges(
  damages: readonly HireInspectionDamageChargeRow[],
): {
  addToBalanceGbp: number;
  paidNowGbp: number;
  waivedGbp: number;
} {
  let addToBalanceGbp = 0;
  let paidNowGbp = 0;
  let waivedGbp = 0;

  for (const damage of damages) {
    if (!isNewInspectionDamage(damage)) continue;
    const amount = parseDamageChargeGbp(damage.chargeGbp);
    if (amount == null || amount <= 0) continue;
    if (damage.chargeResolution === "add_to_balance") addToBalanceGbp += amount;
    else if (damage.chargeResolution === "paid_now") paidNowGbp += amount;
    else if (damage.chargeResolution === "waived") waivedGbp += amount;
  }

  return {
    addToBalanceGbp: roundGbp(addToBalanceGbp),
    paidNowGbp: roundGbp(paidNowGbp),
    waivedGbp: roundGbp(waivedGbp),
  };
}

export function validateInspectionDamageCharges(
  damages: readonly HireInspectionDamageChargeRow[],
): string | null {
  for (const damage of damages) {
    if (!isNewInspectionDamage(damage)) continue;
    const amount = parseDamageChargeGbp(damage.chargeGbp);
    if (amount == null || amount <= 0) {
      if (damage.chargeResolution && damage.chargeResolution !== "waived") {
        return "Enter a charge amount for each new damage you want to bill.";
      }
      continue;
    }
    if (!damage.chargeResolution) {
      return "Choose how to resolve each new damage charge.";
    }
  }
  return null;
}

/** Increase driver-owes-company settlement balance by damage charges added to balance. */
export function applyDamageChargesToSettlementBalance(input: {
  settlementBalanceDirection:
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null;
  settlementBalanceGbp: number;
  addToBalanceGbp: number;
}): {
  settlementBalanceDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  settlementBalanceGbp: number;
} {
  const add = clampNonNegativeGbp(roundGbp(input.addToBalanceGbp));
  if (isZeroGbp(add)) {
    return recomputeSettlementBalanceCache({
      openingDirection: input.settlementBalanceDirection,
      openingBalanceGbp: input.settlementBalanceGbp,
    });
  }

  return recomputeSettlementBalanceCache({
    openingDirection: input.settlementBalanceDirection,
    openingBalanceGbp: input.settlementBalanceGbp,
    extraChargesAddedGbp: add,
  });
}

/** Apply a signed extra-charge delta (positive = driver owes more). */
export function applySignedChargeDeltaToSettlementBalance(input: {
  settlementBalanceDirection:
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null;
  settlementBalanceGbp: number;
  deltaGbp: number;
}): {
  settlementBalanceDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  settlementBalanceGbp: number;
} {
  const delta = roundGbp(input.deltaGbp);
  if (isZeroGbp(delta)) {
    return recomputeSettlementBalanceCache({
      openingDirection: input.settlementBalanceDirection,
      openingBalanceGbp: input.settlementBalanceGbp,
    });
  }

  return recomputeSettlementBalanceCache({
    openingDirection: input.settlementBalanceDirection,
    openingBalanceGbp: input.settlementBalanceGbp,
    extraChargesAddedGbp: delta,
  });
}

export function settlementBalanceAfterPayments(input: {
  settlementBalanceDirection:
    | "driver_owes_company"
    | "company_owes_driver"
    | "settled"
    | null;
  settlementBalanceGbp: number;
  payments: readonly HireBalancePaymentInput[];
}): {
  settlementBalanceDirection: "driver_owes_company" | "company_owes_driver" | "settled";
  settlementBalanceGbp: number;
} {
  return recomputeSettlementBalanceCache({
    openingDirection: input.settlementBalanceDirection,
    openingBalanceGbp: input.settlementBalanceGbp,
    payments: input.payments,
  });
}
