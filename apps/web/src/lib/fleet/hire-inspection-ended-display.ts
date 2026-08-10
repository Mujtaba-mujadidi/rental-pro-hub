export type HireInspectionWorkspaceAudience = "staff" | "driver";

export function hireInspectionEndedComparisonCopy(audience: HireInspectionWorkspaceAudience) {
  if (audience === "driver") {
    return {
      mileageAlertTitle: "Mileage readings don't match",
      mileageAlertDetail:
        "Return mileage is lower than at handover. Your rental company may follow up if needed.",
      mileageActionLabel: "View check-in",
      tableIntro: "See what changed between handover and return.",
      checkoutCardDescription:
        "Condition recorded when your rental company handed over the vehicle.",
      checkinCardDescriptionNewDamage: "Additional damage was recorded when the vehicle was returned.",
      checkinCardDescription:
        "Condition recorded when your rental company completed return inspection.",
      openCheckout: "View checkout",
      openCheckin: "View check-in",
      checkinStatusReview: "Recorded",
      checkinStatusCompleted: "Completed",
    };
  }

  return {
    mileageAlertTitle: "Mileage difference requires review",
    mileageAlertDetail:
      "Return mileage is lower than checkout. Confirm the check-in reading before settlement.",
    mileageActionLabel: "Review reading",
    tableIntro:
      "Changes are highlighted automatically, so staff do not need to compare two pages manually.",
    checkoutCardDescription: "Condition recorded when the vehicle was handed over.",
    checkinCardDescriptionNewDamage: "Returned with additional damage items recorded.",
    checkinCardDescription: "Condition recorded when the vehicle was returned.",
    openCheckout: "Open checkout",
    openCheckin: "Open check-in",
    checkinStatusReview: "Needs review",
    checkinStatusCompleted: "Completed",
  };
}

export function hireInspectionEndedEmptyMessage(
  audience: HireInspectionWorkspaceAudience,
  kind: "checkout-pending" | "checkin-pending" | "checkin-blocked",
): string {
  if (kind === "checkout-pending") {
    return audience === "driver"
      ? "Vehicle checkout will appear here once your rental company completes handover inspection."
      : "Complete checkout to record the vehicle condition at handover.";
  }
  if (kind === "checkin-pending") {
    return audience === "driver"
      ? "Check-in will appear here once your rental company completes return inspection."
      : "Complete check-in to record the vehicle return.";
  }
  return audience === "driver"
    ? "Check-in will appear here after checkout is complete."
    : "Complete checkout before recording vehicle check-in.";
}
