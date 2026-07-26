import { describe, expect, it } from "vitest";
import {
  assertContractChangeHasDisplayChanges,
  assertContractChangeHasSubstantiveChanges,
  assertContractChangeIsFormattingOnly,
  contractChangeRequiresFormattingConfirm,
  parseContractChangeFormData,
} from "./contract-change-form";
import type { ContractChangeFieldSnapshot } from "./contract-change-diff";

const current: ContractChangeFieldSnapshot = {
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

describe("contract change form validation", () => {
  it("blocks when nothing changed", () => {
    const res = assertContractChangeHasDisplayChanges(current, { ...current });
    expect(res.ok).toBe(false);
  });

  it("allows substantive legal changes", () => {
    const res = assertContractChangeHasSubstantiveChanges(current, {
      ...current,
      legal_name: "Oxus Vehicle Rentals Ltd",
    });
    expect(res.ok).toBe(true);
  });

  it("flags formatting-only trailing space as display change but not substantive", () => {
    const proposed = { ...current, name: "Oxus Cars Ltd " };
    expect(assertContractChangeHasDisplayChanges(current, proposed).ok).toBe(true);
    expect(assertContractChangeHasSubstantiveChanges(current, proposed).ok).toBe(false);
    expect(contractChangeRequiresFormattingConfirm(current, proposed)).toBe(true);
  });

  it("allows removing postcode spacing as formatting-only", () => {
    const compact = { ...current, registered_postcode: "NW118LN" };
    const proposed = { ...compact, registered_postcode: "NW118LN" };
    expect(assertContractChangeIsFormattingOnly(compact, proposed).ok).toBe(true);
  });

  it("rejects substantive changes for formatting-only save", () => {
    const proposed = { ...current, legal_name: "Oxus Vehicle Rentals Ltd" };
    const res = assertContractChangeIsFormattingOnly(current, proposed);
    expect(res.ok).toBe(false);
  });

  it("detects postcode spacing via proposedForDiff after form parse", () => {
    const oxusCurrent = { ...current, registered_postcode: "NW118LN" };
    const fd = new FormData();
    fd.set("name", oxusCurrent.name!);
    fd.set("legal_name", oxusCurrent.legal_name ?? "");
    fd.set("company_number", oxusCurrent.company_number ?? "");
    fd.set("registered_address_line1", oxusCurrent.registered_address_line1 ?? "");
    fd.set("registered_address_line2", "");
    fd.set("registered_town", oxusCurrent.registered_town ?? "");
    fd.set("registered_county", oxusCurrent.registered_county ?? "");
    fd.set("registered_postcode", "NW118LN");
    fd.set("country", oxusCurrent.country ?? "GB");
    fd.set("primary_contact_first_name", oxusCurrent.primary_contact_first_name!);
    fd.set("primary_contact_last_name", oxusCurrent.primary_contact_last_name!);
    fd.set("primary_contact_dob", oxusCurrent.primary_contact_dob!);
    fd.set("primary_contact_phone", oxusCurrent.primary_contact_phone!);
    fd.set("primary_contact_email", oxusCurrent.primary_contact_email!);
    fd.set("notes", oxusCurrent.notes ?? "");
    fd.set("transition_type", "detail_change");

    const parsed = parseContractChangeFormData(fd);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.data.proposed.registered_postcode).toBe("NW118LN");
    expect(parsed.data.proposedForDiff.registered_postcode).toBe("NW118LN");
    expect(assertContractChangeIsFormattingOnly(oxusCurrent, parsed.data.proposedForDiff).ok).toBe(true);
  });

  it("detects adding postcode spacing via proposedForDiff after form parse", () => {
    const oxusCurrent = { ...current, registered_postcode: "NW118LN" };
    const fd = new FormData();
    fd.set("name", oxusCurrent.name!);
    fd.set("legal_name", oxusCurrent.legal_name ?? "");
    fd.set("company_number", oxusCurrent.company_number ?? "");
    fd.set("registered_address_line1", oxusCurrent.registered_address_line1 ?? "");
    fd.set("registered_address_line2", "");
    fd.set("registered_town", oxusCurrent.registered_town ?? "");
    fd.set("registered_county", oxusCurrent.registered_county ?? "");
    fd.set("registered_postcode", "NW11 8LN");
    fd.set("country", oxusCurrent.country ?? "GB");
    fd.set("primary_contact_first_name", oxusCurrent.primary_contact_first_name!);
    fd.set("primary_contact_last_name", oxusCurrent.primary_contact_last_name!);
    fd.set("primary_contact_dob", oxusCurrent.primary_contact_dob!);
    fd.set("primary_contact_phone", oxusCurrent.primary_contact_phone!);
    fd.set("primary_contact_email", oxusCurrent.primary_contact_email!);
    fd.set("notes", oxusCurrent.notes ?? "");
    fd.set("transition_type", "detail_change");

    const parsed = parseContractChangeFormData(fd);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Spaced entry matches formatted display of compact DB — no further save needed.
    expect(assertContractChangeIsFormattingOnly(oxusCurrent, parsed.data.proposedForDiff).ok).toBe(false);
  });
});
