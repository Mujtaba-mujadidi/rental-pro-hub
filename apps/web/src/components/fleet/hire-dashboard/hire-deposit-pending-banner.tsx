"use client";

import type { HireFinancialClosureState } from "@/lib/fleet/hire-financial-closure";
import { formatGbp } from "@/lib/fleet/maintenance";
import Link from "next/link";

export function HireDepositPendingBanner({
  hireGroupId,
  closure,
  audience = "staff",
  checkinCompleted = true,
}: {
  hireGroupId: string;
  closure: Pick<HireFinancialClosureState, "depositPendingReview" | "depositGbp" | "rentSettlementSettled">;
  audience?: "staff" | "driver";
  checkinCompleted?: boolean;
}) {
  if (!closure.depositPendingReview || closure.depositGbp <= 0.005) return null;

  const paymentsHref =
    audience === "driver" ? `/driver/hires/${hireGroupId}/payments` : `/rental/hires/${hireGroupId}/payments`;
  const checkinHref =
    audience === "driver" ? `/driver/hires/${hireGroupId}/checkin` : `/rental/hires/${hireGroupId}/checkin`;

  return (
    <section className="rph-alert-warning text-sm">
      <p className="font-medium text-rph-fg">
        {audience === "driver"
          ? closure.rentSettlementSettled
            ? "Final balance cleared — deposit still being reviewed"
            : checkinCompleted
              ? "Deposit held — waiting for rental company"
              : "Deposit held — waiting for check-in"
          : closure.rentSettlementSettled
            ? "Final balance cleared — deposit still needs a decision"
            : checkinCompleted
              ? "Deposit held — decide what to do"
              : "Deposit held — complete check-in first"}
      </p>
      <p className="mt-1 text-rph-fg-secondary">
        {formatGbp(closure.depositGbp)} deposit is separate from the rent balance.
        {audience === "staff"
          ? checkinCompleted
            ? " After check-in, choose to return it, keep it, or use it to pay rent on the Payments tab."
            : " Complete vehicle check-in before resolving the deposit or recording settlement payments."
          : " Your rental company will confirm what happens to the deposit after check-in."}
      </p>
      {audience === "staff" ? (
        <p className="mt-2">
          {checkinCompleted ? (
            <Link href={paymentsHref} className="rph-link-inline font-medium">
              Resolve deposit on Payments
            </Link>
          ) : (
            <Link href={checkinHref} className="rph-link-inline font-medium">
              Complete vehicle check-in
            </Link>
          )}
        </p>
      ) : null}
    </section>
  );
}
