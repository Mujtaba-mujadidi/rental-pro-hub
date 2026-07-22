import { describe, expect, it } from "vitest";
import {
  canTransitionPaymentStatus,
  requiresAmendmentReason,
} from "@/lib/fleet/hire-payment-workflow";

describe("canTransitionPaymentStatus", () => {
  it("allows driver to mark pending", () => {
    expect(
      canTransitionPaymentStatus({
        from: "not_received",
        to: "pending_approval",
        actor: "driver",
      }),
    ).toBe(true);
  });

  it("requires comment on company reject", () => {
    expect(
      canTransitionPaymentStatus({
        from: "pending_approval",
        to: "rejected",
        actor: "company_staff",
        comment: "",
      }),
    ).toBe(false);
    expect(
      canTransitionPaymentStatus({
        from: "pending_approval",
        to: "rejected",
        actor: "company_staff",
        comment: "Wrong amount",
      }),
    ).toBe(true);
  });

  it("allows company approve", () => {
    expect(
      canTransitionPaymentStatus({
        from: "pending_approval",
        to: "approved",
        actor: "company_staff",
      }),
    ).toBe(true);
  });
});

describe("requiresAmendmentReason", () => {
  it("true for approved amendment", () => {
    expect(requiresAmendmentReason("approved", "approved")).toBe(true);
    expect(requiresAmendmentReason("pending_approval", "approved")).toBe(false);
  });
});
