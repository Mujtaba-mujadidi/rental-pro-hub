import { describe, expect, it } from "vitest";
import { resolveHireLessorDisplayName } from "@/lib/rental/subcompany-legal-snapshot";

describe("resolveHireLessorDisplayName", () => {
  it("prefers subcompany snapshot over parent company", () => {
    expect(
      resolveHireLessorDisplayName({
        snapshot: { legal_name: "Regal Car Hire Limited" },
        parentCompanyName: "Oxus Cars Ltd",
        hasSubcompany: true,
      }),
    ).toBe("Regal Car Hire Limited");
  });

  it("uses live subcompany fields when snapshot is empty", () => {
    expect(
      resolveHireLessorDisplayName({
        subcompany: { display_name: "Regal Car Hire", legal_name: "Regal Car Hire Limited" },
        parentCompanyName: "Oxus Cars Ltd",
        hasSubcompany: true,
      }),
    ).toBe("Regal Car Hire Limited");
  });

  it("does not use parent company when subcompany exists but names are missing", () => {
    expect(
      resolveHireLessorDisplayName({
        subcompany: {},
        parentCompanyName: "Oxus Cars Ltd",
        hasSubcompany: true,
      }),
    ).toBe("Rental company");
  });

  it("falls back to parent only for legacy hires without subcompany", () => {
    expect(
      resolveHireLessorDisplayName({
        parentCompanyName: "Oxus Cars Ltd",
        hasSubcompany: false,
      }),
    ).toBe("Oxus Cars Ltd");
  });
});
