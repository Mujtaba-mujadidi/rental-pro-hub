import type { HireInspectionPayload } from "@/app/actions/hire-inspections";
import {
  HIRE_INSPECTION_ACCESSORY_KEYS,
  type HireInspectionAccessories,
} from "@/lib/fleet/hire-inspection-accessories";
import { isNewInspectionDamage } from "@/lib/fleet/hire-inspection-damage-charges";
import type { HireInspectionDiffResult } from "@/lib/fleet/hire-inspection-lifecycle";
import { formatInspectionOdometerDisplay } from "@/lib/fleet/hire-inspection-checkin-summary";
import { formatHireFuelLevelPercent } from "@/lib/fleet/hire-fuel-level";
import { shouldReviewEndedHireMileage } from "@/lib/fleet/hire-ended-inspection-attention";

export type HireInspectionComparisonResultTone = "success" | "warn" | "danger" | "neutral";

export type HireInspectionComparisonTableRow = {
  id: string;
  label: string;
  checkoutDisplay: string;
  checkinDisplay: string;
  resultLabel: string;
  resultTone: HireInspectionComparisonResultTone;
};

function countKitItemsPresent(accessories: HireInspectionAccessories): number {
  return HIRE_INSPECTION_ACCESSORY_KEYS.filter((key) => accessories[key] === true).length;
}

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

function formatKitPresenceLabel(accessories: HireInspectionAccessories): string {
  const present = countKitItemsPresent(accessories);
  if (present === 0) return "None present";
  return present === 1 ? "1 item present" : `${present} items present`;
}

function formatCheckoutDamageLabel(count: number): string {
  if (count === 0) return "None recorded";
  return count === 1 ? "1 existing" : `${count} existing`;
}

function formatCheckinDamageLabel(diff: HireInspectionDiffResult): string {
  const preExisting = diff.preExistingDamages.length;
  const newCount = diff.newDamages.length;
  if (preExisting === 0 && newCount === 0) return "None recorded";
  if (preExisting > 0 && newCount > 0) {
    return `${preExisting} existing + ${newCount} new`;
  }
  if (newCount > 0) return newCount === 1 ? "1 new" : `${newCount} new`;
  return preExisting === 1 ? "1 existing" : `${preExisting} existing`;
}

function formatDamageResultLabel(newCount: number): { label: string; tone: HireInspectionComparisonResultTone } {
  if (newCount === 0) return { label: "No change", tone: "success" };
  return {
    label: newCount === 1 ? "1 new item" : `${newCount} new items`,
    tone: "warn",
  };
}

function formatMileageResultLabel(input: {
  checkoutOdometer: number | null;
  checkinOdometer: number | null;
  changed: boolean;
}): { label: string; tone: HireInspectionComparisonResultTone } {
  if (shouldReviewEndedHireMileage(input.checkoutOdometer, input.checkinOdometer)) {
    return { label: "Invalid reading", tone: "danger" };
  }
  if (!input.changed) return { label: "No change", tone: "success" };
  return { label: "Changed", tone: "neutral" };
}

function formatKitResultLabel(missingCount: number): { label: string; tone: HireInspectionComparisonResultTone } {
  if (missingCount === 0) return { label: "No change", tone: "success" };
  return {
    label: missingCount === 1 ? "1 missing" : `${missingCount} missing`,
    tone: "warn",
  };
}

export function buildHireInspectionComparisonTable(input: {
  checkout: HireInspectionPayload;
  checkin: HireInspectionPayload;
  damageDiff: HireInspectionDiffResult;
}): HireInspectionComparisonTableRow[] {
  const checkoutOdometer = input.checkout.odometerReading;
  const checkinOdometer = input.checkin.odometerReading;
  const checkoutFuelDisplay =
    input.checkout.fuelLevel != null
      ? formatHireFuelLevelPercent(input.checkout.fuelLevel)
      : "Not recorded";
  const checkinFuelDisplay =
    input.checkin.fuelLevel != null
      ? formatHireFuelLevelPercent(input.checkin.fuelLevel)
      : "Not recorded";
  const checkoutOdometerDisplay = formatInspectionOdometerDisplay(checkoutOdometer);
  const checkinOdometerDisplay = formatInspectionOdometerDisplay(checkinOdometer);
  const mileageChanged = checkoutOdometerDisplay !== checkinOdometerDisplay;
  const mileageResult = formatMileageResultLabel({
    checkoutOdometer,
    checkinOdometer,
    changed: mileageChanged,
  });
  const fuelChanged = checkoutFuelDisplay !== checkinFuelDisplay;
  const newDamageCount = input.damageDiff.newDamages.length;
  const damageResult = formatDamageResultLabel(newDamageCount);
  const missingKitCount = countMissingKitItems(input.checkout.accessories, input.checkin.accessories);
  const kitResult = formatKitResultLabel(missingKitCount);

  return [
    {
      id: "mileage",
      label: "Mileage",
      checkoutDisplay: checkoutOdometerDisplay,
      checkinDisplay: checkinOdometerDisplay,
      resultLabel: mileageResult.label,
      resultTone: mileageResult.tone,
    },
    {
      id: "fuel",
      label: "Fuel level",
      checkoutDisplay: checkoutFuelDisplay,
      checkinDisplay: checkinFuelDisplay,
      resultLabel: fuelChanged ? "Changed" : "No change",
      resultTone: fuelChanged ? "neutral" : "success",
    },
    {
      id: "damage",
      label: "Damage",
      checkoutDisplay: formatCheckoutDamageLabel(input.checkout.damages.length),
      checkinDisplay: formatCheckinDamageLabel(input.damageDiff),
      resultLabel: damageResult.label,
      resultTone: damageResult.tone,
    },
    {
      id: "kit",
      label: "Vehicle kit",
      checkoutDisplay: formatKitPresenceLabel(input.checkout.accessories),
      checkinDisplay: formatKitPresenceLabel(input.checkin.accessories),
      resultLabel: kitResult.label,
      resultTone: kitResult.tone,
    },
  ];
}

export function hireInspectionCheckinNeedsReview(input: {
  checkout: HireInspectionPayload;
  checkin: HireInspectionPayload;
}): boolean {
  if (shouldReviewEndedHireMileage(input.checkout.odometerReading, input.checkin.odometerReading)) {
    return true;
  }
  if (input.checkin.damages.some((damage) => isNewInspectionDamage(damage))) return true;
  if (countMissingKitItems(input.checkout.accessories, input.checkin.accessories) > 0) return true;
  return false;
}
