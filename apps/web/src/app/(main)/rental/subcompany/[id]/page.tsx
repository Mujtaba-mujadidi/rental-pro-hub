import { notFound } from "next/navigation";
import { listHireContractsAction } from "@/app/actions/rental-hire-wizard";
import { loadVehiclesPageData } from "@/app/actions/rental-vehicles";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { getSubcompanyAttentionData } from "@/lib/rental/load-subcompany-attention-data";
import {
  loadSubcompanyAuditTrailData,
  loadSubcompanyHireIncomeThisMonthForSubcompany,
  loadSubcompanyOverviewData,
} from "@/lib/rental/load-subcompany-section-data";
import { parseSubcompanyWorkspaceSectionParam } from "@/lib/rental/subcompany-workspace-nav";
import { SubcompanyActivityClient } from "./activity/subcompany-activity-client";
import { SubcompanyAttentionClient } from "./attention/subcompany-attention-client";
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
    case "attention": {
      const res = await getSubcompanyAttentionData(companyId, id);
      if (!res.ok) {
        if (res.error === "Subcompany not found.") notFound();
        return <p className="rph-alert-error text-sm">{res.error}</p>;
      }
      return <SubcompanyAttentionClient data={res.data} />;
    }
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
      const [res, incomeThisMonthGbp] = await Promise.all([
        listHireContractsAction("", undefined, id),
        loadSubcompanyHireIncomeThisMonthForSubcompany(companyId, id),
      ]);
      if (!res.ok) {
        return <p className="rph-alert-error text-sm">{res.error}</p>;
      }
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
