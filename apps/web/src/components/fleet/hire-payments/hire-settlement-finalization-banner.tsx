"use client";

import {
  hireSettlementFinalizationBlockedMessage,
  hireSettlementFinalizationRequiredMessage,
} from "@/lib/fleet/hire-settlement-finalization";
import Link from "next/link";

export function HireSettlementFinalizationBanner({
  hireGroupId,
  contractEnded,
  checkinCompleted,
  audience = "staff",
}: {
  hireGroupId: string;
  contractEnded: boolean;
  checkinCompleted: boolean;
  audience?: "staff" | "driver";
}) {
  if (!contractEnded || checkinCompleted) return null;

  const checkinHref =
    audience === "driver"
      ? `/driver/hires/${hireGroupId}/checkin`
      : `/rental/hires/${hireGroupId}/checkin`;

  return (
    <section className="rph-alert-warning text-sm">
      <p className="font-medium text-rph-fg">
        {audience === "driver" ? "Final balance after check-in" : "Provisional close — check-in required"}
      </p>
      <p className="mt-1 text-rph-fg-secondary">
        {hireSettlementFinalizationRequiredMessage(audience)}{" "}
        {hireSettlementFinalizationBlockedMessage(audience)}
      </p>
      {audience === "staff" ? (
        <p className="mt-2">
          <Link href={checkinHref} className="rph-link-inline font-medium">
            Complete vehicle check-in
          </Link>
        </p>
      ) : null}
    </section>
  );
}
