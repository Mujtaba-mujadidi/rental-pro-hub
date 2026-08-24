import { describe, expect, it } from "vitest";
import {
  buildCompanySettingsMap,
  buildComplianceStaffByCompany,
  buildDriverLicenceExpiryNotifications,
  buildHireComplianceNotifications,
  buildVehicleExpiryNotifications,
  collectOpenHireDriverCompanyPairs,
  complianceNotificationDedupeKey,
  extractAlreadySentComplianceKeys,
  filterPendingComplianceNotifications,
} from "@/lib/platform-compliance-notifications";

describe("platform-compliance-notifications", () => {
  const todayYmd = "2026-08-23";
  const staffByCompany = new Map<string, string[]>([["company-1", ["staff-1"]]]);
  const settingsByCompany = buildCompanySettingsMap([
    {
      id: "company-1",
      notify_mot_days_before: 5,
      notify_tax_days_before: 5,
      notify_phv_licence_days_before: 28,
      notify_contract_expiry_days_before: 28,
      notify_insurance_days_before: 28,
    },
  ]);

  it("builds vehicle expiry notifications for staff in the attention window", () => {
    const pending = buildVehicleExpiryNotifications({
      vehicles: [
        {
          id: "vehicle-1",
          parent_company_id: "company-1",
          vrm: "AB12 CDE",
          mot_expiry: "2026-08-25",
          tax_expiry: "2027-01-01",
          phv_licence_expiry: null,
        },
      ],
      staffByCompany,
      settingsByCompany,
      todayYmd,
    });

    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe("vehicle_expiry_mot");
    expect(pending[0]?.userId).toBe("staff-1");
    expect(pending[0]?.payload.vehicleVrm).toBe("AB12 CDE");
    expect(pending[0]?.payload.dedupeKey).toBe(
      complianceNotificationDedupeKey(["vehicle", "vehicle-1", "mot", "staff-1", todayYmd]),
    );
  });

  it("notifies drivers and company staff about expiring licences when there is an open hire", () => {
    const pending = buildDriverLicenceExpiryNotifications({
      profiles: [
        {
          user_id: "driver-1",
          driving_licence_expiry: "2026-08-30",
          phv_licence_expiry: null,
          first_name: "Jane",
          last_name: "Driver",
        },
      ],
      openHireDriverCompanies: [
        { parent_company_id: "company-1", driver_user_id: "driver-1" },
      ],
      staffByCompany,
      todayYmd,
    });

    expect(pending).toHaveLength(2);
    expect(pending.some((row) => row.userId === "driver-1" && row.payload.audience === "driver")).toBe(
      true,
    );
    expect(pending.some((row) => row.userId === "staff-1" && row.payload.audience === "staff")).toBe(
      true,
    );
  });

  it("does not notify company staff about driver licences without an open hire", () => {
    const pending = buildDriverLicenceExpiryNotifications({
      profiles: [
        {
          user_id: "driver-1",
          driving_licence_expiry: "2026-08-30",
          phv_licence_expiry: null,
          first_name: "Jane",
          last_name: "Driver",
        },
      ],
      openHireDriverCompanies: [],
      staffByCompany,
      todayYmd,
    });

    expect(pending).toHaveLength(1);
    expect(pending[0]?.userId).toBe("driver-1");
    expect(pending[0]?.payload.audience).toBe("driver");
  });

  it("collects open hire company/driver pairs for licence staff alerts", () => {
    const pairs = collectOpenHireDriverCompanyPairs([
      { parent_company_id: "company-1", driver_user_id: "driver-1", status: "active" },
      { parent_company_id: "company-1", driver_user_id: "driver-1", status: "active" },
      { parent_company_id: "company-2", driver_user_id: "driver-1", status: "completed" },
    ]);
    expect(pairs).toEqual([{ parent_company_id: "company-1", driver_user_id: "driver-1" }]);
  });

  it("builds hire insurance and contract expiry notifications", () => {
    const pending = buildHireComplianceNotifications({
      hires: [
        {
          id: "hire-1",
          parent_company_id: "company-1",
          status: "active",
          driver_user_id: "driver-1",
          insurance_provided_by: "driver",
          vehicles: { vrm: "AB12 CDE" },
          vehicle_hire_agreements: [{ end_date: "2026-09-01", status: "signed" }],
          vehicle_hire_insurance: [{ expiry_date: "2026-08-30", file_path: "insurance.pdf" }],
        },
      ],
      staffByCompany,
      settingsByCompany,
      todayYmd,
    });

    expect(pending.some((row) => row.type === "hire_insurance_expiry")).toBe(true);
    expect(pending.some((row) => row.type === "hire_contract_expiry")).toBe(true);
    expect(pending.some((row) => row.userId === "driver-1")).toBe(true);
    expect(pending.some((row) => row.userId === "staff-1")).toBe(true);
  });

  it("dedupes notifications already sent today", () => {
    const pending = buildVehicleExpiryNotifications({
      vehicles: [
        {
          id: "vehicle-1",
          parent_company_id: "company-1",
          vrm: "AB12 CDE",
          mot_expiry: "2026-08-25",
          tax_expiry: null,
          phv_licence_expiry: null,
        },
      ],
      staffByCompany,
      settingsByCompany,
      todayYmd,
    });
    const dedupeKey = pending[0]!.payload.dedupeKey;
    const alreadySent = extractAlreadySentComplianceKeys(
      [
        {
          user_id: "staff-1",
          type: "vehicle_expiry_mot",
          payload: { dedupeKey },
          created_at: "2026-08-23T08:00:00.000Z",
        },
      ],
      todayYmd,
    );
    const filtered = filterPendingComplianceNotifications(pending, alreadySent);
    expect(filtered).toHaveLength(0);
  });

  it("groups compliance staff by company", () => {
    const map = buildComplianceStaffByCompany([
      { parent_company_id: "company-1", user_id: "staff-1", role: "operations" },
      { parent_company_id: "company-1", user_id: "staff-2", role: "viewer" },
      { parent_company_id: "company-2", user_id: "staff-3", role: "admin" },
    ]);
    expect(map.get("company-1")).toEqual(["staff-1"]);
    expect(map.get("company-2")).toEqual(["staff-3"]);
  });
});
