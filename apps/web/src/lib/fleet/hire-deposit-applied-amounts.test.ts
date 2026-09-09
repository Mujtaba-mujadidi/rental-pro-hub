import { describe, expect, it } from "vitest";
import {
  resolveHireDepositAppliedAmounts,
  sumDepositAppliedToChargesFromPayments,
  sumDepositAppliedToRentFromStatusEvents,
} from "./hire-deposit-applied-amounts";

describe("hire-deposit-applied-amounts", () => {
  it("sums rent credits from status event payloads", () => {
    expect(
      sumDepositAppliedToRentFromStatusEvents([
        { amendmentPayload: { depositAppliedGbp: 250 } },
        { amendment_payload: { depositAppliedGbp: 150.5 } },
        { amendmentPayload: { submittedAmountGbp: 40 } },
      ]),
    ).toBe(400.5);
  });

  it("sums charge credits from deposit-apply payments only", () => {
    expect(
      sumDepositAppliedToChargesFromPayments([
        {
          amountGbp: 200,
          direction: "received_from_driver",
          paymentCategory: "driver_charge",
          notes: "Deposit applied to balance",
        },
        {
          amountGbp: 50,
          direction: "received_from_driver",
          paymentCategory: "driver_charge",
          notes: "Driver paid",
        },
        {
          amountGbp: 80,
          direction: "received_from_driver",
          paymentCategory: "settlement",
          notes: "Deposit applied to balance",
        },
      ]),
    ).toBe(200);
  });

  it("returns zero while deposit is still held pending", () => {
    expect(
      resolveHireDepositAppliedAmounts({
        disposition: "hold_pending",
        depositReceivedGbp: 600,
        appliedToRentFromEventsGbp: 400,
        appliedToChargesFromPaymentsGbp: 200,
      }),
    ).toEqual({
      appliedToRentGbp: 0,
      appliedToChargesGbp: 0,
      appliedTotalGbp: 0,
    });
  });

  it("caps applied totals at deposit received", () => {
    expect(
      resolveHireDepositAppliedAmounts({
        disposition: "apply_to_balance",
        depositReceivedGbp: 600,
        appliedToRentFromEventsGbp: 500,
        appliedToChargesFromPaymentsGbp: 250,
      }),
    ).toEqual({
      appliedToRentGbp: 500,
      appliedToChargesGbp: 100,
      appliedTotalGbp: 600,
    });
  });
});
