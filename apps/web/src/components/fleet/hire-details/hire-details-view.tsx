"use client";

import type { HireDetailsPayload } from "@/app/actions/hire-details";
import { HireDetailsCompanyView } from "@/components/fleet/hire-details/hire-details-company-view";
import { HireDetailsDriverView } from "@/components/fleet/hire-details/hire-details-driver-view";

export function HireDetailsView({
  data,
  audience,
}: {
  data: HireDetailsPayload;
  audience: "driver" | "staff";
}) {
  if (audience === "staff") return <HireDetailsCompanyView data={data} />;
  return <HireDetailsDriverView data={data} />;
}
