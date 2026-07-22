import type { HireTableStatusTone } from "@/lib/fleet/hire-contract-table-display";

export type DriverHireSigningPhase =
  | "not_ready"
  | "awaiting_signature"
  | "partially_signed"
  | "fully_signed"
  | "expired";

export type DriverHireSigningSummary = {
  phase: DriverHireSigningPhase;
  label: string;
  agreementCount: number;
  signedCount: number;
  canOpenSigning: boolean;
};

export const DRIVER_HIRE_ACCESS_LABELS: Record<string, { label: string; tone: HireTableStatusTone }> = {
  pending: { label: "Pending your approval", tone: "pending" },
  approved: { label: "Access approved", tone: "success" },
  rejected: { label: "Access declined", tone: "error" },
  expired: { label: "Expired", tone: "neutral" },
};

export function driverHireAccessLabel(status: string): { label: string; tone: HireTableStatusTone } {
  return (
    DRIVER_HIRE_ACCESS_LABELS[status] ?? {
      label: status.replace(/_/g, " "),
      tone: "neutral",
    }
  );
}

export function deriveDriverHireSigningSummary(input: {
  accessRequestStatus: string;
  signingBundleSentAt: string | null;
  signingBundleExpiresAt: string | null;
  agreementCount: number;
  signedCount: number;
}): DriverHireSigningSummary {
  const base = {
    agreementCount: input.agreementCount,
    signedCount: input.signedCount,
    canOpenSigning: false,
  };

  if (input.accessRequestStatus !== "approved") {
    return {
      ...base,
      phase: "not_ready",
      label: input.accessRequestStatus === "pending" ? "Approve access first" : "—",
    };
  }

  if (!input.signingBundleSentAt) {
    return {
      ...base,
      phase: "not_ready",
      label: "Contract being prepared",
    };
  }

  if (input.agreementCount > 0 && input.signedCount >= input.agreementCount) {
    return {
      ...base,
      phase: "fully_signed",
      label: input.agreementCount > 1 ? `Fully signed (${input.agreementCount})` : "Fully signed",
    };
  }

  const expired =
    Boolean(input.signingBundleExpiresAt) &&
    new Date(input.signingBundleExpiresAt as string).getTime() < Date.now();

  if (expired) {
    return {
      ...base,
      phase: "expired",
      label: "Signing link expired",
    };
  }

  if (input.signedCount === 0) {
    const label =
      input.agreementCount > 1
        ? `Ready to sign (${input.agreementCount} agreements)`
        : "Ready to sign";
    return {
      ...base,
      phase: "awaiting_signature",
      label,
      canOpenSigning: true,
    };
  }

  return {
    ...base,
    phase: "partially_signed",
    label: `Continue signing (${input.signedCount}/${input.agreementCount})`,
    canOpenSigning: true,
  };
}
