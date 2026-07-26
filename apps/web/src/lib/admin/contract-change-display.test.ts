import { describe, expect, it } from "vitest";
import {
  buildContractChangeHistoryEvents,
  formatContractChangeReviewStatus,
  formatContractChangeTransitionType,
  superAdminEsignDesignerBack,
  superAdminEsignDesignerHref,
} from "@/lib/admin/contract-change-display";

describe("formatContractChangeReviewStatus", () => {
  it("maps known review statuses", () => {
    expect(formatContractChangeReviewStatus("pending_review")).toBe("Pending review");
    expect(formatContractChangeReviewStatus("awaiting_signature")).toBe("Awaiting signature");
  });
});

describe("formatContractChangeTransitionType", () => {
  it("labels transition types", () => {
    expect(formatContractChangeTransitionType("detail_change")).toBe("Legal detail change");
    expect(formatContractChangeTransitionType("new_legal_entity")).toBe("New legal entity");
  });
});

describe("buildContractChangeHistoryEvents", () => {
  it("includes rejection details", () => {
    const events = buildContractChangeHistoryEvents({
      id: "r1",
      created_at: "2026-07-01T10:00:00.000Z",
      status: "rejected",
      review_status: "rejected",
      reviewed_at: "2026-07-02T11:00:00.000Z",
      review_comment: "Company number incorrect",
      signed_at: null,
      transition_type: "detail_change",
    });

    expect(events.some((e) => e.label === "Rejected by platform" && e.detail === "Company number incorrect")).toBe(
      true,
    );
  });
});

describe("superAdminEsignDesignerHref", () => {
  it("adds return context for agreement change requests", () => {
    expect(superAdminEsignDesignerHref("env-1")).toBe("/super-admin/esign/env-1");
    expect(superAdminEsignDesignerHref("env-1", true)).toBe(
      "/super-admin/esign/env-1?from=agreement-changes",
    );
  });
});

describe("superAdminEsignDesignerBack", () => {
  it("returns agreement change requests when opened from that queue", () => {
    expect(superAdminEsignDesignerBack("agreement-changes")).toEqual({
      backHref: "/super-admin/contract-changes",
      backLabel: "Agreement change requests",
    });
    expect(superAdminEsignDesignerBack(undefined)).toEqual({
      backHref: "/super-admin/companies",
      backLabel: "Companies",
    });
  });
});
