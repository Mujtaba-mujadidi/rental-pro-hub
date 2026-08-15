import { notFound } from "next/navigation";
import { listHireContractsAction } from "@/app/actions/rental-hire-wizard";
import { loadVehiclesPageData } from "@/app/actions/rental-vehicles";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import {
  loadSubcompanyAuditTrailData,
  loadSubcompanyHireIncomeThisMonthGbp,
  loadSubcompanyOverviewData,
} from "@/lib/rental/load-subcompany-section-data";
import { parseSubcompanyWorkspaceSectionParam } from "@/lib/rental/subcompany-workspace-nav";
import { SubcompanyActivityClient } from "./activity/subcompany-activity-client";
import { SubcompanyDetailsClient } from "./details/subcompany-details-client";
import { SubcompanyHiresClient } from "./subcompany-hires-client";
import { SubcompanyOverviewClient } from "./subcompany-overview-client";
import { SubcompanyVehiclesClient } from "./subcompany-vehicles-client";

export default async function SubcompanyWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { id } = await params;
  const { section: sectionRaw } = await searchParams;
  const section = parseSubcompanyWorkspaceSectionParam(sectionRaw ?? null);
  const { profile } = await requireRentalCompanyArea();
  const companyId = profile.company_id?.trim();
  if (!companyId) {
    return <p className="rph-alert-error text-sm">No active company.</p>;
  }

  switch (section) {
    case "details":
      return <SubcompanyDetailsClient />;
    case "activity": {
      const res = await loadSubcompanyAuditTrailData(companyId, id);
      if (!res.ok) {
        if (res.error === "Subcompany not found.") notFound();
        return <p className="rph-alert-error text-sm">{res.error}</p>;
      }
      return <SubcompanyActivityClient events={res.events} />;
    }
    case "vehicles": {
      const data = await loadVehiclesPageData({ subcompanyId: id });
      if ("error" in data) {
        return <p className="rph-alert-error text-sm">{data.error}</p>;
      }
      return <SubcompanyVehiclesClient pageData={data} subcompanyId={id} />;
    }
    case "hires": {
      const res = await listHireContractsAction();
      if (!res.ok) {
        return <p className="rph-alert-error text-sm">{res.error}</p>;
      }
      const scopedIds = res.rows
        .filter((row) => row.subcompany_id === id)
        .map((row) => row.id);
      const incomeThisMonthGbp = await loadSubcompanyHireIncomeThisMonthGbp(scopedIds);
      return (
        <SubcompanyHiresClient
          initialRows={res.rows}
          initialCanWrite={res.canWrite}
          incomeThisMonthGbp={incomeThisMonthGbp}
        />
      );
    }
    default: {
      const res = await loadSubcompanyOverviewData(companyId, id);
      if (!res.ok) {
        if (res.error === "Subcompany not found.") notFound();
        return <p className="rph-alert-error text-sm">{res.error}</p>;
      }
      return (
        <SubcompanyOverviewClient
          stats={res.data.stats}
          openRequirements={res.data.openRequirements}
          recentActivity={res.data.recentActivity}
        />
      );
    }
  }
}
