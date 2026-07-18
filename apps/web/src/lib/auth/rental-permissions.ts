import type { AppProfile, CompanyMembershipRole } from "@/lib/auth/profile";

/**
 * Fixed rental capabilities. Backed by membership roles — not per-company custom RBAC.
 * @see .cursor/rules/fixed-rental-roles.mdc
 */
export type RentalCapability =
  | "staff.manage"
  | "settings.manage"
  | "onboarding.manage"
  | "contract.change"
  | "fleet.write"
  | "fleet.delete"
  | "fleet_tracking.manage"
  | "subcompany.write"
  | "billing.pay"
  | "maintenance.read"
  | "maintenance.write";

const ROLE_CAPS: Record<CompanyMembershipRole, ReadonlySet<RentalCapability>> = {
  owner: new Set([
    "staff.manage",
    "settings.manage",
    "onboarding.manage",
    "contract.change",
    "fleet.write",
    "fleet.delete",
    "fleet_tracking.manage",
    "subcompany.write",
    "billing.pay",
    "maintenance.read",
    "maintenance.write",
  ]),
  admin: new Set([
    "staff.manage",
    "settings.manage",
    "onboarding.manage",
    "contract.change",
    "fleet.write",
    "fleet.delete",
    "fleet_tracking.manage",
    "subcompany.write",
    "billing.pay",
    "maintenance.read",
    "maintenance.write",
  ]),
  operations: new Set([
    "fleet.write",
    "fleet_tracking.manage",
    "subcompany.write",
    "maintenance.read",
    "maintenance.write",
  ]),
  finance: new Set(["billing.pay", "maintenance.read"]),
  viewer: new Set(["maintenance.read"]),
};

function effectiveMembershipRole(profile: Pick<AppProfile, "membership_role" | "company_role">): CompanyMembershipRole | null {
  if (profile.membership_role) return profile.membership_role;
  // Legacy profiles that only have company_role
  if (profile.company_role === "admin") return "admin";
  return null;
}

/** Whether the rental user may perform a fixed capability. */
export function can(
  profile: Pick<AppProfile, "membership_role" | "company_role">,
  capability: RentalCapability,
): boolean {
  const role = effectiveMembershipRole(profile);
  if (!role) return false;
  return ROLE_CAPS[role].has(capability);
}

export function canManageStaff(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "staff.manage");
}

export function canManageSettings(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "settings.manage");
}

export function canManageOnboarding(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "onboarding.manage");
}

export function canRequestContractChange(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "contract.change");
}

export function canManageFleet(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "fleet.write");
}

export function canDeleteFleet(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "fleet.delete");
}

export function canManageFleetTracking(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "fleet_tracking.manage");
}

export function canWriteSubcompany(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "subcompany.write");
}

export function canSubmitBillingPayment(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "billing.pay");
}

export function canReadMaintenance(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "maintenance.read");
}

export function canWriteMaintenance(profile: Pick<AppProfile, "membership_role" | "company_role">) {
  return can(profile, "maintenance.write");
}

/** Remaining planned modules (not yet wired as capabilities). */
export const PLANNED_MODULE_ROLE_MAP = {
  claims: "operations + owner/admin write; viewer read" as const,
  customerPayments: "finance + owner/admin record/approve" as const,
} as const;
