import { describe, expect, it } from "vitest";
import {
  evaluateHireDriverPackageAccess,
  hireAllowsCompanyDriverPackageAccess,
} from "@/lib/fleet/hire-driver-package-access";

describe("hireAllowsCompanyDriverPackageAccess", () => {
  it("allows approved open hires", () => {
    expect(
      hireAllowsCompanyDriverPackageAccess({
        driverAccessStatus: "approved",
        hireStatus: "draft",
        retainUntilYmd: null,
        todayYmd: "2026-08-16",
      }),
    ).toBe(true);
  });

  it("denies rejected and pending", () => {
    expect(
      evaluateHireDriverPackageAccess({
        driverAccessStatus: "rejected",
        hireStatus: "draft",
        retainUntilYmd: null,
        todayYmd: "2026-08-16",
      }),
    ).toEqual({ ok: false, reason: "not_approved" });
    expect(
      hireAllowsCompanyDriverPackageAccess({
        driverAccessStatus: "pending",
        hireStatus: "draft",
        retainUntilYmd: null,
        todayYmd: "2026-08-16",
      }),
    ).toBe(false);
  });

  it("denies cancelled even when access status left approved", () => {
    expect(
      evaluateHireDriverPackageAccess({
        driverAccessStatus: "approved",
        hireStatus: "cancelled",
        retainUntilYmd: null,
        todayYmd: "2026-08-16",
      }),
    ).toEqual({ ok: false, reason: "hire_cancelled" });
  });

  it("denies when retention window expired", () => {
    expect(
      evaluateHireDriverPackageAccess({
        driverAccessStatus: "approved",
        hireStatus: "completed",
        retainUntilYmd: "2026-01-01",
        todayYmd: "2026-08-16",
      }),
    ).toEqual({ ok: false, reason: "retention_expired" });
  });
});
