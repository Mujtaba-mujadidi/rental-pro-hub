import { isNewInspectionDamage } from "@/lib/fleet/hire-inspection-damage-charges";
import {
  HIRE_INSPECTION_ACCESSORY_KEYS,
  type HireInspectionAccessories,
} from "@/lib/fleet/hire-inspection-accessories";

export type HireEndedInspectionAttentionItem = {
  key: string;
  title: string;
  detail?: string;
  href: string;
  tone: "warn" | "danger";
  count?: number;
};

export type HireEndedInspectionAttentionInput = {
  hireGroupId: string;
  checkinHref: string;
  checkoutOdometerMiles: number | null;
  checkoutAccessories: HireInspectionAccessories;
  checkinOdometerMiles: number | null;
  checkinAccessories: HireInspectionAccessories;
  checkinDamages: readonly { checkoutDamageId: string | null }[];
  checkinCompleted: boolean;
};

function countMissingKitItems(
  checkout: HireInspectionAccessories,
  checkin: HireInspectionAccessories,
): number {
  let count = 0;
  for (const key of HIRE_INSPECTION_ACCESSORY_KEYS) {
    if (checkout[key] === true && checkin[key] === false) count += 1;
  }
  return count;
}

function shouldReviewMileage(
  checkoutOdometerMiles: number | null,
  checkinOdometerMiles: number | null,
): boolean {
  if (checkoutOdometerMiles == null || checkinOdometerMiles == null) return false;
  return checkinOdometerMiles < checkoutOdometerMiles;
}

/** Build inspection follow-up rows for ended-hire summary — real check-in data only. */
export function buildHireEndedInspectionAttentionItems(
  input: HireEndedInspectionAttentionInput,
): HireEndedInspectionAttentionItem[] {
  if (!input.checkinCompleted) return [];

  const items: HireEndedInspectionAttentionItem[] = [];

  if (shouldReviewMileage(input.checkoutOdometerMiles, input.checkinOdometerMiles)) {
    items.push({
      key: "mileage",
      title: "Mileage needs review",
      detail: "Return mileage is lower than checkout",
      href: input.checkinHref,
      tone: "danger",
    });
  }

  const newDamageCount = input.checkinDamages.filter((damage) => isNewInspectionDamage(damage)).length;
  if (newDamageCount > 0) {
    items.push({
      key: "damage",
      title: "New damage items",
      href: input.checkinHref,
      tone: "warn",
      count: newDamageCount,
    });
  }

  const missingKitCount = countMissingKitItems(input.checkoutAccessories, input.checkinAccessories);
  if (missingKitCount > 0) {
    items.push({
      key: "kit",
      title: "Kit items missing",
      href: input.checkinHref,
      tone: "warn",
      count: missingKitCount,
    });
  }

  return items;
}
