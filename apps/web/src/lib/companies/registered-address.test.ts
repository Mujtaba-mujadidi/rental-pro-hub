import { describe, expect, it } from "vitest";
import { formatRegisteredCompanyAddress } from "@/lib/companies/registered-address";

describe("formatRegisteredCompanyAddress", () => {
  it("joins address parts with commas", () => {
    expect(
      formatRegisteredCompanyAddress({
        registered_address_line1: "1 High Street",
        registered_address_line2: "Suite 2",
        registered_town: "London",
        registered_county: "Greater London",
        registered_postcode: "NW11 8LN",
      }),
    ).toBe("1 High Street, Suite 2, London, Greater London, NW11 8LN");
  });

  it("returns null when no parts are set", () => {
    expect(formatRegisteredCompanyAddress({})).toBeNull();
  });
});
