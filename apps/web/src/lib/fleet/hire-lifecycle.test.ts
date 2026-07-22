import { describe, expect, it } from "vitest";
import {
  allAgreementsSigned,
  computeContractEndDate,
  hireGroupStatusAfterAllSigned,
  isStartDateInFuture,
  longestAgreementEndDate,
  vehicleStatusForHireGroup,
} from "@/lib/fleet/hire-lifecycle";

describe("computeContractEndDate", () => {
  it("adds one inclusive year for annual (end day before anniversary)", () => {
    expect(computeContractEndDate("2026-01-15", "annual")).toBe("2027-01-14");
  });

  it("adds six inclusive months for six_months", () => {
    expect(computeContractEndDate("2026-01-15", "six_months")).toBe("2026-07-14");
  });

  it("uses custom end when valid", () => {
    expect(computeContractEndDate("2026-01-15", "custom", "2026-06-01")).toBe("2026-06-01");
    expect(computeContractEndDate("2026-01-15", "custom", "2025-12-01")).toBeNull();
  });
});

describe("longestAgreementEndDate", () => {
  it("picks max", () => {
    expect(longestAgreementEndDate(["2026-06-01", "2027-01-01", "2026-12-01"])).toBe("2027-01-01");
  });
});

describe("allAgreementsSigned", () => {
  it("requires all true and non-empty", () => {
    expect(allAgreementsSigned([true, true])).toBe(true);
    expect(allAgreementsSigned([true, false])).toBe(false);
    expect(allAgreementsSigned([])).toBe(false);
  });
});

describe("vehicleStatusForHireGroup", () => {
  it("maps statuses", () => {
    expect(vehicleStatusForHireGroup("draft")).toBe("reserved");
    expect(vehicleStatusForHireGroup("pending_signature")).toBe("reserved");
    expect(vehicleStatusForHireGroup("reserved")).toBe("reserved");
    expect(vehicleStatusForHireGroup("active")).toBe("on_rent");
    expect(vehicleStatusForHireGroup("terminated")).toBe("available");
    expect(vehicleStatusForHireGroup("cancelled")).toBe("available");
  });
});

describe("hireGroupStatusAfterAllSigned", () => {
  it("reserved when future start", () => {
    expect(hireGroupStatusAfterAllSigned("2026-08-01", "2026-07-22")).toBe("reserved");
    expect(isStartDateInFuture("2026-08-01", "2026-07-22")).toBe(true);
  });

  it("active when start today or past", () => {
    expect(hireGroupStatusAfterAllSigned("2026-07-22", "2026-07-22")).toBe("active");
  });
});
