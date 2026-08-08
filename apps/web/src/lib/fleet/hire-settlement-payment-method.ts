/** Settlement / refund payment method slugs stored on balance payments. */
export function settlementPaymentMethodRequiresAccount(method: string): boolean {
  return method.trim().toLowerCase() !== "cash";
}
