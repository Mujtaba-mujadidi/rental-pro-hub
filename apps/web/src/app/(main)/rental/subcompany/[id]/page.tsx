import { notFound } from "next/navigation";
import { requireRentalCompanyArea } from "@/lib/auth/profile";
import { getSubcompanyAttentionData } from "@/lib/rental/load-subcompany-attention-data";
import {
  loadSubcompanyAuditTrailData,
  loadSubcompanyHireIncomeThisMonthForSubcompany,
  loadSubcompanyOverviewData,
} from "@/lib/rental/load-subcompany-section-data";
import { listHireContractsAction } from "@/app/actions/rental-hire-wizard";
import { loadVehiclesPageData } from "@/app/actions/rental-vehicles";
import type { SubcompanySectionPayload } from "@/lib/rental/subcompany-section-cache";
import { parseSubcompanyWorkspaceSectionParam } from "@/lib/rental/subcompany-workspace-nav";
import { SubcompanyWorkspaceSections } from "./subcompany-workspace-sections";

async function loadInitialPayload(
  companyId: string,
  subcompanyId: string,
  section: ReturnType<typeof parseSubcompanyWorkspaceSectionParam>,
): Promise<SubcompanySectionPayload | null> {
  switch (section) {
    case "attention": {
      const res = await getSubcompanyAttentionData(companyId, subcompanyId);
      if (!res.ok) {
        if (res.error === "Subcompany not found.") notFound();
        return null;
      }
      return { section: "attention", data: res.data };
    }
    case "details":
      return { section: "details", data: null };
    case "activity": {
      const res = await loadSubcompanyAuditTrailData(companyId, subcompanyId);
      if (!res.ok) {
        if (res.error === "Subcompany not found.") notFound();
        return null;
      }
      return { section: "activity", data: { events: res.events } };
    }
    case "vehicles": {
      const data = await loadVehiclesPageData({ subcompanyId });
      if ("error" in data) return null;
      return { section: "vehicles", data };
    }
    case "hires": {
      const [res, incomeThisMonthGbp] = await Promise.all([
        listHireContractsAction("", undefined, subcompanyId),
        loadSubcompanyHireIncomeThisMonthForSubcompany(companyId, subcompanyId),
      ]);
      if (!res.ok) return null;
      return {
        section: "hires",
        data: { rows: res.rows, canWrite: res.canWrite, incomeThisMonthGbp },
      };
    }
    default: {
      const res = await loadSubcompanyOverviewData(companyId, subcompanyId);
      if (!res.ok) {
        if (res.error === "Subcompany not found.") notFound();
        return null;
      }
      return { section: "", data: res.data };
    }
  }
}

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

  const initialPayload = await loadInitialPayload(companyId, id, section);
  if (!initialPayload && section !== "details") {
    return <p className="rph-alert-error text-sm">Could not load this section.</p>;
  }

  return (
    <SubcompanyWorkspaceSections
      subcompanyId={id}
      initialSection={section}
      initialPayload={initialPayload}
    />
  );
}
