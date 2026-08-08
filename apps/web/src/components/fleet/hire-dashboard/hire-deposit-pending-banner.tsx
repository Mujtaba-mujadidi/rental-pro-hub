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
        {audience === "driver"
          ? closure.rentSettlementSettled
            ? "Final balance cleared — deposit still being reviewed"
            : "Deposit held — waiting for rental company"
          : closure.rentSettlementSettled
            ? "Final balance cleared — deposit still needs a decision"
            : "Deposit held — decide what to do"}
      </p>
      <p className="mt-1 text-rph-fg-secondary">
        {formatGbp(closure.depositGbp)} deposit is separate from the rent balance.
        {audience === "staff"
          ? " After check-in, choose to return it, keep it, or use it to pay rent on the Payments tab."
          : " Your rental company will confirm what happens to the deposit after check-in."}
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
