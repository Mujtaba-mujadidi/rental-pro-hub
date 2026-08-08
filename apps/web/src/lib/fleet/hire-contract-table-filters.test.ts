import { describe, expect, it } from "vitest";
import {
  HIRE_CONTRACT_STATUS_FILTER_OPTIONS,
  hireContractMatchesStatusFilter,
} from "@/lib/fleet/hire-contract-table-filters";

describe("hireContractMatchesStatusFilter", () => {
  it("matches all", () => {
    expect(hireContractMatchesStatusFilter("active", "all")).toBe(true);
    expect(hireContractMatchesStatusFilter("terminated", "all")).toBe(true);
  });

  it("matches each status exactly", () => {
    expect(hireContractMatchesStatusFilter("active", "active")).toBe(true);
    expect(hireContractMatchesStatusFilter("active", "terminated")).toBe(false);
    expect(hireContractMatchesStatusFilter("draft", "draft")).toBe(true);
    expect(hireContractMatchesStatusFilter("pending_signature", "pending_signature")).toBe(true);
    expect(hireContractMatchesStatusFilter("terminated", "completed")).toBe(false);
  });
});

describe("HIRE_CONTRACT_STATUS_FILTER_OPTIONS", () => {
  it("has no duplicate values", () => {
    const values = HIRE_CONTRACT_STATUS_FILTER_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("uses the same labels as the hires table Status column", () => {
    expect(HIRE_CONTRACT_STATUS_FILTER_OPTIONS.find((o) => o.value === "active")?.label).toBe("On rent");
    expect(HIRE_CONTRACT_STATUS_FILTER_OPTIONS.find((o) => o.value === "terminated")?.label).toBe(
      "Contract ended",
    );
    expect(HIRE_CONTRACT_STATUS_FILTER_OPTIONS.find((o) => o.value === "completed")?.label).toBe(
      "Hire completed",
    );
  });
});
