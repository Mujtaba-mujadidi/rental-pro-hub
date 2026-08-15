"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { loadVehiclesPageData } from "@/app/actions/rental-vehicles";
import {
  loadSubcompanyAttentionAction,
  loadSubcompanyAuditTrailAction,
  loadSubcompanyHiresSectionAction,
  loadSubcompanyOverviewAction,
} from "@/app/actions/rental-subcompany-workspace";
import { PageLoading } from "@/components/ui/page-loading";
import {
  readSubcompanySectionCache,
  writeSubcompanySectionCache,
  type SubcompanySectionPayload,
} from "@/lib/rental/subcompany-section-cache";
import type { SubcompanyWorkspaceSection } from "@/lib/rental/subcompany-workspace-nav";
import { SubcompanyActivityClient } from "./activity/subcompany-activity-client";
import { SubcompanyAttentionClient } from "./attention/subcompany-attention-client";
import { SubcompanyDetailsClient } from "./details/subcompany-details-client";
import { SubcompanyHiresClient } from "./subcompany-hires-client";
import { SubcompanyOverviewClient } from "./subcompany-overview-client";
import { SubcompanyVehiclesClient } from "./subcompany-vehicles-client";
import { useSubcompanyWorkspace } from "./subcompany-workspace-provider";

async function fetchSectionPayload(
  subcompanyId: string,
  section: SubcompanyWorkspaceSection,
): Promise<{ ok: true; payload: SubcompanySectionPayload } | { ok: false; error: string }> {
  switch (section) {
    case "attention": {
      const res = await loadSubcompanyAttentionAction(subcompanyId);
      if (!res.ok) return res;
      return { ok: true, payload: { section: "attention", data: res.data } };
    }
    case "details":
      return { ok: true, payload: { section: "details", data: null } };
    case "activity": {
      const res = await loadSubcompanyAuditTrailAction(subcompanyId);
      if (!res.ok) return res;
      return { ok: true, payload: { section: "activity", data: { events: res.events } } };
    }
    case "vehicles": {
      const data = await loadVehiclesPageData({ subcompanyId });
      if ("error" in data) return { ok: false, error: data.error };
      return { ok: true, payload: { section: "vehicles", data } };
    }
    case "hires": {
      const res = await loadSubcompanyHiresSectionAction(subcompanyId);
      if (!res.ok) return res;
      return {
        ok: true,
        payload: {
          section: "hires",
          data: {
            rows: res.rows,
            canWrite: res.canWrite,
            incomeThisMonthGbp: res.incomeThisMonthGbp,
          },
        },
      };
    }
    default: {
      const res = await loadSubcompanyOverviewAction(subcompanyId);
      if (!res.ok) return res;
      return { ok: true, payload: { section: "", data: res.data } };
    }
  }
}

function renderPayload(payload: SubcompanySectionPayload, subcompanyId: string) {
  switch (payload.section) {
    case "attention":
      return <SubcompanyAttentionClient data={payload.data} />;
    case "details":
      return <SubcompanyDetailsClient />;
    case "activity":
      return <SubcompanyActivityClient events={payload.data.events} />;
    case "vehicles":
      return <SubcompanyVehiclesClient pageData={payload.data} subcompanyId={subcompanyId} />;
    case "hires":
      return (
        <SubcompanyHiresClient
          initialRows={payload.data.rows}
          initialCanWrite={payload.data.canWrite}
          incomeThisMonthGbp={payload.data.incomeThisMonthGbp}
        />
      );
    default:
      return (
        <SubcompanyOverviewClient
          stats={payload.data.stats}
          openRequirements={payload.data.openRequirements}
          recentActivity={payload.data.recentActivity}
        />
      );
  }
}

export function SubcompanyWorkspaceSections({
  subcompanyId,
  initialSection,
  initialPayload,
}: {
  subcompanyId: string;
  initialSection: SubcompanyWorkspaceSection;
  initialPayload: SubcompanySectionPayload | null;
}) {
  const { section, setSection } = useSubcompanyWorkspace();
  const activeSection = section ?? initialSection;
  const [payload, setPayload] = useState<SubcompanySectionPayload | null>(() => {
    if (initialPayload && initialPayload.section === initialSection) {
      writeSubcompanySectionCache(initialPayload, subcompanyId);
      return initialPayload;
    }
    return readSubcompanySectionCache(subcompanyId, initialSection);
  });
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const ensureSection = useCallback(
    (next: SubcompanyWorkspaceSection) => {
      const cached = readSubcompanySectionCache(subcompanyId, next);
      if (cached) {
        setPayload(cached);
        setError(null);
        return;
      }
      // Keep showing previous payload while fetching a different section when possible.
      startTransition(() => {
        void (async () => {
          const res = await fetchSectionPayload(subcompanyId, next);
          if (!res.ok) {
            setError(res.error);
            return;
          }
          writeSubcompanySectionCache(res.payload, subcompanyId);
          setPayload(res.payload);
          setError(null);
        })();
      });
    },
    [subcompanyId],
  );

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection, setSection, subcompanyId]);

  useEffect(() => {
    ensureSection(activeSection);
  }, [activeSection, ensureSection]);

  useEffect(() => {
    const idle = window.setTimeout(() => {
      const warm: SubcompanyWorkspaceSection[] = ["", "attention", "hires", "vehicles", "details"];
      for (const s of warm) {
        if (s === activeSection) continue;
        if (readSubcompanySectionCache(subcompanyId, s)) continue;
        void fetchSectionPayload(subcompanyId, s).then((res) => {
          if (res.ok) writeSubcompanySectionCache(res.payload, subcompanyId);
        });
      }
    }, 500);
    return () => window.clearTimeout(idle);
  }, [subcompanyId, activeSection]);

  if (error) return <p className="rph-alert-error text-sm">{error}</p>;
  if (!payload || payload.section !== activeSection) {
    return (
      <div className="py-8">
        <PageLoading label="Loading…" />
      </div>
    );
  }

  return renderPayload(payload, subcompanyId);
}
