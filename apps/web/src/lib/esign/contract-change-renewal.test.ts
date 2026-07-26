import { describe, expect, it } from "vitest";
import {
  maxCountedContractVersionNumber,
  nextContractVersionNumber,
} from "@/lib/companies/contract-version-display";

describe("nextContractVersionNumber", () => {
  it("starts at 1 when no versions exist", () => {
    expect(nextContractVersionNumber(null)).toBe(1);
    expect(nextContractVersionNumber(undefined)).toBe(1);
  });

  it("increments from the highest counted version number", () => {
    expect(nextContractVersionNumber(1)).toBe(2);
    expect(nextContractVersionNumber(2)).toBe(3);
  });
});

describe("maxCountedContractVersionNumber", () => {
  it("ignores abandoned renewal drafts when choosing the next version", () => {
    expect(
      maxCountedContractVersionNumber([
        {
          versionNumber: 1,
          versionStatus: "superseded",
          signedByCustomerAt: "2026-07-17T17:27:00.000Z",
          hasPdf: true,
        },
        {
          versionNumber: 2,
          versionStatus: "superseded",
          changeReason: "Legal detail change — pending customer signature",
          hasPdf: false,
        },
        {
          versionNumber: 3,
          versionStatus: "superseded",
          changeReason: "Legal detail change — pending customer signature",
          hasPdf: false,
        },
      ]),
    ).toBe(1);
  });
});
