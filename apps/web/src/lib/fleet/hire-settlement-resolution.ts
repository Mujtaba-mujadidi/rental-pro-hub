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
  return "The hire record holds the open balance. Payments are logged on that hire and clear it when fully paid — the Balances page lists all hires with an outstanding amount.";
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
          ? "Driver has rent credit — deposit cannot be applied to a balance you owe them"
          : "No outstanding rent balance to apply the deposit to";
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
    paid_now: "Clearing now — record payment",
    open_balance: "Add to balance sheet (pay in phases)",
    written_off: "Write off as discount (no payment expected)",
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
