"use client";

import { useMemo } from "react";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { HirePaymentComposer } from "@/components/fleet/hire-payments/hire-payment-composer";
import type { HirePaymentApplyTo } from "@/lib/fleet/hire-active-balance-display";
import { submitAllocatedHirePayment } from "@/lib/fleet/hire-allocated-payment-submit";
import { computeHireExtraChargePaymentTableRowsFromWorkspace } from "@/lib/fleet/hire-finance";

export function HireAllocatedPaymentComposer({
  hireGroupId,
  payments,
  asDriver = false,
  preferredAllocationKind,
  submitLabel,
  triggerLabel,
  triggerClassName,
  onAllocationChange,
  onSuccess,
  busy,
}: {
  hireGroupId: string;
  payments: HirePaymentsPageData;
  asDriver?: boolean;
  preferredAllocationKind?: HirePaymentApplyTo;
  submitLabel: string;
  triggerLabel: string;
  triggerClassName?: string;
  onAllocationChange?: (rowIds: string[]) => void;
  onSuccess: () => void;
  busy?: boolean;
}) {
  const extraChargeRows = useMemo(
    () =>
      computeHireExtraChargePaymentTableRowsFromWorkspace({
        hireGroupId,
        items: payments.driverChargeLineItems,
        outstandingGbp: payments.extraChargesOutstandingGbp,
        pendingAmountGbp: payments.extraChargePendingPayment?.amountGbp,
        allowMutate: payments.canMutateExtraCharges,
      }),
    [
      hireGroupId,
      payments.canMutateExtraCharges,
      payments.driverChargeLineItems,
      payments.extraChargePendingPayment?.amountGbp,
      payments.extraChargesOutstandingGbp,
    ],
  );

  return (
    <HirePaymentComposer
      hireGroupId={hireGroupId}
      scheduleRows={payments.rows}
      scheduleBalanceGbp={payments.summary.scheduleBalanceGbp}
      paymentAccount={payments.paymentAccount}
      staffPaymentAccounts={asDriver ? undefined : payments.settlementPaymentAccounts}
      defaultStaffPaymentAccountId={asDriver ? undefined : payments.defaultSettlementPaymentAccountId}
      canSubmit
      asDriver={asDriver}
      allowAllocationChoice
      preferredAllocationKind={preferredAllocationKind}
      extraChargeRows={extraChargeRows}
      outstandingExtraChargesGbp={payments.extraChargesOutstandingGbp}
      extraChargesSelectable={!payments.extraChargePendingPayment && payments.extraChargesOutstandingGbp > 0.005}
      submitLabel={submitLabel}
      triggerLabel={triggerLabel}
      triggerClassName={triggerClassName}
      onAllocationChange={onAllocationChange}
      onSuccess={onSuccess}
      busy={busy}
      onSubmit={(input) =>
        submitAllocatedHirePayment({
          hireGroupId,
          asDriver,
          payment: input,
        })
      }
    />
  );
}
