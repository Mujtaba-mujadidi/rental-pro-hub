import { formatGbp } from "@/lib/fleet/maintenance";
import { formatUkDate } from "@/lib/datetime/uk";
import type { PlatformNotificationType } from "@/lib/platform-notifications";

export type PlatformNotificationPayload = Record<string, unknown>;

export type PlatformNotificationDisplay = {
  title: string;
  body: string;
  href: string | null;
  actionLabel: string | null;
};

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
        ? `Your ${formatGbp(amount)} payment for ${vrm} was approved.`
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
