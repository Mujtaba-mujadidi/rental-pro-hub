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
import { formatHireReturnDamageChargeLabel } from "@/lib/fleet/vehicle-damage-panels";

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

/** Human-readable (and stable) description for a missing-accessory return charge. */
export function hireReturnAccessoryChargeDescription(key: HireInspectionAccessoryKey): string {
  return `Missing ${hireInspectionAccessoryLabel(key)}`;
}

/**
 * Resolve accessory key from a posted charge.
 * Prefer the description (source_id is the check-in UUID for UUID-typed columns);
 * also accept a legacy source_id that stored the accessory key directly.
 */
export function parseHireReturnAccessoryKeyFromCharge(input: {
  sourceId?: string | null;
  description?: string | null;
}): HireInspectionAccessoryKey | null {
  const sourceId = input.sourceId?.trim() ?? "";
  if ((HIRE_INSPECTION_ACCESSORY_KEYS as readonly string[]).includes(sourceId)) {
    return sourceId as HireInspectionAccessoryKey;
  }
  const description = input.description?.trim() ?? "";
  if (!description) return null;
  for (const key of HIRE_INSPECTION_ACCESSORY_KEYS) {
    const canonical = hireReturnAccessoryChargeDescription(key);
    if (description === canonical) return key;
    // Older pending-review / UI copy used "Missing accessory · {label}".
    const label = hireInspectionAccessoryLabel(key);
    if (description === `Missing accessory · ${label}`) return key;
    if (description.toLowerCase() === canonical.toLowerCase()) return key;
  }
  return null;
}

/**
 * Keep one live posted return-charge row per source (oldest first).
 * Guards against rare duplicate inserts from concurrent apply, and against
 * accessory rows that used different source_id shapes for the same key.
 */
export function dedupePostedAccessoryChargeRows<T extends {
  id: string;
  sourceKind: string;
  sourceId?: string | null;
  description?: string | null;
  createdAt?: string | null;
}>(rows: readonly T[]): T[] {
  const seenSourceKeys = new Set<string>();
  const seenAccessoryKeys = new Set<HireInspectionAccessoryKey>();
  const ordered = [...rows].sort((a, b) => {
    const aAt = a.createdAt?.trim() || "";
    const bAt = b.createdAt?.trim() || "";
    if (aAt !== bAt) return aAt.localeCompare(bAt);
    return a.id.localeCompare(b.id);
  });
  const out: T[] = [];
  for (const row of ordered) {
    const sourceId = row.sourceId?.trim() || "";
    if (isHireReturnChargeSourceKind(row.sourceKind) && sourceId) {
      const sourceKey = `${row.sourceKind}:${sourceId}`;
      if (seenSourceKeys.has(sourceKey)) continue;
      seenSourceKeys.add(sourceKey);
    }
    if (row.sourceKind === "checkin_inspection_accessory") {
      const key = parseHireReturnAccessoryKeyFromCharge(row);
      if (key) {
        if (seenAccessoryKeys.has(key)) continue;
        seenAccessoryKeys.add(key);
      }
    }
    out.push(row);
  }
  return out;
}

/** True when a Postgres/PostgREST error is a unique-constraint conflict. */
export function isUniqueChargeSourceConflict(error: {
  code?: string | null;
  message?: string | null;
} | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message ?? "");
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
  /** Kept for fuel source_id; accessories use the accessory key (text source_id). */
  checkinInspectionId?: string | null;
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
      // Text source_id (post-migration). Legacy UUID rows still parse via description.
      sourceId: accessory.key,
      description: hireReturnAccessoryChargeDescription(accessory.key),
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

/**
 * Settlement delta when posting return charges.
 * If the open balance already includes the next return-charge total (draft applied to
 * settlement without line items), returns 0 so we only persist the charges table.
 */
export function returnChargeSettlementDeltaGbp(input: {
  currentOpenGbp: number;
  rentOutstandingGbp: number;
  extrasOutstandingGbp: number;
  previousPostedReturnGbp: number;
  nextPostedReturnGbp: number;
}): number {
  const naive = roundGbp(input.nextPostedReturnGbp - input.previousPostedReturnGbp);
  const current = roundGbp(Math.abs(input.currentOpenGbp));
  const extras = roundGbp(Math.max(0, input.extrasOutstandingGbp));
  const rent = roundGbp(input.rentOutstandingGbp);
  const expectedWithNext = roundGbp(rent + extras + input.nextPostedReturnGbp);
  const expectedWithPrevious = roundGbp(rent + extras + input.previousPostedReturnGbp);
  if (Math.abs(current - expectedWithNext) <= 0.005) return 0;
  if (Math.abs(current - expectedWithPrevious) <= 0.005) return naive;
  return naive;
}

/**
 * When return charges are posted as line items but the hire open settlement still
 * matches rent + hire-time extras only (deposit not applied to balance), return the
 * missing return-charge amount so Overview / Payments can heal settlement.
 */
export function missingPostedReturnChargeSettlementGbp(input: {
  settlementBalanceDirection: string | null | undefined;
  settlementBalanceGbp: number;
  depositDisposition: string | null | undefined;
  rentOutstandingGbp: number;
  /** Outstanding hire-time extras only (exclude return-charge source kinds). */
  hireExtrasOutstandingGbp: number;
  postedReturnAddToBalanceGbp: number;
}): number {
  const postedReturn = roundGbp(Math.max(0, input.postedReturnAddToBalanceGbp));
  if (postedReturn <= 0.005) return 0;

  const disposition = (input.depositDisposition ?? "").trim();
  if (disposition === "apply_to_balance" || disposition === "forfeit") {
    // Open balance is already net of deposit — do not infer from rent + extras alone.
    return 0;
  }

  const direction = input.settlementBalanceDirection ?? null;
  if (direction === "company_owes_driver") return 0;

  const current = roundGbp(Math.max(0, Number(input.settlementBalanceGbp) || 0));
  const withoutReturn = roundGbp(
    Math.max(0, input.rentOutstandingGbp) + Math.max(0, input.hireExtrasOutstandingGbp),
  );
  const withReturn = roundGbp(withoutReturn + postedReturn);

  if (Math.abs(current - withReturn) <= 0.005) return 0;
  if (Math.abs(current - withoutReturn) <= 0.005) return postedReturn;

  const gap = roundGbp(withReturn - current);
  if (gap > 0.005 && Math.abs(gap - postedReturn) <= 0.005) return postedReturn;
  return 0;
}

export type UnpostedReturnChargeRow = {
  id: string;
  label: string;
  amountGbp: number;
};

/** add_to_balance draft rows that are not yet in `vehicle_hire_driver_charge_line_items`. */
export function listUnpostedReturnChargeAddToBalanceRows(input: {
  draft: {
    damages: readonly {
      id: string;
      chargeGbp: number | null;
      chargeResolution: string | null;
    }[];
    fuel: {
      enabled: boolean;
      amountGbp: number | null;
      chargeResolution: string | null;
    };
    accessories: readonly {
      key: string;
      enabled: boolean;
      amountGbp: number | null;
      chargeResolution: string | null;
    }[];
  } | null | undefined;
  posted: readonly {
    sourceKind: string;
    sourceId?: string | null;
    description?: string | null;
  }[];
  damageMeta?: readonly {
    id: string;
    panelId?: string | null;
    panelLabel?: string | null;
    damageType?: string | null;
  }[];
}): UnpostedReturnChargeRow[] {
  const draft = input.draft;
  if (!draft) return [];
  const postedKeys = new Set(
    input.posted
      .filter((row) => isHireReturnChargeSourceKind(row.sourceKind))
      .filter((row) => row.sourceKind !== "checkin_inspection_accessory")
      .map((row) => `${row.sourceKind}:${row.sourceId ?? ""}`),
  );
  const postedAccessoryKeys = new Set(
    input.posted
      .filter((row) => row.sourceKind === "checkin_inspection_accessory")
      .map((row) => parseHireReturnAccessoryKeyFromCharge(row))
      .filter((key): key is HireInspectionAccessoryKey => key != null),
  );
  const postedAccessoryDescriptions = new Set(
    input.posted
      .filter((row) => row.sourceKind === "checkin_inspection_accessory")
      .map((row) => row.description?.trim().toLowerCase() ?? "")
      .filter(Boolean),
  );
  const damageMetaById = new Map((input.damageMeta ?? []).map((row) => [row.id, row]));
  const rows: UnpostedReturnChargeRow[] = [];

  for (const damage of draft.damages) {
    if (damage.chargeResolution !== "add_to_balance") continue;
    const amount = parseDamageChargeGbp(damage.chargeGbp);
    if (amount == null || amount <= 0) continue;
    const key = `checkin_inspection_damage:${damage.id}`;
    if (postedKeys.has(key)) continue;
    const meta = damageMetaById.get(damage.id);
    rows.push({
      id: `unposted-damage-${damage.id}`,
      label: formatHireReturnDamageChargeLabel({
        panelId: meta?.panelId,
        panelLabel: meta?.panelLabel,
        damageType: meta?.damageType,
      }),
      amountGbp: roundGbp(amount),
    });
  }

  if (draft.fuel.enabled && draft.fuel.chargeResolution === "add_to_balance") {
    const amount = parseDamageChargeGbp(draft.fuel.amountGbp);
    if (amount != null && amount > 0) {
      const alreadyPosted = [...postedKeys].some((key) =>
        key.startsWith("checkin_inspection_fuel:"),
      );
      if (!alreadyPosted) {
        rows.push({
          id: "unposted-fuel",
          label: "Fuel shortfall",
          amountGbp: roundGbp(amount),
        });
      }
    }
  }

  for (const accessory of draft.accessories) {
    if (!accessory.enabled || accessory.chargeResolution !== "add_to_balance") continue;
    const amount = parseDamageChargeGbp(accessory.amountGbp);
    if (amount == null || amount <= 0) continue;
    const known = (HIRE_INSPECTION_ACCESSORY_KEYS as readonly string[]).includes(accessory.key);
    if (known && postedAccessoryKeys.has(accessory.key as HireInspectionAccessoryKey)) continue;
    const label = known
      ? hireReturnAccessoryChargeDescription(accessory.key as HireInspectionAccessoryKey)
      : `Missing accessory · ${accessory.key}`;
    if (postedAccessoryDescriptions.has(label.toLowerCase())) continue;
    rows.push({
      id: `unposted-accessory-${accessory.key}`,
      label,
      amountGbp: roundGbp(amount),
    });
  }

  return rows;
}
