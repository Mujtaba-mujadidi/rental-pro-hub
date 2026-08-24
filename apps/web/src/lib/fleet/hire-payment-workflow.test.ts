import { describe, expect, it } from "vitest";
import {
  canStaffRecordPaymentAllocation,
  canTransitionPaymentStatus,
  driverCanSubmitPayment,
  nextStatusAfterApprovedAmountAmendment,
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

  it("allows staff to record payment on unpaid or partially approved rows", () => {
    expect(
      canStaffRecordPaymentAllocation({
        workflowStatus: "not_received",
        rowBalanceGbp: 1200,
      }),
    ).toBe(true);
    expect(
      canStaffRecordPaymentAllocation({
        workflowStatus: "rejected",
        rowBalanceGbp: 600,
      }),
    ).toBe(true);
    // C02 — remaining deposit after partial approval
    expect(
      canStaffRecordPaymentAllocation({
        workflowStatus: "approved",
        rowBalanceGbp: 600,
      }),
    ).toBe(true);
    expect(
      canStaffRecordPaymentAllocation({
        workflowStatus: "approved",
        rowBalanceGbp: 0,
      }),
    ).toBe(false);
    expect(
      canStaffRecordPaymentAllocation({
        workflowStatus: "pending_approval",
        rowBalanceGbp: 600,
      }),
    ).toBe(false);
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

  it("allows company to remove approval by amending to unpaid", () => {
    expect(
      canTransitionPaymentStatus({
        from: "approved",
        to: "not_received",
        actor: "company_staff",
        comment: "",
      }),
    ).toBe(false);
    expect(
      canTransitionPaymentStatus({
        from: "approved",
        to: "not_received",
        actor: "company_staff",
        comment: "Payment was not received",
      }),
    ).toBe(true);
  });
});

describe("requiresAmendmentReason", () => {
  it("true for approved amendment", () => {
    expect(requiresAmendmentReason("approved", "approved")).toBe(true);
    expect(requiresAmendmentReason("approved", "not_received")).toBe(true);
    expect(requiresAmendmentReason("pending_approval", "approved")).toBe(false);
  });
});

describe("nextStatusAfterApprovedAmountAmendment", () => {
  it("keeps approved when a positive amount remains", () => {
    expect(nextStatusAfterApprovedAmountAmendment(7)).toBe("approved");
    expect(nextStatusAfterApprovedAmountAmendment(0.01)).toBe("approved");
  });

  it("returns not_received when the approved amount is cleared", () => {
    expect(nextStatusAfterApprovedAmountAmendment(0)).toBe("not_received");
    expect(nextStatusAfterApprovedAmountAmendment(0.004)).toBe("not_received");
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

  it("ignores rejected workflow on periods that have not started yet", () => {
    const context = { periodStartYmd: "2026-08-27", todayYmd: "2026-07-27" };
    expect(resolveHirePaymentWorkflowStatus("pending_approval", "rejected", context)).toBe(
      "not_received",
    );
    expect(resolveHirePaymentWorkflowStatus("rejected", null, context)).toBe("not_received");
    expect(resolveHirePaymentWorkflowStatus("rejected", "rejected", context)).toBe("not_received");
    expect(resolveHirePaymentWorkflowStatus("rejected", null, {
      periodStartYmd: "2026-07-27",
      todayYmd: "2026-07-27",
    })).toBe("rejected");
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
