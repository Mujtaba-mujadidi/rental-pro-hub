import type { HireDepositDisposition } from "@/lib/fleet/hire-termination-summary";
import {
  HIRE_DEPOSIT_DISPOSITIONS,
  hireDepositDispositionLabel,
  resolveSettlementBalanceDirection,
  type SettlementBalanceDirection,
} from "@/lib/fleet/hire-termination-summary";

export const HIRE_SETTLEMENT_RESOLUTIONS = ["paid_now", "open_balance", "written_off"] as const;

export type HireSettlementResolution = (typeof HIRE_SETTLEMENT_RESOLUTIONS)[number];

export type HireBalancePaymentDirection = "received_from_driver" | "paid_to_driver";

export type DepositDispositionOption = {
  value: HireDepositDisposition;
  label: string;
  allowed: boolean;
  disabledReason?: string;
};

export type TerminationBalanceState = {
  settlementBalanceGbp: number;
  settlementBalanceDirection: SettlementBalanceDirection;
  settlementDiscountGbp: number | null;
  recordPayment: { amountGbp: number; direction: HireBalancePaymentDirection } | null;
};

/** Hire group settlement fields are the single source of truth; balance_payments is the ledger. */
export function hireSettlementLedgerHelpText(): string {
  return "This hire shows how much is still owed. Each payment you record reduces that amount. The Balances page lists all hires with money still to pay or refund.";
}

export function settlementStepRequired(netSettlementGbp: number): boolean {
  return Math.abs(netSettlementGbp) > 0.005;
}

export function getDepositDispositionOptions(signedRentBalanceGbp: number): DepositDispositionOption[] {
  const driverOwesRent = signedRentBalanceGbp > 0.005;
  const companyOwesRent = signedRentBalanceGbp < -0.005;

  return HIRE_DEPOSIT_DISPOSITIONS.map((value) => {
    let allowed = true;
    let disabledReason: string | undefined;

    if (value === "apply_to_balance") {
      allowed = driverOwesRent;
      if (!allowed) {
        disabledReason = companyOwesRent
          ? "Driver paid too much rent — you owe them, so the deposit cannot pay rent"
          : "No rent is owed — deposit cannot be used to pay rent";
      }
    }

    return {
      value,
      label: hireDepositDispositionLabel(value),
      allowed,
      disabledReason,
    };
  });
}

export function isDepositDispositionAllowed(
  disposition: HireDepositDisposition,
  signedRentBalanceGbp: number,
): boolean {
  return getDepositDispositionOptions(signedRentBalanceGbp).find((option) => option.value === disposition)
    ?.allowed ?? false;
}

export function defaultDepositDisposition(signedRentBalanceGbp: number): HireDepositDisposition {
  if (signedRentBalanceGbp > 0.005) return "apply_to_balance";
  return "refund_full";
}

export function availableSettlementResolutions(
  netSettlementGbp: number,
): HireSettlementResolution[] {
  if (netSettlementGbp > 0.005) {
    return ["paid_now", "open_balance", "written_off"];
  }
  if (netSettlementGbp < -0.005) {
    return ["paid_now", "open_balance"];
  }
  return [];
}

export function settlementResolutionLabel(resolution: HireSettlementResolution): string {
  const labels: Record<HireSettlementResolution, string> = {
    paid_now: "Pay now — record payment",
    open_balance: "Pay later — track on balance sheet",
    written_off: "Write off — no payment needed",
  };
  return labels[resolution];
}

export function resolveTerminationBalanceState(input: {
  netSettlementGbp: number;
  resolution: HireSettlementResolution;
}): TerminationBalanceState {
  const net = Math.round(input.netSettlementGbp * 100) / 100;
  const direction = resolveSettlementBalanceDirection(net);
  const amount = Math.abs(net);

  if (direction === "settled") {
    return {
      settlementBalanceGbp: 0,
      settlementBalanceDirection: "settled",
      settlementDiscountGbp: null,
      recordPayment: null,
    };
  }

  if (input.resolution === "written_off") {
    if (direction !== "driver_owes_company") {
      throw new Error("Only amounts owed by the driver can be written off as a discount.");
    }
    return {
      settlementBalanceGbp: 0,
      settlementBalanceDirection: "settled",
      settlementDiscountGbp: amount,
      recordPayment: null,
    };
  }

  if (input.resolution === "paid_now") {
    return {
      settlementBalanceGbp: 0,
      settlementBalanceDirection: "settled",
      settlementDiscountGbp: null,
      recordPayment: {
        amountGbp: amount,
        direction: direction === "driver_owes_company" ? "received_from_driver" : "paid_to_driver",
      },
    };
  }

  return {
    settlementBalanceGbp: amount,
    settlementBalanceDirection: direction,
    settlementDiscountGbp: null,
    recordPayment: null,
  };
}
