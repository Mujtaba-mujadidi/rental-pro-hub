import { describe, expect, it } from "vitest";
import {
  formatHirePaymentDiscountEvent,
  formatHirePaymentRowEvent,
  mergeHirePaymentRowHistory,
} from "@/lib/fleet/hire-payment-row-history";

const base = {
  id: "evt-1",
  createdAt: "2026-07-20T10:00:00Z",
};

describe("formatHirePaymentRowEvent", () => {
  it("formats rejection with comment", () => {
    const display = formatHirePaymentRowEvent({
      ...base,
      eventKind: "status_change",
      fromStatus: "pending_approval",
      toStatus: "rejected",
      comment: "Amount does not match bank transfer",
      amendmentPayload: { submittedAmountGbp: 250 },
      actorRole: "company_staff",
    });
    expect(display.title).toBe("Payment rejected");
    expect(display.body).toBe("Amount does not match bank transfer");
    expect(display.detailLines).toContain("Submitted amount: £250.00");
    expect(display.actorLabel).toBe("Company staff");
  });

  it("formats amendment with amount change and reason", () => {
    const display = formatHirePaymentRowEvent({
      ...base,
      eventKind: "amendment",
      fromStatus: "approved",
      toStatus: "approved",
      comment: "Bank fee correction",
      amendmentPayload: { previousApprovedAmountGbp: 250, newApprovedAmountGbp: 245 },
      actorRole: "company_staff",
    });
    expect(display.title).toBe("Approved amount amended");
    expect(display.body).toBe("Bank fee correction");
    expect(display.detailLines[0]).toContain("£250.00");
    expect(display.detailLines[0]).toContain("£245.00");
  });

  it("formats clearing an approved amount back to unpaid", () => {
    const display = formatHirePaymentRowEvent({
      ...base,
      eventKind: "status_change",
      fromStatus: "approved",
      toStatus: "not_received",
      comment: "Payment was not received",
      amendmentPayload: { previousApprovedAmountGbp: 7, newApprovedAmountGbp: 0 },
      actorRole: "company_staff",
    });
    expect(display.title).toBe("Approval removed");
    expect(display.body).toBe("Payment was not received");
    expect(display.detailLines[0]).toContain("£7.00");
    expect(display.detailLines[0]).toContain("£0.00");
  });

  it("formats driver submission with reference", () => {
    const display = formatHirePaymentRowEvent({
      ...base,
      eventKind: "status_change",
      fromStatus: "not_received",
      toStatus: "pending_approval",
      comment: "REF-123",
      amendmentPayload: { submittedAmountGbp: 600, paymentReference: "REF-123" },
      actorRole: "driver",
    });
    expect(display.title).toBe("Payment submitted");
    expect(display.actorLabel).toBe("Driver");
    expect(display.detailLines).toContain("Amount: £600.00");
    expect(display.detailLines).toContain("Reference: REF-123");
  });

  it("prefers resolved actor display name when provided", () => {
    const display = formatHirePaymentRowEvent({
      ...base,
      eventKind: "status_change",
      fromStatus: "pending_approval",
      toStatus: "approved",
      comment: null,
      amendmentPayload: { approvedAmountGbp: 100 },
      actorRole: "company_staff",
      actorDisplayName: "Riddhi Joshi",
    });
    expect(display.actorLabel).toBe("Riddhi Joshi · Company staff");
  });
});

describe("formatHirePaymentDiscountEvent", () => {
  it("shows amount, reason, and who applied it", () => {
    const display = formatHirePaymentDiscountEvent({
      id: "d1",
      amountGbp: 25,
      reason: "Loyalty credit",
      appliedAt: "2026-07-19T09:00:00Z",
      appliedByDisplayName: "Alex Ops",
    });
    expect(display.title).toBe("Discount applied");
    expect(display.body).toBe("Loyalty credit");
    expect(display.detailLines).toEqual(["Amount: −£25.00"]);
    expect(display.actorLabel).toBe("Alex Ops · Company staff");
  });
  it("formats discount amendment and cancellation audit events", () => {
    expect(
      formatHirePaymentRowEvent({
        id: "e-disc-amend",
        eventKind: "amendment",
        fromStatus: "not_received",
        toStatus: "not_received",
        comment: "Reduced promo",
        amendmentPayload: { discountChange: true, previousDiscountGbp: 10, newDiscountGbp: 5 },
        actorRole: "company_staff",
        createdAt: "2026-08-21T12:00:00Z",
        actorDisplayName: "Alex Ops",
      }).title,
    ).toBe("Discount amended");
    expect(
      formatHirePaymentRowEvent({
        id: "e-disc-cancel",
        eventKind: "amendment",
        fromStatus: "not_received",
        toStatus: "not_received",
        comment: "Promo withdrawn",
        amendmentPayload: { discountChange: true, previousDiscountGbp: 10, newDiscountGbp: 0 },
        actorRole: "company_staff",
        createdAt: "2026-08-21T12:05:00Z",
      }).title,
    ).toBe("Discount cancelled");
  });
});

describe("mergeHirePaymentRowHistory", () => {
  it("interleaves discounts with status events by time", () => {
    const items = mergeHirePaymentRowHistory({
      events: [
        {
          id: "e1",
          eventKind: "status_change",
          fromStatus: "not_received",
          toStatus: "pending_approval",
          comment: null,
          amendmentPayload: { submittedAmountGbp: 100 },
          actorRole: "driver",
          createdAt: "2026-07-20T12:00:00Z",
        },
      ],
      discounts: [
        {
          id: "d1",
          amountGbp: 10,
          reason: "Promo",
          appliedAt: "2026-07-20T10:00:00Z",
          appliedByDisplayName: "Alex Ops",
        },
      ],
    });
    expect(items.map((i) => i.title)).toEqual(["Discount applied", "Payment submitted"]);
  });
});
