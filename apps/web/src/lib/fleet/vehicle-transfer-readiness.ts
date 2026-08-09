import type { HireGroupStatus } from "@/lib/fleet/hire-types";
import { HIRE_VEHICLE_BLOCKING_STATUSES } from "@/lib/fleet/hire-types";

export type VehicleTransferHirePhase =
  | "none"
  | "needs_end_contract"
  | "needs_checkin"
  | "needs_settlement"
  | "ready";

export function vehicleTransferHirePhase(input: {
  hire: { id: string; status: HireGroupStatus } | null;
  checkinCompleted: boolean;
  settlementSettled: boolean;
}): VehicleTransferHirePhase {
  if (!input.hire) return "none";

  const status = input.hire.status;
  if (status === "terminated") {
    if (!input.checkinCompleted) return "needs_checkin";
    return input.settlementSettled ? "ready" : "needs_settlement";
  }

  if ((HIRE_VEHICLE_BLOCKING_STATUSES as readonly string[]).includes(status)) {
    return "needs_end_contract";
  }

  return "ready";
}

export function canExecuteVehicleSubcompanyTransfer(phase: VehicleTransferHirePhase): boolean {
  return phase === "none" || phase === "ready";
}

export function vehicleTransferBlockedMessage(phase: VehicleTransferHirePhase): string {
  switch (phase) {
    case "needs_end_contract":
      return "End the active hire contract before transferring this vehicle.";
    case "needs_checkin":
      return "Complete vehicle check-in on the current hire before transferring.";
    case "needs_settlement":
      return "Finish settlement on the ended hire before transferring.";
    default:
      return "This vehicle cannot be transferred yet.";
  }
}

export function bareVehicleTransferBlockedByHire(
  hire: { id: string; status: HireGroupStatus } | null,
): boolean {
  if (!hire) return false;
  return (HIRE_VEHICLE_BLOCKING_STATUSES as readonly string[]).includes(hire.status);
}
