import {
  appendHirePendingReturnReviewNotes,
  hirePendingReturnReviewResolveGate,
  parseHirePendingReturnReviewAmountGbp,
  parseHirePendingReturnReviewDecision,
  parseHirePendingReturnReviewId,
  parseHirePendingReturnReviewNotes,
  stripHirePendingReturnReviewNotesFromDescription,
} from "@/lib/fleet/hire-pending-return-review-resolve";
import { describe, expect, it } from "vitest";

describe("hirePendingReturnReviewResolveGate", () => {
  it("blocks write when rentals write is denied", () => {
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: false,
        hireStatus: "terminated",
      }),
    ).toMatch(/permission/i);
  });

  it("blocks while End hire reviews are locked", () => {
    expect(
      hirePendingReturnReviewResolveGate({
        canWriteRentals: true,
        hireStatus: "terminated",
        reviewsLockedUntilEndHireFinalized: true,
      }),
    ).toMatch(/End hire/i);
  });
});

describe("parseHirePendingReturnReviewAmountGbp", () => {
  it("requires a positive amount for approve and allows null on waive", () => {
    expect(parseHirePendingReturnReviewAmountGbp("approve", null).ok).toBe(false);
    expect(parseHirePendingReturnReviewAmountGbp("waive", undefined)).toEqual({
      ok: true,
      amountGbp: null,
    });
    expect(parseHirePendingReturnReviewAmountGbp("approve", 40)).toEqual({
      ok: true,
      amountGbp: 40,
    });
    expect(parseHirePendingReturnReviewAmountGbp("waive", 25.5)).toEqual({
      ok: true,
      amountGbp: 25.5,
    });
  });
});

describe("parseHirePendingReturnReviewNotes", () => {
  it("requires notes when waiving", () => {
    expect(parseHirePendingReturnReviewNotes("waive", "  ").ok).toBe(false);
    expect(parseHirePendingReturnReviewNotes("waive", "Driver not at fault")).toEqual({
      ok: true,
      notes: "Driver not at fault",
    });
    expect(parseHirePendingReturnReviewNotes("approve", "")).toEqual({
      ok: true,
      notes: null,
    });
  });
});

describe("parseHirePendingReturnReviewId", () => {
  it("parses fuel, accessory, and damage ids", () => {
    expect(parseHirePendingReturnReviewId("fuel-review")).toEqual({ kind: "fuel" });
    expect(parseHirePendingReturnReviewId("accessory-hasSpareTyre")).toEqual({
      kind: "accessory",
      key: "hasSpareTyre",
    });
    expect(parseHirePendingReturnReviewDecision("approve")).toBe("approve");
    expect(parseHirePendingReturnReviewDecision("reject")).toBeNull();
  });
});

describe("appendHirePendingReturnReviewNotes", () => {
  it("appends notes to the charge description", () => {
    expect(appendHirePendingReturnReviewNotes("Fuel difference", "Agreed at desk")).toBe(
      "Fuel difference · Note: Agreed at desk",
    );
    expect(appendHirePendingReturnReviewNotes("Fuel difference", "  ")).toBe("Fuel difference");
  });
});

describe("stripHirePendingReturnReviewNotesFromDescription", () => {
  it("removes trailing review notes for compact table titles", () => {
    expect(
      stripHirePendingReturnReviewNotesFromDescription(
        "Fuel difference — checkout 74% / return 24% · Note: long-term client, we won't charge anything",
      ),
    ).toBe("Fuel difference — checkout 74% / return 24%");
    expect(
      stripHirePendingReturnReviewNotesFromDescription("Rear bumper · scratch · minor · Note: waived"),
    ).toBe("Rear bumper · scratch · minor");
    expect(stripHirePendingReturnReviewNotesFromDescription("Cleaning fee")).toBe("Cleaning fee");
  });
});
