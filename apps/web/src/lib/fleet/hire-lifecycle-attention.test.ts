import { describe, expect, it } from "vitest";
import {
  buildHireLifecycleAttentionItems,
  canStartCheckin,
  canStartCheckout,
  canTerminateHire,
  isCheckoutDue,
} from "@/lib/fleet/hire-lifecycle-attention";

describe("hire-lifecycle-attention", () => {
  it("flags reserved and active hires without checkout", () => {
    expect(isCheckoutDue({ status: "reserved", checkoutCompleted: false })).toBe(true);
    expect(isCheckoutDue({ status: "active", checkoutCompleted: false })).toBe(true);
    expect(isCheckoutDue({ status: "terminated", checkoutCompleted: false })).toBe(true);
    expect(isCheckoutDue({ status: "reserved", checkoutCompleted: true })).toBe(false);
    expect(
      canStartCheckout({ status: "reserved", checkoutCompleted: false }),
    ).toBe(true);
    expect(
      canStartCheckout({ status: "active", checkoutCompleted: false }),
    ).toBe(true);
    expect(
      canStartCheckout({ status: "active", checkoutCompleted: true }),
    ).toBe(false);
    expect(
      canStartCheckout({ status: "terminated", checkoutCompleted: false }),
    ).toBe(true);
  });

  it("allows termination only for active hires", () => {
    expect(canTerminateHire("active")).toBe(true);
    expect(canTerminateHire("reserved")).toBe(false);
    expect(canTerminateHire("terminated")).toBe(false);
  });

  it("allows check-in only after contract termination", () => {
    expect(
      canStartCheckin({
        status: "active",
        checkoutCompleted: true,
        checkinCompleted: false,
      }),
    ).toBe(false);
    expect(
      canStartCheckin({
        status: "terminated",
        checkoutCompleted: true,
        checkinCompleted: false,
      }),
    ).toBe(true);
    expect(
      canStartCheckin({
        status: "terminated",
        checkoutCompleted: false,
        checkinCompleted: false,
      }),
    ).toBe(false);
  });

  it("builds attention items for each lifecycle gap", () => {
    const checkout = buildHireLifecycleAttentionItems({
      hireGroupId: "g1",
      status: "reserved",
      checkoutCompleted: false,
      checkinCompleted: false,
    });
    expect(checkout.map((item) => item.kind)).toEqual(["awaiting_checkout"]);

    const active = buildHireLifecycleAttentionItems({
      hireGroupId: "g1",
      status: "active",
      checkoutCompleted: true,
      checkinCompleted: false,
    });
    expect(active.map((item) => item.kind)).toEqual(["awaiting_termination"]);

    const activeMissingCheckout = buildHireLifecycleAttentionItems({
      hireGroupId: "g1",
      status: "active",
      checkoutCompleted: false,
      checkinCompleted: false,
    });
    expect(activeMissingCheckout.map((item) => item.kind)).toEqual([
      "awaiting_checkout",
      "awaiting_termination",
    ]);

    const terminated = buildHireLifecycleAttentionItems({
      hireGroupId: "g1",
      status: "terminated",
      checkoutCompleted: true,
      checkinCompleted: false,
    });
    expect(terminated.map((item) => item.kind)).toEqual(["awaiting_checkin"]);

    const terminatedMissingCheckout = buildHireLifecycleAttentionItems({
      hireGroupId: "g1",
      status: "terminated",
      checkoutCompleted: false,
      checkinCompleted: false,
    });
    expect(terminatedMissingCheckout.map((item) => item.kind)).toEqual(["awaiting_checkout"]);
  });

  it("uses driver workspace paths when audience is driver", () => {
    const items = buildHireLifecycleAttentionItems({
      hireGroupId: "g1",
      status: "terminated",
      checkoutCompleted: true,
      checkinCompleted: false,
      audience: "driver",
    });
    expect(items[0]?.href).toBe("/driver/hires/g1/checkin");
  });
});
