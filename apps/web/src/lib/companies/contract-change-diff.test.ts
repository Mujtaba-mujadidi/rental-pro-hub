import { describe, expect, it } from "vitest";
import {
  buildContractChangeDiff,
  companySnapshotForChangeDiff,
  contractChangeDiffDisplayChangedRows,
  contractChangeDiffHasChanges,
  postcodeForForm,
  proposedSnapshotFromChangeRequest,
} from "./contract-change-diff";

describe("buildContractChangeDiff", () => {
  const current = {
    name: "Acme Rentals",
    legal_name: "Acme Rentals Ltd",
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
    primary_contact_email: "jane@acme.test",
    notes: "Original note",
  };

  it("flags changed fields", () => {
    const proposed = {
      ...current,
      legal_name: "Acme Vehicle Rentals Ltd",
      registered_address_line1: "2 Market Road",
      primary_contact_email: "legal@acme.test",
    };
    const rows = buildContractChangeDiff(current, proposed);
    expect(contractChangeDiffHasChanges(rows)).toBe(true);
    expect(rows.find((r) => r.key === "legal_name")?.changed).toBe(true);
    expect(rows.find((r) => r.key === "name")?.changed).toBe(false);
    expect(rows.find((r) => r.key === "primary_contact_email")?.after).toBe("legal@acme.test");
  });

  it("treats postcode spacing as the same substantive value", () => {
    const proposed = { ...current, registered_postcode: "SW1A 1AA" };
    const rows = buildContractChangeDiff(current, proposed);
    expect(contractChangeDiffHasChanges(rows)).toBe(false);
    const postcodeRow = rows.find((r) => r.key === "registered_postcode");
    expect(postcodeRow?.displayChanged).toBe(true);
    expect(postcodeRow?.formattingOnly).toBe(true);
    expect(postcodeRow?.before).toBe("SW1A1AA");
    expect(postcodeRow?.after).toBe("SW1A 1AA");
    expect(rows.find((r) => r.key === "registered_address")?.displayChanged).toBe(false);
  });

  it("formats compact postcode for form display", () => {
    expect(postcodeForForm("NW118LN")).toBe("NW11 8LN");
    expect(postcodeForForm("SW1A1AA")).toBe("SW1A 1AA");
  });

  it("flags trailing space as formatting-only on company name", () => {
    const proposed = { ...current, name: "Acme Rentals " };
    const rows = buildContractChangeDiff(current, proposed);
    const nameRow = rows.find((r) => r.key === "name");
    expect(nameRow?.changed).toBe(false);
    expect(nameRow?.displayChanged).toBe(true);
    expect(nameRow?.formattingOnly).toBe(true);
  });

  it("treats removing postcode spacing as formatting-only when DB is compact", () => {
    const compact = { ...current, registered_postcode: "NW118LN" };
    const proposed = { ...compact, registered_postcode: "NW118LN" };
    const rows = buildContractChangeDiff(companySnapshotForChangeDiff(compact), proposed);
    expect(contractChangeDiffHasChanges(rows)).toBe(false);
    expect(rows.find((r) => r.key === "registered_postcode")?.formattingOnly).toBe(true);
  });

  it("filters to display-changed rows only", () => {
    const proposed = { ...current, registered_postcode: "SW1A 1AA", name: "Acme Rentals " };
    const rows = buildContractChangeDiff(current, proposed);
    const changed = contractChangeDiffDisplayChangedRows(rows);
    expect(changed.map((r) => r.key)).toEqual(["name", "registered_postcode"]);
  });

  it("maps change request proposed columns", () => {
    const proposed = proposedSnapshotFromChangeRequest({
      proposed_name: "New Co",
      proposed_legal_name: null,
      proposed_company_number: null,
      proposed_registered_address_line1: "A",
      proposed_registered_address_line2: null,
      proposed_registered_town: null,
      proposed_registered_county: null,
      proposed_registered_postcode: null,
      proposed_country: "GB",
      proposed_primary_contact_first_name: "A",
      proposed_primary_contact_last_name: "B",
      proposed_primary_contact_dob: "2000-01-01",
      proposed_primary_contact_phone: "1",
      proposed_primary_contact_email: "a@b.c",
      proposed_notes: null,
    });
    expect(proposed.name).toBe("New Co");
    expect(buildContractChangeDiff(current, proposed)[0]?.after).toBe("New Co");
  });
});
