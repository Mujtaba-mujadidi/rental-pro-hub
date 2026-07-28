import { describe, expect, it } from "vitest";
import { buildHirePdfDetails } from "@/lib/fleet/hire-pdf-details";

describe("buildHirePdfDetails", () => {
  it("includes lessor address and company number when provided", () => {
    const { hireDetails } = buildHirePdfDetails({
      driver: {
        first_name: "Alex",
        last_name: "Driver",
        address_line1: "10 Road",
        address_town: "London",
        address_postcode: "E1 1AA",
      },
      driverName: "Alex Driver",
      driverEmail: "alex@example.com",
      vehicle: { vrm: "AB12 CDE", make: "Toyota", model: "Prius" },
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      contractLengthKind: "custom",
      rentCadence: "weekly",
      rentAmountGbp: 250,
      depositGbp: 500,
      lessor: {
        legalName: "Oxus Cars Ltd",
        address: "1 High Street, London, E1 2AB",
        companyNumber: "12345678",
      },
    });

    expect(hireDetails.lessor).toEqual([
      { label: "Legal name", value: "Oxus Cars Ltd" },
      { label: "Address", value: "1 High Street, London, E1 2AB" },
      { label: "Company number", value: "12345678" },
    ]);
  });
});
