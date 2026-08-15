import type { HireContractTableRow } from "@/app/actions/rental-hire-wizard";
import type { VehiclesPageData } from "@/app/actions/rental-vehicles";
import type { SubcompanyAttentionData } from "@/lib/rental/load-subcompany-attention-data";
import type { SubcompanyOverviewData } from "@/lib/rental/load-subcompany-section-data";
import type { SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";
import type { SubcompanyWorkspaceSection } from "@/lib/rental/subcompany-workspace-nav";

export type SubcompanySectionPayload =
  | { section: ""; data: SubcompanyOverviewData }
  | { section: "attention"; data: SubcompanyAttentionData }
  | { section: "details"; data: null }
  | { section: "activity"; data: { events: SubcompanyAuditRow[] } }
  | { section: "vehicles"; data: VehiclesPageData }
  | {
      section: "hires";
      data: { rows: HireContractTableRow[]; canWrite: boolean; incomeThisMonthGbp: number };
    };

type CacheEntry = {
  payload: SubcompanySectionPayload;
  loadedAt: number;
};

const TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(subcompanyId: string, section: SubcompanyWorkspaceSection): string {
  return `${subcompanyId.trim()}:${section || "overview"}`;
}

export function readSubcompanySectionCache(
  subcompanyId: string,
  section: SubcompanyWorkspaceSection,
): SubcompanySectionPayload | null {
  const entry = cache.get(cacheKey(subcompanyId, section));
  if (!entry) return null;
  if (Date.now() - entry.loadedAt > TTL_MS) {
    cache.delete(cacheKey(subcompanyId, section));
    return null;
  }
  return entry.payload;
}

export function writeSubcompanySectionCache(payload: SubcompanySectionPayload, subcompanyId: string) {
  cache.set(cacheKey(subcompanyId, payload.section), {
    payload,
    loadedAt: Date.now(),
  });
}

export function invalidateSubcompanySectionCache(subcompanyId?: string) {
  const id = subcompanyId?.trim();
  if (!id) {
    cache.clear();
    return;
  }
  const prefix = `${id}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
