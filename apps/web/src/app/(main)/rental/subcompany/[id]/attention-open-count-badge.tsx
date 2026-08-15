import { getSubcompanyAttentionOpenCount } from "@/lib/rental/load-subcompany-attention-data";

/** Streams the Attention tab badge without blocking the workspace shell. */
export async function AttentionOpenCountBadge({
  companyId,
  subcompanyId,
}: {
  companyId: string;
  subcompanyId: string;
}) {
  if (!companyId.trim()) return null;
  const count = await getSubcompanyAttentionOpenCount(companyId, subcompanyId);
  if (count <= 0) return null;
  return (
    <span className="subco-ws-tab-badge" aria-label={`${count} open items`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
