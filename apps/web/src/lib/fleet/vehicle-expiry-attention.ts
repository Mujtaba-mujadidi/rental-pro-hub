import {
  defaultNotificationSettings,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";
import { daysFromTodayToExpiry } from "@/lib/datetime/uk";

export type VehicleExpiryKind = "mot" | "tax" | "phv";

export type VehicleExpiryTone = "ok" | "expiring" | "expired";

export type VehicleExpiryItem = {
  kind: VehicleExpiryKind;
  label: string;
  isoDate: string | null;
  daysUntil: number | null;
  tone: VehicleExpiryTone;
  /** Short status for badges, e.g. "Expired", "In 3 days", "Today". */
  shortStatus: string;
  /** Full sentence for alerts. */
  message: string;
};

const LABELS: Record<VehicleExpiryKind, string> = {
  mot: "MOT",
  tax: "Tax",
  phv: "PHV/Taxi",
};

export { daysFromTodayToExpiry };

function shortStatusFor(daysUntil: number): string {
  if (daysUntil < 0) {
    const n = Math.abs(daysUntil);
    return n === 1 ? "Expired yesterday" : `Expired ${n} days ago`;
  }
  if (daysUntil === 0) return "Expires today";
  if (daysUntil === 1) return "In 1 day";
  return `In ${daysUntil} days`;
}

function messageFor(label: string, daysUntil: number): string {
  if (daysUntil < 0) {
    const n = Math.abs(daysUntil);
    return n === 1 ? `${label} expired yesterday` : `${label} expired ${n} days ago`;
  }
  if (daysUntil === 0) return `${label} expires today`;
  if (daysUntil === 1) return `${label} expires in 1 day`;
  return `${label} expires in ${daysUntil} days`;
}

function assessOne(
  kind: VehicleExpiryKind,
  isoDate: string | null | undefined,
  leadDays: number,
): VehicleExpiryItem {
  const label = LABELS[kind];
  const daysUntil = daysFromTodayToExpiry(isoDate);
  if (daysUntil === null) {
    return {
      kind,
      label,
      isoDate: isoDate?.slice(0, 10) ?? null,
      daysUntil: null,
      tone: "ok",
      shortStatus: "—",
      message: `${label} expiry not set`,
    };
  }
  if (daysUntil < 0) {
    return {
      kind,
      label,
      isoDate: isoDate!.slice(0, 10),
      daysUntil,
      tone: "expired",
      shortStatus: shortStatusFor(daysUntil),
      message: messageFor(label, daysUntil),
    };
  }
  if (daysUntil <= leadDays) {
    return {
      kind,
      label,
      isoDate: isoDate!.slice(0, 10),
      daysUntil,
      tone: "expiring",
      shortStatus: shortStatusFor(daysUntil),
      message: messageFor(label, daysUntil),
    };
  }
  return {
    kind,
    label,
    isoDate: isoDate!.slice(0, 10),
    daysUntil,
    tone: "ok",
    shortStatus: shortStatusFor(daysUntil),
    message: `${label} is within date`,
  };
}

type VehicleExpiryFields = {
  mot_expiry?: string | null;
  tax_expiry?: string | null;
  phv_licence_expiry?: string | null;
};

/** All key date assessments (MOT / tax / PHV) using company notification lead days. */
export function assessVehicleExpiries(
  vehicle: VehicleExpiryFields,
  settings: CompanyNotificationSettings = defaultNotificationSettings(),
): VehicleExpiryItem[] {
  return [
    assessOne("mot", vehicle.mot_expiry, settings.notify_mot_days_before),
    assessOne("tax", vehicle.tax_expiry, settings.notify_tax_days_before),
    assessOne("phv", vehicle.phv_licence_expiry, settings.notify_phv_licence_days_before),
  ];
}

/** Only expired or within the lead window. */
export function vehicleExpiryAttentionItems(
  vehicle: VehicleExpiryFields,
  settings: CompanyNotificationSettings = defaultNotificationSettings(),
): VehicleExpiryItem[] {
  return assessVehicleExpiries(vehicle, settings).filter((i) => i.tone !== "ok");
}

export function vehicleHasExpiryAttention(
  vehicle: VehicleExpiryFields,
  settings: CompanyNotificationSettings = defaultNotificationSettings(),
): boolean {
  return vehicleExpiryAttentionItems(vehicle, settings).length > 0;
}

export function worstVehicleExpiryTone(items: VehicleExpiryItem[]): VehicleExpiryTone {
  if (items.some((i) => i.tone === "expired")) return "expired";
  if (items.some((i) => i.tone === "expiring")) return "expiring";
  return "ok";
}

export function vehicleExpiryPillClass(tone: VehicleExpiryTone): string {
  if (tone === "expired") {
    return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100";
  }
  if (tone === "expiring") {
    return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100";
  }
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
}

export function vehicleExpiryTextClass(tone: VehicleExpiryTone): string {
  if (tone === "expired") return "font-semibold text-red-800 dark:text-red-200";
  if (tone === "expiring") return "font-semibold text-amber-800 dark:text-amber-200";
  return "text-rph-fg-secondary";
}
