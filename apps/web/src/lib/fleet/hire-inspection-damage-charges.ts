import {
  openBalanceDirection,
  remainingOpenBalanceGbp,
  signedSettlementBalanceGbp,
  type HireBalancePaymentInput,
} from "@/lib/fleet/hire-open-balance";

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
  return Math.round(value * 100) / 100;
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
    addToBalanceGbp: Math.round(addToBalanceGbp * 100) / 100,
    paidNowGbp: Math.round(paidNowGbp * 100) / 100,
    waivedGbp: Math.round(waivedGbp * 100) / 100,
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
  const add = Math.round(Math.max(0, input.addToBalanceGbp) * 100) / 100;
  if (add <= 0) {
    const direction = input.settlementBalanceDirection ?? "settled";
    return {
      settlementBalanceDirection: direction === "settled" ? "settled" : direction,
      settlementBalanceGbp: Math.round(Math.abs(input.settlementBalanceGbp) * 100) / 100,
    };
  }

  const signed = signedSettlementBalanceGbp(
    input.settlementBalanceDirection ?? "settled",
    input.settlementBalanceGbp,
  );
  const nextSigned = Math.round((signed + add) * 100) / 100;
  const nextDirection = openBalanceDirection(nextSigned);
  return {
    settlementBalanceDirection: nextDirection,
    settlementBalanceGbp: nextDirection === "settled" ? 0 : Math.abs(nextSigned),
  };
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
  const signed = signedSettlementBalanceGbp(
    input.settlementBalanceDirection ?? "settled",
    input.settlementBalanceGbp,
  );
  const remaining = remainingOpenBalanceGbp(signed, input.payments);
  const direction = openBalanceDirection(remaining);
  return {
    settlementBalanceDirection: direction,
    settlementBalanceGbp: direction === "settled" ? 0 : Math.abs(remaining),
  };
}
