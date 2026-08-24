import { describe, expect, it } from "vitest";
import {
  emptyHireEndHireDraft,
  canCancelHireEndHireProcess,
  canFinalizeHireEndHireProcess,
  isHireEndHireAutoCompletedBeforeFinalisation,
  isHireEndHireFinalized,
  isHireListActiveCloseout,
  hireEndHireReturnedAtIso,
  hireEndHireTabVisible,
  parseHireEndHireDraft,
} from "./hire-end-hire";
import { buildHireEndHireFinancialReview } from "./hire-end-hire-financial";

describe("hire-end-hire draft helpers", () => {
  it("parses a valid draft", () => {
    const draft = parseHireEndHireDraft({
      started: true,
      step: "financial_review",
      returnDateYmd: "2026-08-20",
      returnTimeHm: "23:52",
      reason: "early_return",
      notes: "Returned",
      updatedAt: "2026-08-20T23:52:00.000Z",
    });
    expect(draft?.step).toBe("financial_review");
    expect(draft?.reason).toBe("early_return");
    expect(draft?.finalizedAt).toBeNull();
  });

  it("allows cancel until finalised", () => {
    expect(
      canCancelHireEndHireProcess({
        status: "ending",
        draft: emptyHireEndHireDraft("t", "2026-08-20", "12:00"),
      }),
    ).toBe(true);
    expect(
      canCancelHireEndHireProcess({
        status: "terminated",
        draft: {
          ...emptyHireEndHireDraft("t", "2026-08-20", "12:00"),
          started: true,
          step: "final_account",
        },
      }),
    ).toBe(true);
    expect(
      canCancelHireEndHireProcess({
        status: "terminated",
        draft: {
          ...emptyHireEndHireDraft("t", "2026-08-20", "12:00"),
          started: true,
          step: "final_account",
          finalizedAt: "2026-08-21T10:00:00.000Z",
        },
      }),
    ).toBe(true);
    expect(
      canCancelHireEndHireProcess({
        status: "completed",
        draft: {
          ...emptyHireEndHireDraft("t", "2026-08-20", "12:00"),
          started: true,
          step: "final_account",
        },
      }),
    ).toBe(true);
    expect(
      canCancelHireEndHireProcess({
        status: "completed",
        draft: {
          ...emptyHireEndHireDraft("t", "2026-08-20", "12:00"),
          started: true,
          step: "final_account",
          finalizedAt: "2026-08-21T10:00:00.000Z",
        },
      }),
    ).toBe(true);
    expect(
      canCancelHireEndHireProcess({
        status: "completed",
        draft: {
          ...emptyHireEndHireDraft("t", "2026-08-20", "12:00"),
          started: true,
          step: "final_account",
          finalizedAt: "2026-08-21T10:00:00.000Z",
          explicitFinalization: true,
        },
      }),
    ).toBe(false);
  });

  it("detects check-in auto-complete before explicit finalise", () => {
    const draft = {
      ...emptyHireEndHireDraft("t", "2026-08-20", "12:00"),
      started: true,
      step: "final_account" as const,
    };
    expect(
      isHireEndHireAutoCompletedBeforeFinalisation({
        status: "completed",
        draft,
        checkinCompleted: true,
        terminatedAt: "2026-08-20T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(isHireEndHireFinalized({ status: "completed", draft })).toBe(false);
    expect(
      isHireEndHireAutoCompletedBeforeFinalisation({
        status: "completed",
        draft: null,
        checkinCompleted: true,
        terminatedAt: "2026-08-20T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isHireEndHireAutoCompletedBeforeFinalisation({
        status: "completed",
        draft: { ...draft, finalizedAt: "2026-08-21T10:00:00.000Z" },
        checkinCompleted: true,
        terminatedAt: "2026-08-20T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isHireEndHireFinalized({
        status: "completed",
        draft: { ...draft, finalizedAt: "2026-08-21T10:00:00.000Z" },
      }),
    ).toBe(false);
    expect(
      isHireEndHireFinalized({
        status: "completed",
        draft: { ...draft, finalizedAt: "2026-08-21T10:00:00.000Z", explicitFinalization: true },
      }),
    ).toBe(true);
  });

  it("allows finalise only on final account after check-in", () => {
    const baseDraft = {
      ...emptyHireEndHireDraft("t", "2026-08-20", "12:00"),
      started: true,
      step: "final_account" as const,
    };
    expect(
      canFinalizeHireEndHireProcess({
        status: "terminated",
        checkinCompleted: true,
        draft: baseDraft,
      }),
    ).toBe(true);
    expect(
      canFinalizeHireEndHireProcess({
        status: "terminated",
        checkinCompleted: false,
        draft: baseDraft,
      }),
    ).toBe(false);
    expect(
      canFinalizeHireEndHireProcess({
        status: "completed",
        checkinCompleted: true,
        draft: baseDraft,
      }),
    ).toBe(true);
    expect(
      canFinalizeHireEndHireProcess({
        status: "completed",
        checkinCompleted: true,
        draft: { ...baseDraft, finalizedAt: "2026-08-21T10:00:00.000Z", explicitFinalization: true },
      }),
    ).toBe(false);
  });

  it("builds returned-at ISO from date and time", () => {
    expect(hireEndHireReturnedAtIso("2026-08-20", "23:52")).toBe("2026-08-20T23:52:00.000Z");
    expect(hireEndHireReturnedAtIso("bad", "23:52")).toBeNull();
  });

  it("treats in-progress end hire as active on the hires list", () => {
    expect(
      isHireListActiveCloseout({
        status: "terminated",
        draft: { ...emptyHireEndHireDraft("t", "2026-08-20", "12:00"), started: true, step: "final_account" },
        terminatedAt: "2026-08-20T12:00:00.000Z",
        checkinCompleted: true,
      }),
    ).toBe(true);
    expect(
      isHireListActiveCloseout({
        status: "terminated",
        draft: {
          ...emptyHireEndHireDraft("t", "2026-08-20", "12:00"),
          started: true,
          step: "final_account",
          finalizedAt: "2026-08-21T10:00:00.000Z",
          explicitFinalization: true,
        },
        terminatedAt: "2026-08-20T12:00:00.000Z",
        checkinCompleted: true,
      }),
    ).toBe(false);
  });

  it("shows the End hire tab for active and terminated hires", () => {
    expect(
      hireEndHireTabVisible({
        status: "ending",
        canWrite: true,
        checkinCompleted: false,
        hasOpenSettlement: false,
      }),
    ).toBe(true);
    expect(
      hireEndHireTabVisible({
        status: "terminated",
        canWrite: true,
        checkinCompleted: false,
        hasOpenSettlement: true,
      }),
    ).toBe(true);
    expect(
      hireEndHireTabVisible({
        status: "completed",
        canWrite: true,
        checkinCompleted: true,
        hasOpenSettlement: false,
      }),
    ).toBe(false);
  });

  it("creates an empty draft", () => {
    const draft = emptyHireEndHireDraft("2026-08-20T12:00:00.000Z", "2026-08-20", "12:00");
    expect(draft.started).toBe(false);
    expect(draft.step).toBe("return_details");
  });
});

describe("buildHireEndHireFinancialReview", () => {
  it("includes extras and ignores voided charges", () => {
    const review = buildHireEndHireFinancialReview({
      returnDateYmd: "2026-08-20",
      returnTimeHm: "23:52",
      rentChargedGbp: 400,
      rentReceivedGbp: 0,
      depositRequiredGbp: 400,
      depositReceivedGbp: 0,
      extraCharges: [
        {
          id: "a",
          chargeType: "administration",
          chargeTypeLabel: "Administration",
          description: "Missed appointment",
          amountGbp: 50,
          resolution: "add_to_balance",
        },
        {
          id: "b",
          chargeType: "damage",
          amountGbp: 100,
          description: null,
          resolution: "voided",
        },
      ],
    });
    expect(review.owedBeforeCheckinGbp).toBe(450);
    expect(review.positionDirection).toBe("driver_owes_company");
    expect(review.extraChargesPostedGbp).toBe(50);
    expect(review.extraChargesOutstandingGbp).toBe(50);
    expect(review.extraChargesReceivedGbp).toBe(0);
    expect(review.accountSections.find((s) => s.id === "extra_charges")?.lines).toEqual([
      { id: "extra_total", label: "Total extra charges", amountGbp: 50, signed: true },
      { id: "extra_payments", label: "Approved extra-charge payments", amountGbp: 0, signed: false },
    ]);
    expect(review.lines.some((line) => line.id.startsWith("extra:"))).toBe(false);
    expect(review.categories.map((c) => c.id)).toEqual(["rent", "extra_charges", "deposit"]);
    expect(review.depositUnpaid).toBe(true);
  });

  it("nets approved extra-charge payments into the owed balance", () => {
    const review = buildHireEndHireFinancialReview({
      returnDateYmd: "2026-08-20",
      returnTimeHm: "12:00",
      rentChargedGbp: 460,
      rentReceivedGbp: 0,
      depositRequiredGbp: 0,
      depositReceivedGbp: 0,
      extraCharges: [
        {
          id: "a",
          chargeType: "administration",
          chargeTypeLabel: "Administration",
          description: null,
          amountGbp: 100,
          resolution: "add_to_balance",
        },
      ],
      // Same figure Payments uses after approved receipts against extras.
      extraChargesOutstandingGbp: 40,
    });
    expect(review.extraChargesPostedGbp).toBe(100);
    expect(review.extraChargesReceivedGbp).toBe(60);
    expect(review.extraChargesOutstandingGbp).toBe(40);
    expect(review.owedBeforeCheckinGbp).toBe(500);
    expect(review.categories.find((c) => c.id === "extra_charges")).toMatchObject({
      chargedGbp: 100,
      receivedGbp: 60,
      balanceGbp: 40,
    });
    expect(review.accountSections.find((s) => s.id === "extra_charges")?.lines).toEqual([
      { id: "extra_total", label: "Total extra charges", amountGbp: 100, signed: true },
      {
        id: "extra_payments",
        label: "Approved extra-charge payments",
        amountGbp: 60,
        signed: false,
      },
    ]);
  });

  it("treats fully paid extras as zero outstanding", () => {
    const review = buildHireEndHireFinancialReview({
      returnDateYmd: "2026-08-20",
      returnTimeHm: "12:00",
      rentChargedGbp: 460,
      rentReceivedGbp: 0,
      depositRequiredGbp: 0,
      depositReceivedGbp: 0,
      extraCharges: [
        {
          id: "a",
          chargeType: "damage",
          chargeTypeLabel: "Damage",
          description: "Bumper",
          amountGbp: 100,
          resolution: "add_to_balance",
        },
      ],
      extraChargesOutstandingGbp: 0,
    });
    expect(review.owedBeforeCheckinGbp).toBe(460);
    expect(review.extraChargesReceivedGbp).toBe(100);
    expect(review.extraChargesHint).toBe("Fully paid");
    expect(review.positionLabel).toContain("Driver owes");
  });

  it("reports company owes when approved rent overpays charged rent", () => {
    const review = buildHireEndHireFinancialReview({
      returnDateYmd: "2026-08-20",
      returnTimeHm: "12:00",
      rentChargedGbp: 100,
      rentReceivedGbp: 150,
      depositRequiredGbp: 0,
      depositReceivedGbp: 0,
      extraCharges: [],
      extraChargesOutstandingGbp: 0,
    });
    expect(review.positionDirection).toBe("company_owes_driver");
    expect(review.owedBeforeCheckinGbp).toBe(50);
    expect(review.positionLabel).toContain("Company owes");
  });

  it("shows pending approval totals without reducing the owed balance", () => {
    const review = buildHireEndHireFinancialReview({
      returnDateYmd: "2026-08-20",
      returnTimeHm: "12:00",
      rentChargedGbp: 460,
      rentReceivedGbp: 0,
      depositRequiredGbp: 0,
      depositReceivedGbp: 0,
      extraCharges: [
        {
          id: "a",
          chargeType: "administration",
          chargeTypeLabel: "Administration",
          description: null,
          amountGbp: 100,
          resolution: "add_to_balance",
        },
      ],
      extraChargesOutstandingGbp: 100,
      pendingRentGbp: 200,
      pendingExtraChargesGbp: 40,
    });
    expect(review.owedBeforeCheckinGbp).toBe(560);
    expect(review.pendingApprovalTotalGbp).toBe(240);
    expect(review.categories.find((c) => c.id === "rent")?.pendingApprovalGbp).toBe(200);
    expect(review.categories.find((c) => c.id === "extra_charges")?.pendingApprovalGbp).toBe(40);
    expect(review.accountSections.find((s) => s.id === "rent")?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "rent_pending",
          amountGbp: 200,
          pendingApproval: true,
        }),
      ]),
    );
    expect(review.pendingApprovalItems).toEqual([]);
  });

  it("lists individual pending approval items with submitted amounts", () => {
    const review = buildHireEndHireFinancialReview({
      returnDateYmd: "2026-08-20",
      returnTimeHm: "12:00",
      rentChargedGbp: 460,
      rentReceivedGbp: 0,
      depositRequiredGbp: 1200,
      depositReceivedGbp: 0,
      extraCharges: [],
      pendingApprovalItems: [
        {
          id: "dep-1",
          kind: "deposit",
          label: "Deposit",
          submittedGbp: 100,
          scheduleRowId: "dep-1",
        },
      ],
    });
    expect(review.pendingDepositGbp).toBe(100);
    expect(review.pendingApprovalTotalGbp).toBe(100);
    expect(review.accountSections.find((s) => s.id === "deposit")?.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Deposit: £100.00 submitted for approval",
          amountGbp: 100,
          pendingApproval: true,
        }),
      ]),
    );
  });
});
