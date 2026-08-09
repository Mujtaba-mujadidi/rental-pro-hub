import type { HireDepositDisposition } from "@/lib/fleet/hire-termination-summary";
import type { HireSettlementResolution } from "@/lib/fleet/hire-settlement-resolution";

export const PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION: HireDepositDisposition = "hold_pending";

export const PROVISIONAL_TERMINATION_SETTLEMENT_RESOLUTION: HireSettlementResolution = "open_balance";

export function hireSettlementFinalizationBlockedMessage(audience: "staff" | "driver" = "staff"): string {
  if (audience === "driver") {
    return "Your rental company will confirm the final balance after vehicle check-in.";
  }
  return "Complete vehicle check-in before resolving the deposit or recording settlement payments.";
}

export function hireSettlementFinalizationRequiredMessage(audience: "staff" | "driver" = "staff"): string {
  if (audience === "driver") {
    return "Final balance is confirmed after vehicle check-in.";
  }
  return "Final settlement — including the deposit — is completed after vehicle check-in.";
}

export function assertHireSettlementFinalizationAllowed(
  checkinCompleted: boolean,
  audience: "staff" | "driver" = "staff",
): string | null {
  if (checkinCompleted) return null;
  return hireSettlementFinalizationBlockedMessage(audience);
}

export function assertProvisionalTerminationDeposit(
  disposition: HireDepositDisposition,
  depositPaidGbp: number,
): string | null {
  if (depositPaidGbp <= 0.005) return null;
  if (disposition === PROVISIONAL_TERMINATION_DEPOSIT_DISPOSITION) return null;
  return "Hold the deposit until vehicle check-in is complete. Resolve it on Payments after check-in.";
}

export function assertProvisionalTerminationSettlement(
  resolution: HireSettlementResolution | null,
  netSettlementGbp: number,
): string | null {
  if (Math.abs(netSettlementGbp) <= 0.005) return null;
  if (resolution === PROVISIONAL_TERMINATION_SETTLEMENT_RESOLUTION) return null;
  return "Track the rent balance for payment after check-in. Settlement payments and write-offs are available once check-in is complete.";
}

export function provisionalTerminationSettlementResolution(
  netSettlementGbp: number,
): HireSettlementResolution | null {
  if (Math.abs(netSettlementGbp) <= 0.005) return null;
  return PROVISIONAL_TERMINATION_SETTLEMENT_RESOLUTION;
}

export function canFinalizeHireSettlement(input: {
  contractEnded: boolean;
  checkinCompleted: boolean;
}): boolean {
  return input.contractEnded && input.checkinCompleted;
}
