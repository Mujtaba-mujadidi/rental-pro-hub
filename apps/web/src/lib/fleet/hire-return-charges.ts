import {
  HIRE_INSPECTION_ACCESSORY_KEYS,
  hireInspectionAccessoryLabel,
  type HireInspectionAccessories,
  type HireInspectionAccessoryKey,
} from "@/lib/fleet/hire-inspection-accessories";
import {
  isNewInspectionDamage,
  parseDamageChargeGbp,
  type HireInspectionDamageChargeResolution,
} from "@/lib/fleet/hire-inspection-damage-charges";
import type { HireDriverChargeLineItemInput } from "@/lib/fleet/hire-driver-charges";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";
import { roundGbp } from "@/lib/fleet/hire-money";

export const HIRE_RETURN_CHARGE_SOURCE_KINDS = [
  "checkin_inspection_damage",
  "checkin_inspection_fuel",
  "checkin_inspection_accessory",
] as const;

export type HireReturnChargeSourceKind = (typeof HIRE_RETURN_CHARGE_SOURCE_KINDS)[number];

/** Final-account return charges never collect cash — only decide the balance sheet. */
export const HIRE_RETURN_CHARGE_RESOLUTIONS = [
  "waived",
  "add_to_balance",
  "review_later",
] as const;

export type HireReturnChargeResolution = (typeof HIRE_RETURN_CHARGE_RESOLUTIONS)[number];

export function isHireReturnChargeSourceKind(value: string): value is HireReturnChargeSourceKind {
  return (HIRE_RETURN_CHARGE_SOURCE_KINDS as readonly string[]).includes(value);
}

export function isHireReturnChargeResolution(
  value: string | null | undefined,
): value is HireReturnChargeResolution {
  return (
    value != null && (HIRE_RETURN_CHARGE_RESOLUTIONS as readonly string[]).includes(value)
  );
}

export type HireReturnChargeDamageInput = {
  id: string;
  checkoutDamageId: string | null;
  chargeGbp: number | null;
  chargeResolution: HireInspectionDamageChargeResolution | null;
};

export type HireReturnChargeOptionalInput = {
  enabled: boolean;
  amountGbp: number | null;
  chargeResolution: HireInspectionDamageChargeResolution | null;
};

export type HireReturnChargeAccessoryInput = HireReturnChargeOptionalInput & {
  key: HireInspectionAccessoryKey;
};

export function listMissingAccessoryItems(
  checkout: HireInspectionAccessories,
  checkin: HireInspectionAccessories,
): HireInspectionAccessoryKey[] {
  const missing: HireInspectionAccessoryKey[] = [];
  for (const key of HIRE_INSPECTION_ACCESSORY_KEYS) {
    if (checkout[key] === true && checkin[key] === false) {
      missing.push(key);
    }
  }
  return missing;
}

/** True when return fuel is lower than checkout fuel (both recorded). */
export function hasFuelReturnShortfall(
  checkoutFuelLevel: number | null,
  checkinFuelLevel: number | null,
): boolean {
  if (checkoutFuelLevel == null || checkinFuelLevel == null) return false;
  return checkinFuelLevel < checkoutFuelLevel;
}

export function isReturnDamageResolved(damage: HireReturnChargeDamageInput): boolean {
  if (!isNewInspectionDamage(damage)) return true;
  if (!damage.chargeResolution) return false;
  if (damage.chargeResolution === "waived" || damage.chargeResolution === "review_later") {
    return true;
  }
  // Legacy paid_now rows count as resolved; new applies only use add_to_balance.
  if (
    damage.chargeResolution !== "add_to_balance" &&
    damage.chargeResolution !== "paid_now"
  ) {
    return false;
  }
  const amount = parseDamageChargeGbp(damage.chargeGbp);
  return amount != null && amount > 0;
}

export function validateOptionalReturnCharge(input: HireReturnChargeOptionalInput): string | null {
  if (!input.enabled) return null;
  if (input.chargeResolution === "review_later") return null;
  if (input.chargeResolution === "paid_now") {
    return "Return charges are added to the hire balance. Record payment from Payments.";
  }
  const amount = parseDamageChargeGbp(input.amountGbp);
  if (amount == null || amount <= 0) return "Enter a charge amount.";
  if (input.chargeResolution !== "add_to_balance") {
    return "Choose whether to charge this item to the hire balance.";
  }
  return null;
}

export function validateReturnDamageCharges(
  damages: readonly HireReturnChargeDamageInput[],
): string | null {
  for (const damage of damages) {
    if (!isNewInspectionDamage(damage)) continue;
    if (!damage.chargeResolution) {
      return "Choose how to resolve each new damage.";
    }
    if (damage.chargeResolution === "paid_now") {
      return "Return charges are added to the hire balance. Record payment from Payments.";
    }
    if (damage.chargeResolution === "waived" || damage.chargeResolution === "review_later") {
      continue;
    }
    if (damage.chargeResolution !== "add_to_balance") {
      return "Choose how to resolve each new damage.";
    }
    const amount = parseDamageChargeGbp(damage.chargeGbp);
    if (amount == null || amount <= 0) {
      return "Enter a charge amount for each new damage you want to bill.";
    }
  }
  return null;
}

export function areReturnChargesReady(input: {
  newDamages: readonly HireReturnChargeDamageInput[];
  returnChargesDraftSavedAt?: string | null;
  returnChargesAppliedAt?: string | null;
  hasReturnChargeWork?: boolean;
}): boolean {
  const hasWork =
    input.hasReturnChargeWork ??
    (input.newDamages.length > 0);
  if (!hasWork) return true;
  if (input.returnChargesAppliedAt?.trim()) return true;
  if (!input.returnChargesDraftSavedAt?.trim()) return false;
  return input.newDamages.every(isReturnDamageResolved);
}

export function buildReturnChargeLineItemDrafts(input: {
  damages: readonly {
    id: string;
    panelId: string;
    panelLabel?: string;
    damageType: string;
    severity: string;
    checkoutDamageId: string | null;
    chargeGbp: number | null;
    chargeResolution: HireInspectionDamageChargeResolution | null;
  }[];
  fuel?: {
    enabled: boolean;
    amountGbp: number | null;
    chargeResolution: HireInspectionDamageChargeResolution | null;
    checkoutFuelLevel: number | null;
    checkinFuelLevel: number | null;
    checkinInspectionId: string;
  };
  accessories?: readonly {
    key: HireInspectionAccessoryKey;
    enabled: boolean;
    amountGbp: number | null;
    chargeResolution: HireInspectionDamageChargeResolution | null;
  }[];
}): HireDriverChargeLineItemInput[] {
  const drafts: HireDriverChargeLineItemInput[] = [];

  for (const damage of input.damages) {
    if (!isNewInspectionDamage(damage)) continue;
    if (damage.chargeResolution !== "add_to_balance") continue;
    const amount = parseDamageChargeGbp(damage.chargeGbp);
    if (amount == null || amount <= 0) continue;
    const panel = damage.panelLabel ?? damage.panelId.replace(/_/g, " ");
    drafts.push({
      chargeType: "damage",
      amountGbp: roundGbp(amount),
      resolution: "add_to_balance",
      sourceKind: "checkin_inspection_damage",
      sourceId: damage.id,
      description: `${panel} · ${damage.damageType} · ${damage.severity}`,
    });
  }

  if (input.fuel?.enabled && input.fuel.chargeResolution === "add_to_balance") {
    const amount = parseDamageChargeGbp(input.fuel.amountGbp);
    if (amount != null && amount > 0) {
      const checkoutLabel = formatHireFuelLevelPercent(input.fuel.checkoutFuelLevel);
      const checkinLabel = formatHireFuelLevelPercent(input.fuel.checkinFuelLevel);
      drafts.push({
        chargeType: "other",
        amountGbp: roundGbp(amount),
        resolution: "add_to_balance",
        sourceKind: "checkin_inspection_fuel",
        sourceId: input.fuel.checkinInspectionId,
        description: `Fuel difference — checkout ${checkoutLabel} / return ${checkinLabel}`,
      });
    }
  }

  for (const accessory of input.accessories ?? []) {
    if (!accessory.enabled || accessory.chargeResolution !== "add_to_balance") continue;
    const amount = parseDamageChargeGbp(accessory.amountGbp);
    if (amount == null || amount <= 0) continue;
    drafts.push({
      chargeType: "other",
      amountGbp: roundGbp(amount),
      resolution: "add_to_balance",
      sourceKind: "checkin_inspection_accessory",
      sourceId: accessory.key,
      description: `Missing ${hireInspectionAccessoryLabel(accessory.key)}`,
    });
  }

  return drafts;
}

export function sumReturnChargeAddToBalanceGbp(
  damages: readonly HireReturnChargeDamageInput[],
): number {
  let total = 0;
  for (const damage of damages) {
    if (!isNewInspectionDamage(damage)) continue;
    if (damage.chargeResolution !== "add_to_balance") continue;
    const amount = parseDamageChargeGbp(damage.chargeGbp);
    if (amount == null || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}

export function sumLineItemAddToBalanceGbp(
  lineItems: readonly Pick<HireDriverChargeLineItemInput, "amountGbp" | "resolution">[],
): number {
  let total = 0;
  for (const item of lineItems) {
    if (item.resolution !== "add_to_balance") continue;
    const amount = Number(item.amountGbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    total += amount;
  }
  return roundGbp(total);
}
