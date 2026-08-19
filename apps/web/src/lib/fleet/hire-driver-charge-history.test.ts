import { describe, expect, it } from "vitest";
import { formatHireDriverChargeHistoryEvent } from "./hire-driver-charge-history";

describe("formatHireDriverChargeHistoryEvent", () => {
  it("formats add with description as the body", () => {
    const display = formatHireDriverChargeHistoryEvent({
      id: "e1",
      eventType: "driver_charge_added",
      createdAt: "2026-08-17T10:00:00Z",
      actorDisplayName: "Ops Staff",
      metadata: {
        amountGbp: 40,
        chargeTypeLabel: "Administration",
        description: "Missed appointment fee",
      },
    });
    expect(display.title).toBe("Charge added");
    expect(display.body).toBe("Missed appointment fee");
    expect(display.detailLines).toContain("Amount: £40.00");
    expect(display.actorLabel).toBe("Ops Staff · Company staff");
  });

  it("formats amend with old to new amount and reason as body", () => {
    const display = formatHireDriverChargeHistoryEvent({
      id: "e2",
      eventType: "driver_charge_amended",
      createdAt: "2026-08-17T11:00:00Z",
      metadata: {
        previousAmountGbp: 40,
        amountGbp: 25,
        chargeTypeLabel: "Other",
        reason: "Quoted amount was wrong",
      },
    });
    expect(display.title).toBe("Charge amended");
    expect(display.body).toBe("Quoted amount was wrong");
    expect(display.detailLines[0]).toContain("£40.00");
    expect(display.detailLines[0]).toContain("£25.00");
  });

  it("formats remove with removed amount", () => {
    const display = formatHireDriverChargeHistoryEvent({
      id: "e3",
      eventType: "driver_charge_removed",
      createdAt: "2026-08-17T12:00:00Z",
      metadata: {
        amountGbp: 25,
        chargeTypeLabel: "Damage",
        reason: "Charged in error",
      },
    });
    expect(display.title).toBe("Charge removed");
    expect(display.body).toBe("Charged in error");
    expect(display.detailLines).toContain("Removed amount: £25.00");
  });
});
