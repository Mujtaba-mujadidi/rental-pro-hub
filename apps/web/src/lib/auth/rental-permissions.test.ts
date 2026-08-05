import { describe, expect, it } from "vitest";
import {
  can,
  canDeleteFleet,
  canManageFleet,
  canManageFleetTracking,
  canManageOnboarding,
  canManageSettings,
  canManageStaff,
  canRequestContractChange,
  canWriteMaintenance,
  canWriteSubcompany,
  canSubmitBillingPayment,
  canReadMaintenance,
  canReadDriverIdentity,
  canReadRentals,
} from "@/lib/auth/rental-permissions";
import type { AppProfile } from "@/lib/auth/profile";

function profile(
  membership_role: AppProfile["membership_role"],
  company_role: AppProfile["company_role"] = null,
): Pick<AppProfile, "membership_role" | "company_role"> {
  return { membership_role, company_role };
}

describe("can()", () => {
  it("denies when no role can be resolved", () => {
    expect(can(profile(null, null), "fleet.write")).toBe(false);
  });

  it("maps legacy company_role admin to admin caps", () => {
    expect(can(profile(null, "admin"), "contract.change")).toBe(true);
    expect(can(profile(null, "admin"), "fleet.write")).toBe(true);
  });

  it("owner and admin have staff, settings, contract, fleet delete, billing", () => {
    for (const role of ["owner", "admin"] as const) {
      const p = profile(role);
      expect(can(p, "staff.manage")).toBe(true);
      expect(can(p, "settings.manage")).toBe(true);
      expect(can(p, "onboarding.manage")).toBe(true);
      expect(can(p, "contract.change")).toBe(true);
      expect(can(p, "fleet.write")).toBe(true);
      expect(can(p, "fleet.delete")).toBe(true);
      expect(can(p, "billing.pay")).toBe(true);
      expect(can(p, "maintenance.write")).toBe(true);
    }
  });

  it("operations can write fleet/maintenance but not staff or billing", () => {
    const p = profile("operations");
    expect(can(p, "fleet.write")).toBe(true);
    expect(can(p, "maintenance.write")).toBe(true);
    expect(can(p, "staff.manage")).toBe(false);
    expect(can(p, "billing.pay")).toBe(false);
    expect(can(p, "fleet.delete")).toBe(false);
  });

  it("finance can pay billing and read maintenance only", () => {
    const p = profile("finance");
    expect(can(p, "billing.pay")).toBe(true);
    expect(can(p, "maintenance.read")).toBe(true);
    expect(can(p, "maintenance.write")).toBe(false);
    expect(can(p, "fleet.write")).toBe(false);
    expect(can(p, "driver.identity.read")).toBe(false);
  });

  it("viewer can only read maintenance and rentals", () => {
    const p = profile("viewer");
    expect(can(p, "maintenance.read")).toBe(true);
    expect(can(p, "rentals.read")).toBe(true);
    expect(can(p, "maintenance.write")).toBe(false);
    expect(can(p, "fleet.write")).toBe(false);
    expect(can(p, "billing.pay")).toBe(false);
    expect(can(p, "driver.identity.read")).toBe(false);
  });

  it("operations can read driver identity; finance and viewer cannot", () => {
    expect(can(profile("operations"), "driver.identity.read")).toBe(true);
    expect(can(profile("owner"), "driver.identity.read")).toBe(true);
    expect(can(profile("finance"), "driver.identity.read")).toBe(false);
  });
});

describe("named wrappers", () => {
  it("mirror can() for every gate", () => {
    const owner = profile("owner");
    const viewer = profile("viewer");
    const ops = profile("operations");
    const finance = profile("finance");
    expect(canManageStaff(owner)).toBe(true);
    expect(canManageStaff(viewer)).toBe(false);
    expect(canManageSettings(owner)).toBe(true);
    expect(canManageOnboarding(owner)).toBe(true);
    expect(canRequestContractChange(owner)).toBe(true);
    expect(canManageFleet(ops)).toBe(true);
    expect(canDeleteFleet(owner)).toBe(true);
    expect(canDeleteFleet(ops)).toBe(false);
    expect(canManageFleetTracking(ops)).toBe(true);
    expect(canWriteSubcompany(ops)).toBe(true);
    expect(canWriteMaintenance(ops)).toBe(true);
    expect(canSubmitBillingPayment(finance)).toBe(true);
    expect(canReadMaintenance(viewer)).toBe(true);
    expect(canReadRentals(viewer)).toBe(true);
    expect(canReadDriverIdentity(ops)).toBe(true);
    expect(canReadDriverIdentity(finance)).toBe(false);
  });
});
