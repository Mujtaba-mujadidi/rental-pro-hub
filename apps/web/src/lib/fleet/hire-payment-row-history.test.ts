import { describe, expect, it } from "vitest";
import { formatHirePaymentRowEvent } from "@/lib/fleet/hire-payment-row-history";

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
    expect(display.actorLabel).toBe("Staff");
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
});
