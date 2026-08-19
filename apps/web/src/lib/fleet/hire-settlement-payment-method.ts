import { HIRE_DEPOSIT_REFUND_METHODS } from "@/lib/fleet/hire-termination-summary";

/** Settlement / refund payment method slugs stored on balance payments. */
export function settlementPaymentMethodRequiresAccount(method: string): boolean {
  return method.trim().toLowerCase() !== "cash";
}

export const HIRE_PAYMENT_METHOD_LABELS: Record<(typeof HIRE_DEPOSIT_REFUND_METHODS)[number], string> = {
  bank_transfer: "Bank transfer",
  cash: "Cash",
  card: "Card",
  cheque: "Cheque",
  other: "Other",
};

export function hirePaymentMethodLabel(method: string): string {
  const key = method.trim() as keyof typeof HIRE_PAYMENT_METHOD_LABELS;
  return HIRE_PAYMENT_METHOD_LABELS[key] ?? method;
}
