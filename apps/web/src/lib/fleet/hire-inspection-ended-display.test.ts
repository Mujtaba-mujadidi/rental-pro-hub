import { describe, expect, it } from "vitest";
import {
  hireInspectionEndedComparisonCopy,
  hireInspectionEndedEmptyMessage,
} from "@/lib/fleet/hire-inspection-ended-display";

describe("hireInspectionEndedComparisonCopy", () => {
  it("uses driver-friendly labels", () => {
    const copy = hireInspectionEndedComparisonCopy("driver");
    expect(copy.openCheckout).toBe("View checkout");
    expect(copy.mileageActionLabel).toBe("View check-in");
    expect(copy.checkinStatusReview).toBe("Recorded");
  });

  it("uses staff workflow labels", () => {
    const copy = hireInspectionEndedComparisonCopy("staff");
    expect(copy.openCheckout).toBe("Open checkout");
    expect(copy.mileageActionLabel).toBe("Review reading");
    expect(copy.checkinStatusReview).toBe("Needs review");
  });
});

describe("hireInspectionEndedEmptyMessage", () => {
  it("explains pending driver inspections", () => {
    expect(hireInspectionEndedEmptyMessage("driver", "checkout-pending")).toContain(
      "rental company",
    );
    expect(hireInspectionEndedEmptyMessage("driver", "checkin-pending")).toContain("return inspection");
  });
});
