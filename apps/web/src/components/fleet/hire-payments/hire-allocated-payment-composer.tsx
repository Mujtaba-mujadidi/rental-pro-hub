"use client";

import { useMemo } from "react";
import type { HirePaymentsPageData } from "@/app/actions/hire-payments";
import { HirePaymentComposer } from "@/components/fleet/hire-payments/hire-payment-composer";
import type { HirePaymentApplyTo } from "@/lib/fleet/hire-active-balance-display";
import { submitAllocatedHirePayment } from "@/lib/fleet/hire-allocated-payment-submit";
import { endedHireExtrasSettlementCapGbp } from "@/lib/fleet/hire-driver-charge-payment";
import { computeHireExtraChargePaymentTableRowsFromWorkspace } from "@/lib/fleet/hire-finance";

export function HireAllocatedPaymentComposer({
  hireGroupId,
  payments,
  asDriver = false,
  preferredAllocationKind,
  submitLabel,
  triggerLabel,
  triggerClassName,
  hideTrigger = false,
  open,
  onOpenChange,
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
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAllocationChange?: (rowIds: string[]) => void;
  onSuccess: () => void;
  busy?: boolean;
}) {
  const settlementOpenBalanceCapGbp = endedHireExtrasSettlementCapGbp({
    contractEnded: Boolean(payments.contractEndedYmd),
    settlementDirection: payments.settlementBalance?.settlementDirection,
    openBalanceGbp: payments.settlementBalance?.openBalanceGbp,
  });

  const extraChargeRows = useMemo(
    () =>
      computeHireExtraChargePaymentTableRowsFromWorkspace({
        hireGroupId,
        items: payments.driverChargeLineItems,
        outstandingGbp: payments.extraChargesOutstandingGbp,
        pendingAmountGbp: payments.extraChargePendingPayment?.amountGbp,
        allowMutate: payments.canMutateExtraCharges,
        timedPayments: payments.extraChargeTimedPayments,
        allocationEvents: payments.extraChargeAllocationEvents,
        settleOrphanReceipts: Boolean(payments.contractEndedYmd),
        settlementOpenBalanceCapGbp,
      }),
    [
      hireGroupId,
      payments.canMutateExtraCharges,
      payments.contractEndedYmd,
      payments.driverChargeLineItems,
      payments.extraChargeAllocationEvents,
      payments.extraChargePendingPayment?.amountGbp,
      payments.extraChargeTimedPayments,
      payments.extraChargesOutstandingGbp,
      settlementOpenBalanceCapGbp,
    ],
  );

  const extrasOutstandingGbp = useMemo(() => {
    const fromRows = Math.round(
      extraChargeRows
        .filter((row) => row.balanceGbp > 0.005)
        .reduce((sum, row) => sum + row.balanceGbp, 0) * 100,
    ) / 100;
    if (fromRows > 0.005) return fromRows;
    return payments.extraChargesOutstandingGbp;
  }, [extraChargeRows, payments.extraChargesOutstandingGbp]);

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
      includeDepositOutstanding={!payments.contractEndedYmd}
      extraChargeRows={extraChargeRows}
      outstandingExtraChargesGbp={extrasOutstandingGbp}
      extraChargesSelectable={!payments.extraChargePendingPayment && extrasOutstandingGbp > 0.005}
      submitLabel={submitLabel}
      triggerLabel={triggerLabel}
      triggerClassName={triggerClassName}
      hideTrigger={hideTrigger}
      open={open}
      onOpenChange={onOpenChange}
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
