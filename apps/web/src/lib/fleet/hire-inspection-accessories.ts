export const HIRE_INSPECTION_ACCESSORY_KEYS = [
  "hasSpareTyre",
  "hasTyreKeyLocks",
  "hasTyreInflationKit",
  "hasChargingCable",
  "hasTyreReplacementKit",
] as const;

export type HireInspectionAccessoryKey = (typeof HIRE_INSPECTION_ACCESSORY_KEYS)[number];

export type HireInspectionAccessories = Record<HireInspectionAccessoryKey, boolean | null>;

export const EMPTY_HIRE_INSPECTION_ACCESSORIES: HireInspectionAccessories = {
  hasSpareTyre: null,
  hasTyreKeyLocks: null,
  hasTyreInflationKit: null,
  hasChargingCable: null,
  hasTyreReplacementKit: null,
};

export function hireInspectionAccessoryLabel(key: HireInspectionAccessoryKey): string {
  const labels: Record<HireInspectionAccessoryKey, string> = {
    hasSpareTyre: "Spare tyre",
    hasTyreKeyLocks: "Tyre key / locks",
    hasTyreInflationKit: "Tyre inflation kit",
    hasChargingCable: "Charging cable",
    hasTyreReplacementKit: "Tyre replacement kit",
  };
  return labels[key];
}

export function formatAccessoryPresence(value: boolean | null): string {
  if (value === true) return "Present";
  if (value === false) return "Not present";
  return "Not recorded";
}
