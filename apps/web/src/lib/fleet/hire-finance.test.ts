import { describe, expect, it } from "vitest";
import {
  computeHireExtraChargeLineMoney,
  deriveExtraChargeCollectionStatus,
} from "@/lib/fleet/hire-finance";
import type { HireDriverChargeLineItemRow } from "@/lib/fleet/hire-driver-charges";

function charge(
  overrides: Partial<HireDriverChargeLineItemRow> &
    Pick<HireDriverChargeLineItemRow, "id" | "amountGbp" | "resolution">,
): HireDriverChargeLineItemRow {
  return {
    hireGroupId: "g1",
    chargeType: "administration",
    sourceKind: "staff_manual",
    chargedOn: "2026-08-23",
    createdAt: "2026-08-23T10:00:00.000Z",
    ...overrides,
  };
}

describe("deriveExtraChargeCollectionStatus", () => {
  it("marks paid_now and fully covered lines as paid", () => {
    expect(deriveExtraChargeCollectionStatus({ resolution: "paid_now", dueGbp: 20, paidGbp: 0 })).toBe(
      "paid",
    );
    expect(
      deriveExtraChargeCollectionStatus({ resolution: "add_to_balance", dueGbp: 20, paidGbp: 20 }),
    ).toBe("paid");
  });

  it("marks partial and unpaid add_to_balance correctly", () => {
    expect(
      deriveExtraChargeCollectionStatus({ resolution: "add_to_balance", dueGbp: 20, paidGbp: 10 }),
    ).toBe("partially_paid");
    expect(
      deriveExtraChargeCollectionStatus({ resolution: "add_to_balance", dueGbp: 20, paidGbp: 0 }),
    ).toBe("due");
  });

  it("marks voided and waived", () => {
    expect(deriveExtraChargeCollectionStatus({ resolution: "voided", dueGbp: 20, paidGbp: 5 })).toBe(
      "voided",
    );
    expect(deriveExtraChargeCollectionStatus({ resolution: "waived", dueGbp: 20, paidGbp: 0 })).toBe(
      "waived",
    );
  });
});

describe("computeHireExtraChargeLineMoney", () => {
  it("allocates timed payments onto add_to_balance lines", () => {
    const result = computeHireExtraChargeLineMoney({
      charges: [
        charge({
          id: "c1",
          amountGbp: 20,
          resolution: "add_to_balance",
          chargedOn: "2026-08-23",
          createdAt: "2026-08-23T12:00:00.000Z",
        }),
        charge({
          id: "c2",
          amountGbp: 100,
          resolution: "add_to_balance",
          chargedOn: "2026-08-23",
          createdAt: "2026-08-23T19:00:00.000Z",
        }),
      ],
      timedPayments: [{ id: "p1", amountGbp: 10, paidAt: "2026-08-23T19:30:00.000Z" }],
    });
    expect(result.outstandingGbp).toBe(110);
    expect(result.paidGbp).toBe(10);
    expect(result.lines.find((line) => line.chargeLineItemId === "c1")?.collectionStatus).toBe(
      "partially_paid",
    );
  });
});
