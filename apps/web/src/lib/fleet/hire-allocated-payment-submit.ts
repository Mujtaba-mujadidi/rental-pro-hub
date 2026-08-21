import { recordHireDriverChargePaymentAction, submitDriverExtraChargePaymentAction } from "@/app/actions/hire-driver-charges";
import { submitDriverHirePaymentAction, submitStaffHirePaymentAction } from "@/app/actions/hire-payments";
import type { HirePaymentComposerSubmitInput } from "@/components/fleet/hire-payments/hire-payment-composer";
import { ukTodayYmd } from "@/lib/datetime/uk";
import type { HirePaymentApplyTo, HireSchedulePaymentTarget } from "@/lib/fleet/hire-active-balance-display";

export async function submitAllocatedHirePayment(input: {
  hireGroupId: string;
  asDriver: boolean;
  payment: HirePaymentComposerSubmitInput;
}): Promise<{ ok: boolean; error?: string }> {
  const allocationKind: HirePaymentApplyTo = input.payment.allocationKind;
  const scheduleTarget: HireSchedulePaymentTarget | undefined = input.payment.scheduleTarget;
  if (input.asDriver) {
    if (allocationKind === "extra_charges") {
      return submitDriverExtraChargePaymentAction({
        hireGroupId: input.hireGroupId,
        amountGbp: input.payment.amountGbp,
        paymentReference: input.payment.paymentReference,
      });
    }
    return submitDriverHirePaymentAction({
      hireGroupId: input.hireGroupId,
      amountGbp: input.payment.amountGbp,
      paymentReference: input.payment.paymentReference,
      scheduleTarget,
    });
  }

  const paidOnYmd = input.payment.paidOnYmd ?? ukTodayYmd();
  const paymentMethod = input.payment.paymentMethod ?? "bank_transfer";
  if (allocationKind === "extra_charges") {
    return recordHireDriverChargePaymentAction({
      hireGroupId: input.hireGroupId,
      amountGbp: input.payment.amountGbp,
      paymentReference: input.payment.paymentReference,
      paymentMethod,
      paymentAccountId: input.payment.paymentAccountId,
      paidOnYmd,
      notes: input.payment.notes,
    });
  }
  return submitStaffHirePaymentAction({
    hireGroupId: input.hireGroupId,
    amountGbp: input.payment.amountGbp,
    paymentReference: input.payment.paymentReference,
    paymentMethod,
    paymentAccountId: input.payment.paymentAccountId,
    paidOnYmd,
    notes: input.payment.notes,
    scheduleTarget,
  });
}
