import type { SubcompanyStatus } from "@/lib/rental/subcompany";

export const SUBCOMPANY_STATUS_LABELS: Record<SubcompanyStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
};

/** Accepts the raw DB string so switcher rows can be rendered without re-mapping. */
export function SubcompanyStatusChip({ status }: { status: string }) {
  const normalized: SubcompanyStatus =
    status === "inactive" || status === "pending" ? status : "active";
  const tone =
    normalized === "active"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 dark:ring-emerald-800/60"
      : normalized === "pending"
        ? "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100 dark:ring-amber-800/50"
        : "bg-rph-chrome text-rph-fg-muted dark:ring-rph-border-strong";

  return (
    <span
      className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide dark:ring-1 ${tone}`}
    >
      {SUBCOMPANY_STATUS_LABELS[normalized]}
    </span>
  );
}
