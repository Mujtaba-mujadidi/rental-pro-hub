import { ukLondonDayYmd, ukTodayYmd, daysFromCalendarDateToExpiry } from "@/lib/datetime/uk";
import { driverLicenceReviewReasons, type LicenceReviewReason } from "@/lib/driver/licence-attention";
import {
  deriveHireInsuranceDocumentStatus,
  isHireInsuranceProvidedBy,
} from "@/lib/fleet/hire-insurance";
import { pickContractAttentionEndDate } from "@/lib/rental/subcompany-attention-display";
import { ACTIVE_HIRE_GROUP_STATUSES } from "@/lib/fleet/hire-types";
import {
  parseCompanyNotificationSettings,
  type CompanyNotificationSettings,
} from "@/lib/settings/notification-settings";
import {
  vehicleExpiryAttentionItems,
  type VehicleExpiryItem,
  type VehicleExpiryKind,
} from "@/lib/fleet/vehicle-expiry-attention";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PendingPlatformNotification, PlatformNotificationType } from "@/lib/platform-notifications";
import { insertPendingPlatformNotifications } from "@/lib/platform-notifications";

type CompanyRow = {
  id: string;
  notify_mot_days_before?: number | null;
  notify_tax_days_before?: number | null;
  notify_phv_licence_days_before?: number | null;
  notify_contract_expiry_days_before?: number | null;
  notify_insurance_days_before?: number | null;
};

type VehicleRow = {
  id: string;
  parent_company_id: string;
  vrm: string;
  mot_expiry?: string | null;
  tax_expiry?: string | null;
  phv_licence_expiry?: string | null;
};

type DriverProfileRow = {
  user_id: string;
  driving_licence_expiry?: string | null;
  phv_licence_expiry?: string | null;
  licence_revalidation_due_at?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  account_email?: string | null;
};

/** Hire statuses where company staff should receive driver licence expiry alerts. */
export const DRIVER_LICENCE_STAFF_NOTIFY_HIRE_STATUSES: readonly string[] = [
  ...ACTIVE_HIRE_GROUP_STATUSES,
  "terminated",
];

type OpenHireDriverCompany = {
  parent_company_id: string;
  driver_user_id: string;
};

export function collectOpenHireDriverCompanyPairs(
  hires: readonly { parent_company_id: string; driver_user_id?: string | null; status: string }[],
): OpenHireDriverCompany[] {
  const seen = new Set<string>();
  const pairs: OpenHireDriverCompany[] = [];
  for (const hire of hires) {
    if (!DRIVER_LICENCE_STAFF_NOTIFY_HIRE_STATUSES.includes(hire.status)) continue;
    const driverUserId = hire.driver_user_id?.trim();
    if (!driverUserId) continue;
    const key = `${hire.parent_company_id}:${driverUserId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ parent_company_id: hire.parent_company_id, driver_user_id: driverUserId });
  }
  return pairs;
}

type HireRow = {
  id: string;
  parent_company_id: string;
  status: string;
  driver_user_id?: string | null;
  insurance_provided_by?: string | null;
  vehicles?: { vrm?: string | null } | null;
  vehicle_hire_agreements?: Array<{ end_date?: string | null; status?: string | null }> | null;
  vehicle_hire_insurance?: Array<{ expiry_date?: string | null; file_path?: string | null }> | null;
};

export function complianceNotificationDedupeKey(parts: readonly string[]): string {
  return parts.join(":");
}

function vehicleExpiryNotificationType(kind: VehicleExpiryKind): PlatformNotificationType {
  if (kind === "mot") return "vehicle_expiry_mot";
  if (kind === "tax") return "vehicle_expiry_tax";
  return "vehicle_expiry_phv";
}

function driverLabelFromProfile(profile: DriverProfileRow): string {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  if (name) return name;
  return profile.account_email?.trim() || "Driver";
}

function licenceReasonKind(reason: LicenceReviewReason): "driving" | "phv" | null {
  if (reason.code === "driving_expired" || reason.code === "driving_expiring") return "driving";
  if (reason.code === "phv_expired" || reason.code === "phv_expiring") return "phv";
  return null;
}

function buildVehicleExpiryNotification(
  item: VehicleExpiryItem,
  vehicle: VehicleRow,
  staffUserId: string,
  todayYmd: string,
): PendingPlatformNotification {
  const type = vehicleExpiryNotificationType(item.kind);
  const vrm = vehicle.vrm.trim() || "Vehicle";
  return {
    userId: staffUserId,
    type,
    payload: {
      dedupeKey: complianceNotificationDedupeKey([
        "vehicle",
        vehicle.id,
        item.kind,
        staffUserId,
        todayYmd,
      ]),
      vehicleId: vehicle.id,
      vehicleVrm: vrm,
      expiryKind: item.kind,
      expiryDate: item.isoDate,
      daysUntil: item.daysUntil,
      tone: item.tone,
      href: `/rental/vehicles/${vehicle.id}`,
      summary: item.message,
    },
  };
}

export function buildVehicleExpiryNotifications(input: {
  vehicles: readonly VehicleRow[];
  staffByCompany: ReadonlyMap<string, readonly string[]>;
  settingsByCompany: ReadonlyMap<string, CompanyNotificationSettings>;
  todayYmd: string;
}): PendingPlatformNotification[] {
  const rows: PendingPlatformNotification[] = [];
  for (const vehicle of input.vehicles) {
    const staffIds = input.staffByCompany.get(vehicle.parent_company_id) ?? [];
    if (!staffIds.length) continue;
    const settings =
      input.settingsByCompany.get(vehicle.parent_company_id) ??
      parseCompanyNotificationSettings(undefined);
    const items = vehicleExpiryAttentionItems(vehicle, settings);
    for (const item of items) {
      for (const staffUserId of staffIds) {
        rows.push(buildVehicleExpiryNotification(item, vehicle, staffUserId, input.todayYmd));
      }
    }
  }
  return rows;
}

export function buildDriverLicenceExpiryNotifications(input: {
  profiles: readonly DriverProfileRow[];
  openHireDriverCompanies: readonly OpenHireDriverCompany[];
  staffByCompany: ReadonlyMap<string, readonly string[]>;
  todayYmd: string;
}): PendingPlatformNotification[] {
  const profileByUserId = new Map(input.profiles.map((profile) => [profile.user_id, profile]));
  const rows: PendingPlatformNotification[] = [];

  for (const profile of input.profiles) {
    const reasons = driverLicenceReviewReasons(profile).filter((reason) => licenceReasonKind(reason));
    for (const reason of reasons) {
      const kind = licenceReasonKind(reason);
      if (!kind) continue;
      rows.push({
        userId: profile.user_id,
        type: "driver_licence_expiry",
        payload: {
          dedupeKey: complianceNotificationDedupeKey([
            "driver-self",
            profile.user_id,
            kind,
            input.todayYmd,
          ]),
          audience: "driver",
          licenceKind: kind,
          daysUntil: reason.daysUntilExpiry ?? null,
          tone: reason.code.endsWith("_expired") ? "expired" : "expiring",
          href: "/driver/profile?tab=licences",
        },
      });
    }
  }

  for (const pair of input.openHireDriverCompanies) {
    const profile = profileByUserId.get(pair.driver_user_id);
    if (!profile) continue;
    const staffIds = input.staffByCompany.get(pair.parent_company_id) ?? [];
    if (!staffIds.length) continue;
    const label = driverLabelFromProfile(profile);
    const reasons = driverLicenceReviewReasons(profile).filter((reason) => licenceReasonKind(reason));
    for (const reason of reasons) {
      const kind = licenceReasonKind(reason);
      if (!kind) continue;
      for (const staffUserId of staffIds) {
        rows.push({
          userId: staffUserId,
          type: "driver_licence_expiry",
          payload: {
            dedupeKey: complianceNotificationDedupeKey([
              "driver-company",
              pair.parent_company_id,
              profile.user_id,
              kind,
              staffUserId,
              input.todayYmd,
            ]),
            audience: "staff",
            driverUserId: profile.user_id,
            driverLabel: label,
            licenceKind: kind,
            daysUntil: reason.daysUntilExpiry ?? null,
            tone: reason.code.endsWith("_expired") ? "expired" : "expiring",
            href: `/rental/drivers/${profile.user_id}`,
          },
        });
      }
    }
  }

  return rows;
}

function buildHireInsuranceNotificationsForHire(input: {
  hire: HireRow;
  settings: CompanyNotificationSettings;
  staffUserIds: readonly string[];
  todayYmd: string;
}): PendingPlatformNotification[] {
  const providedByRaw = input.hire.insurance_provided_by ?? null;
  const providedBy =
    providedByRaw && isHireInsuranceProvidedBy(providedByRaw) ? providedByRaw : null;
  if (!providedBy) return [];

  const activeStatuses = new Set(["pending_signature", "reserved", "active", "terminated"]);
  if (!activeStatuses.has(input.hire.status)) return [];

  const insuranceRow = input.hire.vehicle_hire_insurance?.[0] ?? null;
  const status = deriveHireInsuranceDocumentStatus({
    providedBy,
    hasDocument: Boolean(insuranceRow?.file_path),
    expiryDate: insuranceRow?.expiry_date?.slice(0, 10) ?? null,
    notifyDaysBefore: input.settings.notify_insurance_days_before,
    todayYmd: input.todayYmd,
  });
  if (status !== "expiring" && status !== "expired") return [];

  const vrm = input.hire.vehicles?.vrm?.trim() || "Vehicle";
  const daysUntil =
    insuranceRow?.expiry_date != null
      ? daysFromCalendarDateToExpiry(insuranceRow.expiry_date.slice(0, 10), input.todayYmd)
      : null;
  const tone = status === "expired" ? "expired" : "expiring";
  const rows: PendingPlatformNotification[] = [];

  for (const staffUserId of input.staffUserIds) {
    rows.push({
      userId: staffUserId,
      type: "hire_insurance_expiry",
      payload: {
        dedupeKey: complianceNotificationDedupeKey([
          "hire-insurance-staff",
          input.hire.id,
          staffUserId,
          input.todayYmd,
        ]),
        audience: "staff",
        hireGroupId: input.hire.id,
        vehicleVrm: vrm,
        expiryDate: insuranceRow?.expiry_date?.slice(0, 10) ?? null,
        daysUntil,
        tone,
        href: `/rental/hires/${input.hire.id}/details`,
      },
    });
  }

  const driverUserId = input.hire.driver_user_id?.trim();
  if (driverUserId) {
    rows.push({
      userId: driverUserId,
      type: "hire_insurance_expiry",
      payload: {
        dedupeKey: complianceNotificationDedupeKey([
          "hire-insurance-driver",
          input.hire.id,
          driverUserId,
          input.todayYmd,
        ]),
        audience: "driver",
        hireGroupId: input.hire.id,
        vehicleVrm: vrm,
        expiryDate: insuranceRow?.expiry_date?.slice(0, 10) ?? null,
        daysUntil,
        tone,
        href: `/driver/hires/${input.hire.id}/details`,
      },
    });
  }

  return rows;
}

function buildHireContractExpiryNotificationsForHire(input: {
  hire: HireRow;
  settings: CompanyNotificationSettings;
  staffUserIds: readonly string[];
  todayYmd: string;
}): PendingPlatformNotification[] {
  if (input.hire.status !== "active") return [];
  const endDate = pickContractAttentionEndDate(input.hire.vehicle_hire_agreements ?? [], input.todayYmd);
  if (!endDate) return [];

  const daysUntil = daysFromCalendarDateToExpiry(endDate, input.todayYmd);
  if (daysUntil === null || daysUntil > input.settings.notify_contract_expiry_days_before) return [];

  const vrm = input.hire.vehicles?.vrm?.trim() || "Vehicle";
  const tone = daysUntil < 0 ? "expired" : "expiring";
  const rows: PendingPlatformNotification[] = [];

  for (const staffUserId of input.staffUserIds) {
    rows.push({
      userId: staffUserId,
      type: "hire_contract_expiry",
      payload: {
        dedupeKey: complianceNotificationDedupeKey([
          "hire-contract-staff",
          input.hire.id,
          staffUserId,
          input.todayYmd,
        ]),
        audience: "staff",
        hireGroupId: input.hire.id,
        vehicleVrm: vrm,
        contractEndDate: endDate,
        daysUntil,
        tone,
        href: `/rental/hires/${input.hire.id}`,
      },
    });
  }

  const driverUserId = input.hire.driver_user_id?.trim();
  if (driverUserId) {
    rows.push({
      userId: driverUserId,
      type: "hire_contract_expiry",
      payload: {
        dedupeKey: complianceNotificationDedupeKey([
          "hire-contract-driver",
          input.hire.id,
          driverUserId,
          input.todayYmd,
        ]),
        audience: "driver",
        hireGroupId: input.hire.id,
        vehicleVrm: vrm,
        contractEndDate: endDate,
        daysUntil,
        tone,
        href: `/driver/hires/${input.hire.id}`,
      },
    });
  }

  return rows;
}

export function buildHireComplianceNotifications(input: {
  hires: readonly HireRow[];
  staffByCompany: ReadonlyMap<string, readonly string[]>;
  settingsByCompany: ReadonlyMap<string, CompanyNotificationSettings>;
  todayYmd: string;
}): PendingPlatformNotification[] {
  const rows: PendingPlatformNotification[] = [];
  for (const hire of input.hires) {
    const staffUserIds = input.staffByCompany.get(hire.parent_company_id) ?? [];
    const settings =
      input.settingsByCompany.get(hire.parent_company_id) ??
      parseCompanyNotificationSettings(undefined);
    rows.push(
      ...buildHireInsuranceNotificationsForHire({
        hire,
        settings,
        staffUserIds,
        todayYmd: input.todayYmd,
      }),
    );
    rows.push(
      ...buildHireContractExpiryNotificationsForHire({
        hire,
        settings,
        staffUserIds,
        todayYmd: input.todayYmd,
      }),
    );
  }
  return rows;
}

export function filterPendingComplianceNotifications(
  pending: readonly PendingPlatformNotification[],
  alreadySentKeys: ReadonlySet<string>,
): PendingPlatformNotification[] {
  return pending.filter((row) => {
    const key = `${row.userId}:${row.type}:${row.payload.dedupeKey}`;
    return !alreadySentKeys.has(key);
  });
}

export function buildComplianceStaffByCompany(
  memberships: readonly { parent_company_id: string; user_id: string; role: string }[],
): Map<string, string[]> {
  const allowed = new Set(["owner", "admin", "operations"]);
  const map = new Map<string, string[]>();
  for (const membership of memberships) {
    if (!allowed.has(membership.role)) continue;
    const list = map.get(membership.parent_company_id) ?? [];
    if (!list.includes(membership.user_id)) list.push(membership.user_id);
    map.set(membership.parent_company_id, list);
  }
  return map;
}

export function buildCompanySettingsMap(
  companies: readonly CompanyRow[],
): Map<string, CompanyNotificationSettings> {
  return new Map(
    companies.map((company) => [company.id, parseCompanyNotificationSettings(company)]),
  );
}

export function complianceSentNotificationKey(
  userId: string,
  type: string,
  dedupeKey: string,
): string {
  return `${userId}:${type}:${dedupeKey}`;
}

export function extractAlreadySentComplianceKeys(
  rows: readonly {
    user_id: string;
    type: string;
    payload: unknown;
    created_at?: string | null;
  }[],
  todayYmd: string,
): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (ukLondonDayYmd(row.created_at ?? "") !== todayYmd) continue;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const dedupeKey = typeof payload.dedupeKey === "string" ? payload.dedupeKey : "";
    if (!dedupeKey) continue;
    keys.add(complianceSentNotificationKey(row.user_id, row.type, dedupeKey));
  }
  return keys;
}

const COMPLIANCE_NOTIFICATION_TYPES: PlatformNotificationType[] = [
  "vehicle_expiry_mot",
  "vehicle_expiry_tax",
  "vehicle_expiry_phv",
  "driver_licence_expiry",
  "hire_insurance_expiry",
  "hire_contract_expiry",
];

export async function runComplianceExpiryNotifications(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  todayYmd: string = ukTodayYmd(),
): Promise<{ sent: number; skipped: number; scannedCompanies: number }> {
  const { data: companies, error: companiesError } = await admin
    .from("companies")
    .select(
      "id, notify_mot_days_before, notify_tax_days_before, notify_phv_licence_days_before, notify_contract_expiry_days_before, notify_insurance_days_before, deletion_phase",
    )
    .neq("deletion_phase", "access_blocked");

  if (companiesError) {
    console.error("runComplianceExpiryNotifications companies", companiesError.message);
    return { sent: 0, skipped: 0, scannedCompanies: 0 };
  }

  const activeCompanies = (companies ?? []) as CompanyRow[];
  const companyIds = activeCompanies.map((company) => company.id);
  if (!companyIds.length) return { sent: 0, skipped: 0, scannedCompanies: 0 };

  const settingsByCompany = buildCompanySettingsMap(activeCompanies);

  const [
    { data: vehicles, error: vehiclesError },
    { data: memberships, error: membershipsError },
    { data: links, error: linksError },
    { data: hires, error: hiresError },
    { data: recentNotifications, error: recentError },
  ] = await Promise.all([
    admin
      .from("vehicles")
      .select("id, parent_company_id, vrm, mot_expiry, tax_expiry, phv_licence_expiry")
      .in("parent_company_id", companyIds),
    admin
      .from("user_company_memberships")
      .select("parent_company_id, user_id, role")
      .eq("status", "active")
      .in("parent_company_id", companyIds),
    admin
      .from("company_driver_links")
      .select("parent_company_id, driver_user_id")
      .eq("status", "active")
      .in("parent_company_id", companyIds),
    admin
      .from("vehicle_hire_groups")
      .select(
        "id, parent_company_id, status, driver_user_id, insurance_provided_by, vehicles(vrm), vehicle_hire_agreements(end_date, status), vehicle_hire_insurance(expiry_date, file_path)",
      )
      .in("parent_company_id", companyIds)
      .in("status", [...DRIVER_LICENCE_STAFF_NOTIFY_HIRE_STATUSES]),
    admin
      .from("platform_notifications")
      .select("user_id, type, payload, created_at")
      .in("type", COMPLIANCE_NOTIFICATION_TYPES)
      .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()),
  ]);

  if (vehiclesError) console.error("runComplianceExpiryNotifications vehicles", vehiclesError.message);
  if (membershipsError) {
    console.error("runComplianceExpiryNotifications memberships", membershipsError.message);
  }
  if (linksError) console.error("runComplianceExpiryNotifications links", linksError.message);
  if (hiresError) console.error("runComplianceExpiryNotifications hires", hiresError.message);
  if (recentError) {
    console.error("runComplianceExpiryNotifications recent", recentError.message);
  }

  const staffByCompany = buildComplianceStaffByCompany(memberships ?? []);
  const hireRows = (hires ?? []) as HireRow[];
  const openHireDriverCompanies = collectOpenHireDriverCompanyPairs(hireRows);
  const driverUserIds = [
    ...new Set([
      ...(links ?? []).map((link) => link.driver_user_id as string),
      ...openHireDriverCompanies.map((pair) => pair.driver_user_id),
    ]),
  ];

  let profiles: DriverProfileRow[] = [];
  if (driverUserIds.length) {
    const { data: profileRows, error: profilesError } = await admin
      .from("driver_profiles")
      .select(
        "user_id, driving_licence_expiry, phv_licence_expiry, licence_revalidation_due_at, first_name, last_name, account_email",
      )
      .in("user_id", driverUserIds);
    if (profilesError) {
      console.error("runComplianceExpiryNotifications profiles", profilesError.message);
    } else {
      profiles = (profileRows ?? []) as DriverProfileRow[];
    }
  }

  const pending = [
    ...buildVehicleExpiryNotifications({
      vehicles: (vehicles ?? []) as VehicleRow[],
      staffByCompany,
      settingsByCompany,
      todayYmd,
    }),
    ...buildDriverLicenceExpiryNotifications({
      profiles,
      openHireDriverCompanies,
      staffByCompany,
      todayYmd,
    }),
    ...buildHireComplianceNotifications({
      hires: hireRows,
      staffByCompany,
      settingsByCompany,
      todayYmd,
    }),
  ];

  const alreadySentKeys = extractAlreadySentComplianceKeys(recentNotifications ?? [], todayYmd);
  const toSend = filterPendingComplianceNotifications(pending, alreadySentKeys);
  const sent = await insertPendingPlatformNotifications(admin, toSend);

  return {
    sent,
    skipped: pending.length - toSend.length,
    scannedCompanies: companyIds.length,
  };
}
