import { describe, expect, it } from "vitest";
import {
  formatHireDriverChargeHistoryEvent,
  mergeHireDriverChargeHistory,
} from "./hire-driver-charge-history";

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

  it("formats void with voided amount and reason", () => {
    const display = formatHireDriverChargeHistoryEvent({
      id: "e4",
      eventType: "driver_charge_voided",
      createdAt: "2026-08-17T13:00:00Z",
      metadata: {
        amountGbp: 50,
        chargeTypeLabel: "Administration",
        reason: "Posted in error",
      },
    });
    expect(display.title).toBe("Charge voided");
    expect(display.body).toBe("Posted in error");
    expect(display.detailLines).toContain("Voided amount: £50.00");
  });
});

describe("mergeHireDriverChargeHistory", () => {
  it("shows each staff payment transaction separately for one charge", () => {
    const events = mergeHireDriverChargeHistory({
      chargeLineItemId: "c1",
      lifecycleEvents: [
        {
          id: "e1",
          eventType: "driver_charge_added",
          createdAt: "2026-08-17T09:00:00.000Z",
          metadata: {
            chargeLineItemId: "c1",
            amountGbp: 50,
            chargeTypeLabel: "Administration",
          },
        },
      ],
      charges: [
        {
          id: "c1",
          amountGbp: 50,
          resolution: "add_to_balance",
          chargedOn: "2026-08-17",
          createdAt: "2026-08-17T09:00:00.000Z",
        },
      ],
      payments: [
        {
          id: "p1",
          amountGbp: 20,
          paidAt: "2026-08-17T10:00:00.000Z",
          paymentMethod: "cash",
          paymentReference: null,
          paymentAccountName: null,
          notes: null,
        },
        {
          id: "p2",
          amountGbp: 30,
          paidAt: "2026-08-17T11:00:00.000Z",
          paymentMethod: "bank_transfer",
          paymentReference: "REF-2",
          paymentAccountName: "Main account",
          notes: null,
        },
      ],
    });

    const paymentEvents = events.filter((row) => row.title === "Payment recorded");
    expect(paymentEvents).toHaveLength(2);
    expect(paymentEvents[0]?.detailLines[0]).toBe("Amount: £20.00");
    expect(paymentEvents[1]?.detailLines[0]).toBe("Amount: £30.00");
    expect(paymentEvents[0]?.detailLines.some((line) => line.startsWith("Paid on:"))).toBe(true);
    expect(paymentEvents[0]?.detailLines.find((line) => line.startsWith("Paid on:"))).toMatch(
      /Paid on: \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/,
    );
  });

  it("does not attribute paid_now cash to a later add_to_balance charge history", () => {
    const damageHistory = mergeHireDriverChargeHistory({
      chargeLineItemId: "damage",
      lifecycleEvents: [],
      charges: [
        {
          id: "admin",
          amountGbp: 30,
          resolution: "paid_now",
          chargedOn: "2026-08-10",
          createdAt: "2026-08-10T10:00:00.000Z",
          balancePaymentId: "p-now",
        },
        {
          id: "damage",
          amountGbp: 100,
          resolution: "add_to_balance",
          chargedOn: "2026-08-11",
          createdAt: "2026-08-11T10:00:00.000Z",
        },
      ],
      payments: [
        {
          id: "p-now",
          amountGbp: 30,
          paidAt: "2026-08-10T12:00:00.000Z",
          paymentMethod: "cash",
          paymentReference: null,
          paymentAccountName: null,
          notes: null,
        },
      ],
    });
    expect(damageHistory.filter((row) => row.title === "Payment recorded")).toHaveLength(0);
  });

  it("does not attribute a pre-charge payment to a charge in history", () => {
    const events = mergeHireDriverChargeHistory({
      chargeLineItemId: "pco",
      lifecycleEvents: [
        {
          id: "e1",
          eventType: "driver_charge_added",
          createdAt: "2026-08-23T19:20:00.000Z",
          metadata: {
            chargeLineItemId: "pco",
            amountGbp: 100,
            chargeTypeLabel: "Administration",
          },
        },
      ],
      charges: [
        {
          id: "pcn",
          amountGbp: 30,
          resolution: "add_to_balance",
          chargedOn: "2026-08-23",
          createdAt: "2026-08-23T10:00:00.000Z",
        },
        {
          id: "pco",
          amountGbp: 100,
          resolution: "add_to_balance",
          chargedOn: "2026-08-23",
          createdAt: "2026-08-23T19:20:00.000Z",
        },
      ],
      payments: [
        {
          id: "p60",
          amountGbp: 60,
          paidAt: "2026-08-23T13:00:00.000Z",
          paymentMethod: "bank_transfer",
          paymentReference: null,
          paymentAccountName: null,
          notes: null,
        },
        {
          id: "p10",
          amountGbp: 10,
          paidAt: "2026-08-23T19:25:00.000Z",
          paymentMethod: "bank_transfer",
          paymentReference: null,
          paymentAccountName: null,
          notes: null,
        },
      ],
    });
    const paymentEvents = events.filter((row) => row.title === "Payment recorded");
    expect(paymentEvents).toHaveLength(1);
    expect(paymentEvents[0]?.detailLines[0]).toBe("Amount: £10.00");
  });
});
