import { LICENCE_EXPIRING_SOON_MAX_DAYS } from "@/lib/driver/licence-attention";
import { daysFromTodayToExpiry } from "@/lib/datetime/uk";
import type { HireLifecycleAttentionItem } from "@/lib/fleet/hire-lifecycle-attention";
import {
  vehicleExpiryAttentionItems,
} from "@/lib/fleet/vehicle-expiry-attention";
import {
  defaultNotificationSettings,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";

type VehicleExpiryFields = {
  mot_expiry?: string | null;
  tax_expiry?: string | null;
  phv_licence_expiry?: string | null;
};

type DriverLicenceExpiryFields = {
  driving_licence_expiry?: string | null;
  phv_licence_expiry?: string | null;
};

function driverLicenceAttentionLabel(
  iso: string | null | undefined,
  label: string,
): string | null {
  const days = daysFromTodayToExpiry(iso);
  if (days === null) return null;
  if (days < 0 || days <= LICENCE_EXPIRING_SOON_MAX_DAYS) return label;
  return null;
}

/** Documents expiring or expired during an active hire (vehicle compliance + driver licences). */
export function collectHireDocumentExpiryLabels(input: {
  vehicle: VehicleExpiryFields;
  driver?: DriverLicenceExpiryFields | null;
  settings?: CompanyNotificationSettings;
}): string[] {
  const settings = input.settings ?? defaultNotificationSettings();
  const labels: string[] = [];

  for (const item of vehicleExpiryAttentionItems(input.vehicle, settings)) {
    labels.push(item.label === "PHV/Taxi" ? "PHV" : item.label);
  }

  const driving = driverLicenceAttentionLabel(
    input.driver?.driving_licence_expiry,
    "driver licences",
  );
  if (driving) labels.push(driving);

  const driverPhv = driverLicenceAttentionLabel(input.driver?.phv_licence_expiry, "driver PHV");
  if (driverPhv && !labels.includes("driver licences")) labels.push(driverPhv);

  return labels;
}

export function buildHireDocumentExpiryAttentionItem(input: {
  hireGroupId: string;
  vehicle: VehicleExpiryFields;
  driver?: DriverLicenceExpiryFields | null;
  settings?: CompanyNotificationSettings;
  detailsHref?: string;
}): HireLifecycleAttentionItem | null {
  const labels = collectHireDocumentExpiryLabels(input);
  if (!labels.length) return null;

  const count = labels.length;
  const names = formatDocumentNameList(labels);

  return {
    kind: "documents_expiring_during_hire",
    title: "Documents expire during hire",
    detail: `${count} document${count === 1 ? "" : "s"}: ${names}`,
    href: input.detailsHref ?? `/rental/hires/${input.hireGroupId}/details`,
  };
}

function formatDocumentNameList(labels: string[]): string {
  const normalized = labels.map((label) => (label === "MOT" ? "MOT" : label.toLowerCase()));
  if (normalized.length === 1) return normalized[0]!;
  if (normalized.length === 2) return `${normalized[0]} and ${normalized[1]}`;
  return `${normalized.slice(0, -1).join(", ")} and ${normalized.at(-1)}`;
}
