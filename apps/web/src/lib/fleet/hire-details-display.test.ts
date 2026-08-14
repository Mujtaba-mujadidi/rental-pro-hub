import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHireDetailsComplianceTiles,
  buildHireDetailsDriverDocumentRows,
  buildHireDetailsExpiringSoonItems,
  buildHireDetailsInsuranceDocumentRow,
  buildHireDetailsVehicleDocumentRows,
  hireDetailsDocumentStatusChip,
} from "@/lib/fleet/hire-details-display";
import type { HireDetailsPayload, HireDetailsRentalAgreement } from "@/app/actions/hire-details";

function basePayload(): Pick<
  HireDetailsPayload,
  "vehicleDocuments" | "vehicle" | "rental" | "hirerDocuments" | "hirer" | "hireStatus"
> {
  return {
    hireStatus: "active",
    rental: {
      companyName: null,
      startDateLabel: "10/08/2024, 00:00",
      activatedAtLabel: null,
      endedAtLabel: null,
      contractEndLabel: "09/08/2025, 00:00",
      contractEndYmd: "2026-08-09",
      rentAmountLabel: "£110.00",
      rentFrequencyLabel: "Daily",
      rentRateDetailsLabel: "£110.00 daily · £500.00 deposit", // middle-dot separator matches prototype
      depositLabel: "£500.00",
      checkoutBeforeScheduledNote: null,
      agreements: [],
    },
    vehicle: {
      vrm: "KE18 FSX",
      make: "Toyota",
      model: "Prius",
      colour: "Silver",
      fuelType: "Hybrid electric",
      seats: 5,
      cc: 1800,
      motExpiryLabel: "25 Jan 2027",
      motExpiryYmd: "2027-01-25",
      taxExpiryLabel: "1 Jan 2027",
      taxExpiryYmd: "2027-01-01",
      phvLicenceNo: null,
      phvExpiryLabel: "1 Aug 2027",
      phvExpiryYmd: "2027-08-01",
    },
    vehicleDocuments: [
      {
        id: "mot",
        label: "MOT",
        status: "on_file",
        viewUrl: "https://example.com/mot",
        fileName: "mot.pdf",
      },
      {
        id: "logbook",
        label: "Logbook (V5C)",
        status: "on_file",
        viewUrl: "https://example.com/v5c",
        fileName: "v5c.pdf",
      },
      {
        id: "phv_taxi_licence_paper",
        label: "PHV/Taxi licence paper",
        status: "on_file",
        viewUrl: "https://example.com/phv",
        fileName: "phv.pdf",
      },
    ],
    hirer: {
      fullName: "Driver",
      email: null,
      phone: null,
      address: null,
      drivingLicenceNumber: null,
      drivingLicenceExpiryLabel: "10/04/2026",
      phvLicenceExpiryLabel: "26/03/2027",
    },
    hirerDocuments: [
      {
        id: "driving_licence_front",
        label: "Driving licence (front)",
        status: "on_file",
        viewUrl: "https://example.com/licence-front",
        fileName: null,
      },
      {
        id: "driving_licence_back",
        label: "Driving licence (back)",
        status: "on_file",
        viewUrl: "https://example.com/licence-back",
        fileName: null,
      },
      {
        id: "phv_licence_card",
        label: "PHV/Taxi licence card",
        status: "on_file",
        viewUrl: "https://example.com/phv-card",
        fileName: null,
      },
    ],
  };
}

describe("hireDetailsDocumentStatusChip", () => {
  it("flags expiry during hire", () => {
    expect(
      hireDetailsDocumentStatusChip({
        status: "on_file",
        expiryYmd: "2026-07-01",
        contractEndYmd: "2026-08-09",
      }).label,
    ).toBe("Expires during hire");
  });
});

describe("buildHireDetailsVehicleDocumentRows", () => {
  it("maps vehicle document labels for the company view", () => {
    const rows = buildHireDetailsVehicleDocumentRows(basePayload());
    expect(rows.map((row) => row.label)).toEqual([
      "MOT certificate",
      "V5C registration document",
      "PHV vehicle licence",
    ]);
  });
});

describe("buildHireDetailsDriverDocumentRows", () => {
  it("aggregates driving licence rows", () => {
    const rows = buildHireDetailsDriverDocumentRows(basePayload());
    expect(rows.map((row) => row.label)).toEqual(["Driving licence", "PHV driver licence"]);
    expect(rows[0]?.status.label).toBe("Expires during hire");
  });
});

function agreement(partial: Partial<HireDetailsRentalAgreement> & Pick<HireDetailsRentalAgreement, "id" | "label">): HireDetailsRentalAgreement {
  return {
    endDateLabel: "09/08/2027, 00:00",
    endDateYmd: "2027-08-09",
    statusLabel: "Signed",
    signedAtLabel: null,
    pdfUrl: null,
    downloadFileName: null,
    ...partial,
  };
}

describe("buildHireDetailsExpiringSoonItems", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists vehicle MOT, tax and PHV that expire during the latest hire end", () => {
    const payload = basePayload();
    payload.rental.contractEndYmd = "2027-08-09";
    payload.vehicle.motExpiryYmd = "2027-01-25";
    payload.vehicle.taxExpiryYmd = "2027-01-01";
    payload.vehicle.phvExpiryYmd = "2027-06-01";

    expect(buildHireDetailsExpiringSoonItems(payload).map((item) => item.id)).toEqual([
      "vehicle-tax",
      "vehicle-mot",
      "vehicle-phv",
    ]);
  });

  it("omits items that expire after the hire and are not soon", () => {
    const payload = basePayload();
    payload.rental.contractEndYmd = "2026-12-01";
    payload.vehicle.motExpiryYmd = "2028-01-25";
    payload.vehicle.motExpiryLabel = "25 Jan 2028";
    payload.vehicle.taxExpiryYmd = null;
    payload.vehicle.taxExpiryLabel = "—";
    payload.vehicle.phvExpiryYmd = null;
    payload.vehicle.phvExpiryLabel = "—";

    expect(buildHireDetailsExpiringSoonItems(payload)).toEqual([]);
  });

  it("includes shorter agreements and skips the latest contract end", () => {
    const payload = basePayload();
    payload.rental.contractEndYmd = "2027-02-09";
    payload.vehicle.motExpiryYmd = "2028-01-25";
    payload.vehicle.motExpiryLabel = "25 Jan 2028";
    payload.vehicle.taxExpiryYmd = null;
    payload.vehicle.taxExpiryLabel = "—";
    payload.vehicle.phvExpiryYmd = null;
    payload.vehicle.phvExpiryLabel = "—";
    payload.rental.agreements = [
      agreement({
        id: "six-month",
        label: "Six-month hire agreement",
        endDateLabel: "09/02/2027, 00:00",
        endDateYmd: "2027-02-09",
        pdfUrl: "https://example.com/six-month.pdf",
      }),
      agreement({
        id: "annual",
        label: "Annual hire agreement",
        endDateLabel: "09/08/2027, 00:00",
        endDateYmd: "2027-08-09",
      }),
    ];

    const items = buildHireDetailsExpiringSoonItems(payload);
    expect(items.map((item) => item.id)).toEqual(["agreement-six-month"]);
    expect(items[0]?.kind).toBe("hire_agreement");
    expect(items[0]?.label).toBe("Six-month hire agreement");
    expect(items[0]?.statusLabel).toBe("Hire agreement ends during hire");
    expect(items[0]?.viewUrl).toBe("https://example.com/six-month.pdf");
  });

  it("labels a custom agreement and marks it expired after its end date", () => {
    const payload = basePayload();
    payload.rental.contractEndYmd = "2027-08-09";
    payload.vehicle.motExpiryYmd = null;
    payload.vehicle.motExpiryLabel = "—";
    payload.vehicle.taxExpiryYmd = null;
    payload.vehicle.taxExpiryLabel = "—";
    payload.vehicle.phvExpiryYmd = null;
    payload.vehicle.phvExpiryLabel = "—";
    payload.rental.agreements = [
      agreement({
        id: "custom",
        label: "Custom",
        endDateLabel: "01/09/2026, 09:00",
        endDateYmd: "2026-08-01",
        pdfUrl: "https://example.com/custom.pdf",
      }),
      agreement({
        id: "annual",
        label: "Annual",
        endDateLabel: "09/08/2027, 00:00",
        endDateYmd: "2027-08-09",
      }),
    ];

    const items = buildHireDetailsExpiringSoonItems(payload);
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Custom hire agreement");
    expect(items[0]?.kind).toBe("hire_agreement");
    expect(items[0]?.statusLabel).toBe("Hire agreement expired");
    expect(items[0]?.statusTone).toBe("danger");
  });

  it("omits expiring hire agreements when the contract has ended", () => {
    const payload = basePayload();
    payload.hireStatus = "completed";
    payload.rental.contractEndYmd = "2027-08-09";
    payload.vehicle.motExpiryYmd = null;
    payload.vehicle.motExpiryLabel = "—";
    payload.vehicle.taxExpiryYmd = null;
    payload.vehicle.taxExpiryLabel = "—";
    payload.vehicle.phvExpiryYmd = null;
    payload.vehicle.phvExpiryLabel = "—";
    payload.rental.agreements = [
      agreement({
        id: "custom",
        label: "Custom",
        endDateLabel: "01/09/2026, 09:00",
        endDateYmd: "2026-09-01",
      }),
      agreement({
        id: "annual",
        label: "Annual",
        endDateLabel: "09/08/2027, 00:00",
        endDateYmd: "2027-08-09",
      }),
    ];

    expect(buildHireDetailsExpiringSoonItems(payload)).toEqual([]);
  });
});

function insuranceSummary(
  partial: Partial<HireDetailsPayload["hireInsurance"]>,
): HireDetailsPayload["hireInsurance"] {
  return {
    providedBy: "driver",
    providedByLabel: "Driver",
    insuranceType: null,
    insuranceTypeLabel: null,
    expiryDate: null,
    fileName: null,
    uploadedAtLabel: null,
    uploadedByRole: null,
    status: "awaiting_upload",
    attentionMessage: "Insurance certificate required — to be uploaded by the driver.",
    canUpload: false,
    hasDocument: false,
    ...partial,
  };
}

describe("buildHireDetailsComplianceTiles", () => {
  it("does not show On file when the driver has not uploaded a certificate", () => {
    const payload = {
      ...basePayload(),
      hireInsurance: insuranceSummary({
        providedBy: "driver",
        status: "awaiting_upload",
        hasDocument: false,
      }),
    };
    const [insurance] = buildHireDetailsComplianceTiles(payload);
    expect(insurance?.badgeLabel).toBe("Awaiting upload");
    expect(insurance?.detail).toBe("Awaiting upload from the driver.");
    expect(insurance?.badgeTone).toBe("warn");
  });

  it("does not show On file when insurance is not configured", () => {
    const payload = {
      ...basePayload(),
      hireInsurance: insuranceSummary({
        providedBy: null,
        providedByLabel: null,
        status: "not_configured",
        hasDocument: false,
        attentionMessage: null,
      }),
    };
    const [insurance] = buildHireDetailsComplianceTiles(payload);
    expect(insurance?.badgeLabel).toBe("Not set");
    expect(insurance?.badgeLabel).not.toBe("On file");
  });

  it("does not show On file when status is on_file but no document exists", () => {
    const payload = {
      ...basePayload(),
      hireInsurance: insuranceSummary({
        status: "on_file",
        hasDocument: false,
      }),
    };
    const [insurance] = buildHireDetailsComplianceTiles(payload);
    expect(insurance?.badgeLabel).toBe("Awaiting upload");
  });
});

describe("buildHireDetailsInsuranceDocumentRow", () => {
  it("adds a missing hire insurance row for driver documents", () => {
    const row = buildHireDetailsInsuranceDocumentRow({
      rental: basePayload().rental,
      hireInsurance: insuranceSummary({ hasDocument: false, status: "awaiting_upload" }),
    });
    expect(row.label).toBe("Hire insurance certificate");
    expect(row.status.label).toBe("Missing");
    expect(row.subtitle).toMatch(/driver/i);
  });

  it("shows expiry when a certificate is on file", () => {
    const row = buildHireDetailsInsuranceDocumentRow({
      rental: basePayload().rental,
      hireInsurance: insuranceSummary({
        hasDocument: true,
        status: "on_file",
        expiryDate: "2027-01-15",
        insuranceTypeLabel: "Fully Comprehensive",
        fileName: "hire-insurance.pdf",
      }),
    });
    expect(row.status.tone).toBe("success");
    expect(row.subtitle).toContain("Fully Comprehensive");
    expect(row.subtitle).toContain("15/01/2027");
  });
});
