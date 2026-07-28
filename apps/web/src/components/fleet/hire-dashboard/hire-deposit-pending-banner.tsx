"use client";

import type { HireFinancialClosureState } from "@/lib/fleet/hire-financial-closure";
import { formatGbp } from "@/lib/fleet/maintenance";
import Link from "next/link";

export function HireDepositPendingBanner({
  hireGroupId,
  closure,
  audience = "staff",
}: {
  hireGroupId: string;
  closure: Pick<HireFinancialClosureState, "depositPendingReview" | "depositGbp" | "rentSettlementSettled">;
  audience?: "staff" | "driver";
}) {
  if (!closure.depositPendingReview || closure.depositGbp <= 0.005) return null;

  const paymentsHref =
    audience === "driver" ? `/driver/hires/${hireGroupId}/payments` : `/rental/hires/${hireGroupId}/payments`;

  return (
    <section className="rph-alert-warning text-sm">
      <p className="font-medium text-rph-fg">
        {closure.rentSettlementSettled
          ? "Rent settlement is cleared — deposit still needs a decision"
          : "Deposit held pending review"}
      </p>
      <p className="mt-1 text-rph-fg-secondary">
        {formatGbp(closure.depositGbp)} deposit is held separately from rent settlement.
        {audience === "staff"
          ? " Choose refund, forfeit, or apply to balance on the Payments tab when you have inspected the vehicle."
          : " Your rental company will confirm how the deposit is handled after check-in."}
      </p>
      {audience === "staff" ? (
        <p className="mt-2">
          <Link href={paymentsHref} className="rph-link-inline font-medium">
            Resolve deposit on Payments
          </Link>
        </p>
      ) : null}
    </section>
  );
}
