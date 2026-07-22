import type { ContractLengthKind, RentCadence } from "@/lib/fleet/hire-types";

export type HireWizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export type HireDraftSnapshot = {
  contractLengths?: { kind: ContractLengthKind; customEndDate?: string | null }[];
  termsAccepted?: boolean;
};

export type HireWizardFormState = {
  vehicleId: string;
  startDate: string;
  rentCadence: RentCadence;
  rentAmountGbp: string;
  includeDeposit: boolean;
  depositGbp: string;
  defaultPaymentAccountId: string;
  contractLengths: Record<ContractLengthKind, boolean>;
  customEndDate: string;
  hireTermsVersionId: string;
  driverLicenceNumber: string;
  driverEmail: string;
};

export function normalizeDrivingLicence(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export function canAdvanceFromStep(step: HireWizardStep, form: HireWizardFormState): string | null {
  if (step === 1) {
    if (!form.vehicleId.trim()) return "Select a vehicle.";
    return null;
  }
  if (step === 2) {
    if (!form.startDate.trim()) return "Start date is required.";
    const amount = Number.parseFloat(form.rentAmountGbp);
    if (!Number.isFinite(amount) || amount < 0) return "Enter a valid rent amount.";
    if (form.includeDeposit) {
      const deposit = Number.parseFloat(form.depositGbp);
      if (!Number.isFinite(deposit) || deposit < 0) return "Enter a valid deposit amount.";
    }
    const selected = (Object.keys(form.contractLengths) as ContractLengthKind[]).filter(
      (k) => form.contractLengths[k],
    );
    if (!selected.length) return "Select at least one contract length.";
    if (form.contractLengths.custom && !form.customEndDate.trim()) return "Custom end date is required.";
    return null;
  }
  if (step === 3) {
    if (!form.hireTermsVersionId.trim()) return "Select hire terms to include.";
    return null;
  }
  if (step === 4) {
    if (!normalizeDrivingLicence(form.driverLicenceNumber)) return "Driving licence number is required.";
    return null;
  }
  return null;
}

export function canAdvanceFromDriverAccessStep(driverAccessStatus: string): string | null {
  if (driverAccessStatus !== "approved") {
    return "Driver must approve profile access before you continue.";
  }
  return null;
}

/** After driver approves access, earlier wizard steps must not change without an explicit amend. */
export function driverAccessLocksContractTerms(driverAccessStatus: string): boolean {
  return driverAccessStatus === "approved";
}

/** Blocks the e-sign step until driver access is approved and profile confirmed on step 5. */
export function driverAccessBlocksFinalize(status: string, profileConfirmed: boolean): boolean {
  if (status === "approved" && profileConfirmed) return false;
  return true;
}

/** @deprecated Use driverAccessBlocksFinalize */
export function driverAccessBlocksStep5(status: string, profileConfirmed: boolean): boolean {
  return driverAccessBlocksFinalize(status, profileConfirmed);
}
