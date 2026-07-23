import { describe, expect, it } from "vitest";
import {
  canTransitionPaymentStatus,
  driverCanSubmitPayment,
  requiresAmendmentReason,
  resolveHirePaymentWorkflowStatus,
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

  it("allows driver to resubmit after rejection", () => {
    expect(
      canTransitionPaymentStatus({
        from: "rejected",
        to: "pending_approval",
        actor: "driver",
      }),
    ).toBe(true);
  });

  it("allows driver to submit top-up on partially approved row", () => {
    expect(
      canTransitionPaymentStatus({
        from: "approved",
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

  it("requires comment on company amend of approved row", () => {
    expect(
      canTransitionPaymentStatus({
        from: "approved",
        to: "approved",
        actor: "company_staff",
        comment: "",
      }),
    ).toBe(false);
    expect(
      canTransitionPaymentStatus({
        from: "approved",
        to: "approved",
        actor: "company_staff",
        comment: "Bank fee correction",
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

describe("resolveHirePaymentWorkflowStatus", () => {
  it("keeps approved rows locked", () => {
    expect(resolveHirePaymentWorkflowStatus("approved", "rejected")).toBe("approved");
    expect(resolveHirePaymentWorkflowStatus("approved", "pending_approval")).toBe("approved");
  });

  it("treats stale pending DB as rejected when latest event rejected", () => {
    expect(resolveHirePaymentWorkflowStatus("pending_approval", "rejected")).toBe("rejected");
  });

  it("treats stale rejected DB as pending when latest event pending", () => {
    expect(resolveHirePaymentWorkflowStatus("rejected", "pending_approval")).toBe("pending_approval");
  });

  it("falls back to stored status when no event", () => {
    expect(resolveHirePaymentWorkflowStatus("rejected", null)).toBe("rejected");
    expect(resolveHirePaymentWorkflowStatus("not_received", null)).toBe("not_received");
  });
});

describe("driverCanSubmitPayment", () => {
  it("allows not_received, rejected, and approved top-ups", () => {
    expect(driverCanSubmitPayment("not_received")).toBe(true);
    expect(driverCanSubmitPayment("rejected")).toBe(true);
    expect(driverCanSubmitPayment("approved")).toBe(true);
    expect(driverCanSubmitPayment("pending_approval")).toBe(false);
  });
});
