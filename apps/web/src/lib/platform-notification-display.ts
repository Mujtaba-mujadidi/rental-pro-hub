import { formatGbp } from "@/lib/fleet/maintenance";
import { rentalContractCopy } from "@/lib/rental-contract-copy";
import type { PlatformNotificationType } from "@/lib/platform-notifications";

export type PlatformNotificationPayload = Record<string, unknown>;

export type PlatformNotificationTone = "success" | "warn" | "info";

export type PlatformNotificationGroup = "payments" | "documents" | "compliance";

export type PlatformNotificationDisplay = {
  title: string;
  body: string;
  href: string | null;
  actionLabel: string | null;
};

const PLATFORM_AGREEMENT_HREF = "/rental/contract";

function rejectionComment(payload: PlatformNotificationPayload): string {
  return typeof payload.comment === "string" ? payload.comment.trim() : "";
}

export function formatPlatformNotification(
  type: string,
  payload: PlatformNotificationPayload,
): PlatformNotificationDisplay {
  if (type === "hire_payment_submitted") {
    const amount = Number(payload.amountGbp);
    const vrm = String(payload.vehicleVrm ?? "Vehicle");
    const driver = String(payload.driverLabel ?? "Driver");
    const href = typeof payload.href === "string" ? payload.href : null;
    return {
      title: "Payment submitted for approval",
      body: `${driver} reported ${Number.isFinite(amount) ? formatGbp(amount) : "a payment"} for ${vrm}.`,
      href,
      actionLabel: href ? "Review payment" : null,
    };
  }

  if (type === "hire_payment_approved") {
    const vrm = String(payload.vehicleVrm ?? "Vehicle");
    const amount = Number(payload.amountGbp);
    const href = typeof payload.href === "string" ? payload.href : null;
    return {
      title: "Payment approved",
      body: Number.isFinite(amount)
        ? `${formatGbp(amount)} was approved for the hire of ${vrm}.`
        : `A hire payment for ${vrm} was approved.`,
      href,
      actionLabel: href ? "View payments" : null,
    };
  }

  if (type === "hire_payment_rejected") {
    const vrm = String(payload.vehicleVrm ?? "Vehicle");
    const href = typeof payload.href === "string" ? payload.href : null;
    const reason = typeof payload.comment === "string" ? payload.comment.trim() : "";
    return {
      title: "Payment rejected",
      body: reason
        ? `Your payment for ${vrm} was rejected. ${reason}`
        : `Your payment for ${vrm} was rejected.`,
      href,
      actionLabel: href ? "View payments" : null,
    };
  }

  if (type === "hire_payment_amended") {
    const vrm = String(payload.vehicleVrm ?? "Vehicle");
    const amount = Number(payload.amountGbp);
    const previous = Number(payload.previousAmountGbp);
    const href = typeof payload.href === "string" ? payload.href : null;
    const reason = typeof payload.comment === "string" ? payload.comment.trim() : "";
    const amountLabel = Number.isFinite(amount) ? formatGbp(amount) : "an updated amount";
    const previousLabel = Number.isFinite(previous) ? formatGbp(previous) : null;
    return {
      title: "Payment amended",
      body: [
        previousLabel ? `Your approved payment for ${vrm} was changed from ${previousLabel} to ${amountLabel}.` : `Your approved payment for ${vrm} was amended to ${amountLabel}.`,
        reason,
      ]
        .filter(Boolean)
        .join(" "),
      href,
      actionLabel: href ? "View payments" : null,
    };
  }

  if (type === "payment_submitted") {
    return {
      title: "Platform invoice payment submitted",
      body: "A rental company submitted payment for a platform invoice.",
      href: "/rental/billing",
      actionLabel: "View billing",
    };
  }

  if (type === "payment_validated") {
    return {
      title: "Platform payment validated",
      body: "A platform invoice payment was validated.",
      href: "/rental/billing",
      actionLabel: "View billing",
    };
  }

  if (type === "contract_change_review") {
    const decision = String(payload.decision ?? "");
    const comment = rejectionComment(payload);
    if (decision === "rejected") {
      return {
        title: "Platform agreement change rejected",
        body: comment
          ? `Platform staff rejected your change request: ${comment}`
          : "Platform staff rejected your change request. Open your platform agreement to review and resubmit.",
        href: PLATFORM_AGREEMENT_HREF,
        actionLabel: `Open ${rentalContractCopy.platformAgreementNav.toLowerCase()}`,
      };
    }
    return {
      title: "Platform agreement change approved",
      body: "Your legal detail change was approved. Sign the updated platform agreement to complete the amendment.",
      href: PLATFORM_AGREEMENT_HREF,
      actionLabel: "Review and sign",
    };
  }

  if (type === "legal_change_applied") {
    return {
      title: "Platform agreement updated",
      body: "Your signed platform agreement has been updated with your approved legal details.",
      href: PLATFORM_AGREEMENT_HREF,
      actionLabel: `View ${rentalContractCopy.platformAgreementNav.toLowerCase()}`,
    };
  }

  if (type === "contract_signed") {
    return {
      title: "Platform agreement signed",
      body: "Your platform agreement is now active. You can continue using Rental Pro Hub.",
      href: PLATFORM_AGREEMENT_HREF,
      actionLabel: `View ${rentalContractCopy.platformAgreementNav.toLowerCase()}`,
    };
  }

  if (type === "contract_change_requested") {
    return {
      title: "Contract change submitted",
      body: "A rental company submitted a platform agreement change for review.",
      href: "/super-admin/contract-changes",
      actionLabel: "Review request",
    };
  }

  if (type === "vehicle_expiry_mot" || type === "vehicle_expiry_tax" || type === "vehicle_expiry_phv") {
    const vrm = String(payload.vehicleVrm ?? "Vehicle");
    const summary = typeof payload.summary === "string" ? payload.summary : null;
    const href = typeof payload.href === "string" ? payload.href : null;
    const tone = payload.tone === "expired" ? "expired" : "expiring";
    const label =
      type === "vehicle_expiry_mot" ? "MOT" : type === "vehicle_expiry_tax" ? "Tax" : "PHV/Taxi licence";
    return {
      title: tone === "expired" ? `${label} expired` : `${label} expiring soon`,
      body: summary ?? `${vrm} needs a compliance review.`,
      href,
      actionLabel: href ? "View vehicle" : null,
    };
  }

  if (type === "driver_licence_expiry") {
    const audience = payload.audience === "driver" ? "driver" : "staff";
    const licenceKind = payload.licenceKind === "phv" ? "PHV / taxi licence" : "Driving licence";
    const tone = payload.tone === "expired" ? "expired" : "expiring";
    const href = typeof payload.href === "string" ? payload.href : null;
    const daysUntil = Number(payload.daysUntil);
    const daysLabel =
      Number.isFinite(daysUntil) && daysUntil >= 0
        ? daysUntil === 0
          ? "today"
          : `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`
        : null;

    if (audience === "driver") {
      return {
        title: tone === "expired" ? `${licenceKind} expired` : `${licenceKind} expiring soon`,
        body:
          tone === "expired"
            ? `Your ${licenceKind.toLowerCase()} has expired — update your details and documents.`
            : daysLabel
              ? `Your ${licenceKind.toLowerCase()} expires ${daysLabel}.`
              : `Your ${licenceKind.toLowerCase()} is expiring soon.`,
        href,
        actionLabel: href ? "Update licence" : null,
      };
    }

    const driverLabel = String(payload.driverLabel ?? "Driver");
    return {
      title: tone === "expired" ? "Driver licence expired" : "Driver licence expiring soon",
      body:
        tone === "expired"
          ? `${driverLabel}'s ${licenceKind.toLowerCase()} has expired.`
          : daysLabel
            ? `${driverLabel}'s ${licenceKind.toLowerCase()} expires ${daysLabel}.`
            : `${driverLabel}'s ${licenceKind.toLowerCase()} is expiring soon.`,
      href,
      actionLabel: href ? "View driver" : null,
    };
  }

  if (type === "hire_insurance_expiry") {
    const vrm = String(payload.vehicleVrm ?? "Vehicle");
    const tone = payload.tone === "expired" ? "expired" : "expiring";
    const audience = payload.audience === "driver" ? "driver" : "staff";
    const href = typeof payload.href === "string" ? payload.href : null;
    const daysUntil = Number(payload.daysUntil);
    const daysLabel =
      Number.isFinite(daysUntil) && daysUntil >= 0
        ? daysUntil === 0
          ? "today"
          : `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`
        : null;
    const title = tone === "expired" ? "Hire insurance expired" : "Hire insurance expiring soon";
    const body =
      audience === "driver"
        ? tone === "expired"
          ? `Insurance for your hire of ${vrm} has expired.`
          : daysLabel
            ? `Insurance for your hire of ${vrm} expires ${daysLabel}.`
            : `Insurance for your hire of ${vrm} is expiring soon.`
        : tone === "expired"
          ? `Hire insurance for ${vrm} has expired.`
          : daysLabel
            ? `Hire insurance for ${vrm} expires ${daysLabel}.`
            : `Hire insurance for ${vrm} is expiring soon.`;
    return {
      title,
      body,
      href,
      actionLabel: href ? "Review insurance" : null,
    };
  }

  if (type === "hire_contract_expiry") {
    const vrm = String(payload.vehicleVrm ?? "Vehicle");
    const tone = payload.tone === "expired" ? "expired" : "expiring";
    const audience = payload.audience === "driver" ? "driver" : "staff";
    const href = typeof payload.href === "string" ? payload.href : null;
    const daysUntil = Number(payload.daysUntil);
    const daysLabel =
      Number.isFinite(daysUntil)
        ? daysUntil < 0
          ? `${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? "" : "s"} ago`
          : daysUntil === 0
            ? "today"
            : `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`
        : null;
    const title = tone === "expired" ? "Hire contract ended" : "Hire contract ending soon";
    const body =
      audience === "driver"
        ? tone === "expired"
          ? `The contract for your hire of ${vrm} ended${daysLabel ? ` ${daysLabel}` : ""}.`
          : daysLabel
            ? `The contract for your hire of ${vrm} ends ${daysLabel}.`
            : `The contract for your hire of ${vrm} is ending soon.`
        : tone === "expired"
          ? `The contract for ${vrm} ended${daysLabel ? ` ${daysLabel}` : ""} while the hire is still active.`
          : daysLabel
            ? `The contract for ${vrm} ends ${daysLabel}.`
            : `The contract for ${vrm} is ending soon.`;
    return {
      title,
      body,
      href,
      actionLabel: href ? "Review hire" : null,
    };
  }

  return {
    title: type.replace(/_/g, " "),
    body: typeof payload.summary === "string" ? payload.summary : "See details in the app.",
    href: typeof payload.href === "string" ? payload.href : null,
    actionLabel: null,
  };
}

export function isHireNotificationType(type: string): type is PlatformNotificationType {
  return type.startsWith("hire_");
}

export function platformNotificationGroups(type: string): PlatformNotificationGroup[] {
  if (
    type.startsWith("hire_payment_") ||
    type === "payment_submitted" ||
    type === "payment_validated"
  ) {
    return ["payments"];
  }
  if (
    type === "contract_signed" ||
    type === "contract_change_requested" ||
    type === "contract_change_review" ||
    type === "legal_change_applied"
  ) {
    return ["documents"];
  }
  if (
    type.includes("compliance") ||
    type.startsWith("vehicle_expiry") ||
    type.startsWith("document_expiry") ||
    type === "driver_licence_expiry" ||
    type === "hire_insurance_expiry" ||
    type === "hire_contract_expiry"
  ) {
    return ["compliance"];
  }
  return [];
}

export function platformNotificationTone(type: string): PlatformNotificationTone {
  if (
    type === "hire_payment_approved" ||
    type === "payment_validated" ||
    type === "contract_signed" ||
    type === "legal_change_applied"
  ) {
    return "success";
  }
  if (type === "hire_payment_rejected" || type === "hire_payment_amended" || type.includes("compliance")) {
    return "warn";
  }
  if (
    type === "vehicle_expiry_mot" ||
    type === "vehicle_expiry_tax" ||
    type === "vehicle_expiry_phv" ||
    type === "driver_licence_expiry" ||
    type === "hire_insurance_expiry" ||
    type === "hire_contract_expiry"
  ) {
    return "warn";
  }
  if (type === "contract_change_review") return "warn";
  return "info";
}
