import { describe, expect, it } from "vitest";
import {
  HIRE_PAYMENT_TRANSACTION_SPECS,
  hirePaymentTransactionSpec,
} from "@/lib/fleet/hire-payment-transactions";

describe("hire-payment-transactions", () => {
  it("defines a spec for every transaction kind", () => {
    expect(HIRE_PAYMENT_TRANSACTION_SPECS.length).toBeGreaterThanOrEqual(9);
    for (const spec of HIRE_PAYMENT_TRANSACTION_SPECS) {
      expect(spec.effects.length).toBeGreaterThan(0);
      expect(hirePaymentTransactionSpec(spec.kind)?.kind).toBe(spec.kind);
    }
  });

  it("requires schedule updates on deposit resolution", () => {
    const spec = hirePaymentTransactionSpec("deposit_disposition_resolve");
    expect(spec?.effects.some((effect) => effect.table === "vehicle_hire_payment_schedule")).toBe(
      true,
    );
  });
});
