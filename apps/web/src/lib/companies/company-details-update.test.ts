import { describe, expect, it } from "vitest";
import {
  companyDetailsUpdateFromSnapshot,
  primarySubcompanyMirrorFromSnapshot,
} from "./company-details-update";

const snapshot = {
  name: "Oxus Cars Ltd",
  legal_name: "Oxus Cars Ltd",
  company_number: "12345678",
  registered_address_line1: "1 High Street",
  registered_address_line2: null,
  registered_town: "London",
  registered_county: "Greater London",
  registered_postcode: "SW1A1AA",
  country: "GB",
  primary_contact_first_name: "Jane",
  primary_contact_last_name: "Doe",
  primary_contact_dob: "1985-06-01",
  primary_contact_phone: "07700900123",
  primary_contact_email: "jane@oxus.test",
  notes: "Note",
};

describe("company details update mapping", () => {
  it("maps full company update payload", () => {
    expect(companyDetailsUpdateFromSnapshot(snapshot).registered_postcode).toBe("SW1A1AA");
    expect(companyDetailsUpdateFromSnapshot(snapshot).name).toBe("Oxus Cars Ltd");
  });

  it("maps primary subcompany mirror fields only", () => {
    const mirror = primarySubcompanyMirrorFromSnapshot(snapshot);
    expect(mirror.name).toBe("Oxus Cars Ltd");
    expect(mirror.primary_contact_email).toBe("jane@oxus.test");
    expect(Object.keys(mirror)).toEqual([
      "name",
      "primary_contact_first_name",
      "primary_contact_last_name",
      "primary_contact_dob",
      "primary_contact_phone",
      "primary_contact_email",
    ]);
  });
});
