import { describe, expect, it } from "vitest";
import { buildContractLengthLines, formatRentLabel, parseHireAccessSnapshot } from "./hire-access-display";

describe("formatRentLabel", () => {
  it("formats weekly rent", () => {
    expect(formatRentLabel(250, "weekly")).toBe("£250.00 per week");
  });
});

describe("buildContractLengthLines", () => {
  it("lists contract lengths with UK end dates", () => {
    const lines = buildContractLengthLines("2026-01-15", {
      contractLengths: [{ kind: "six_months" }, { kind: "annual" }],
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^6 months \(ends /);
    expect(lines[1]).toMatch(/^Annual \(ends /);
  });
});

describe("parseHireAccessSnapshot", () => {
  it("maps nested snapshot fields", () => {
    const display = parseHireAccessSnapshot(
      {
        start_date: "2026-03-01",
        rent_amount_gbp: 100,
        rent_cadence: "weekly",
        include_deposit: true,
        deposit_gbp: 500,
        companies: { name: "Acme Rentals" },
        subcompanies: {
          legal_name: "Acme Ltd",
          company_number: "12345678",
          registered_address_line1: "1 High Street",
          registered_town: "London",
          registered_postcode: "SW1A 1AA",
        },
        vehicles: { vrm: "AB12 CDE", make: "Ford", model: "Focus", colour: "blue", seats: 5 },
        draft_snapshot: { contractLengths: [{ kind: "annual" }] },
      },
      "Fallback Co",
      { title: "Hire terms", body: "<p>Terms</p>", versionLabel: "v1" },
    );

    expect(display.companyName).toBe("Acme Rentals");
    expect(display.subcompanyLegalName).toBe("Acme Ltd");
    expect(display.vehicleVrm).toBe("AB12 CDE");
    expect(display.vehicleDetailRows.some((r) => r.label === "Colour" && r.value === "BLUE")).toBe(true);
    expect(display.rentLabel).toBe("£100.00 per week");
    expect(display.depositLabel).toBe("£500.00");
    expect(display.contractLengthLines).toHaveLength(1);
    expect(display.termsTitle).toBe("Hire terms");
  });
});
