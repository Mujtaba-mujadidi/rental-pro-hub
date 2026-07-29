import { describe, expect, it } from "vitest";
import {
  hireLedgerPaymentTypeLabel,
  summarizeHireSettlementLedger,
} from "@/lib/fleet/hire-payments-ledger";

describe("summarizeHireSettlementLedger", () => {
  it("totals settlement and driver charge payments separately", () => {
    const summary = summarizeHireSettlementLedger([
      { amountGbp: 70, direction: "paid_to_driver", paymentCategory: "settlement" },
      { amountGbp: 100, direction: "received_from_driver", paymentCategory: "driver_charge" },
      { amountGbp: 130, direction: "received_from_driver", paymentCategory: "settlement" },
    ]);
    expect(summary.settlementPaidGbp).toBe(70);
    expect(summary.driverChargeReceivedGbp).toBe(100);
    expect(summary.settlementReceivedGbp).toBe(130);
    expect(summary.netCashGbp).toBe(160);
  });
});

describe("hireLedgerPaymentTypeLabel", () => {
  it("labels driver charge receipts", () => {
    expect(
      hireLedgerPaymentTypeLabel({
        direction: "received_from_driver",
        paymentCategory: "driver_charge",
      }),
    ).toBe("Damage charge");
  });
});
