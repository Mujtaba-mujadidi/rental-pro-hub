"use client";

import { useMemo, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";
import {
  SUBCOMPANY_ACTIVITY_FILTERS,
  buildSubcompanyActivityExportCsv,
  filterSubcompanyActivityItems,
  groupSubcompanyActivityByDay,
  mapSubcompanyActivityItems,
  subcompanyActivityExportFileName,
  type SubcompanyActivityFilter,
  type SubcompanyActivityItem,
} from "@/lib/rental/subcompany-activity-display";
import { useSubcompanyWorkspace } from "../subcompany-workspace-provider";

const filterMenuContentClass =
  "z-[200] min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden rounded-lg border border-rph-border bg-rph-elevated py-1 shadow-lg";

const filterMenuItemClass =
  "flex cursor-default select-none items-center px-3 py-2 text-sm text-rph-fg outline-none data-[highlighted]:bg-rph-chrome data-[state=checked]:font-semibold";

export function SubcompanyActivityClient({ events }: { events: SubcompanyAuditRow[] }) {
  const { shell } = useSubcompanyWorkspace();
  const [filter, setFilter] = useState<SubcompanyActivityFilter>("all");

  const items = useMemo(() => mapSubcompanyActivityItems(events), [events]);
  const filtered = useMemo(() => filterSubcompanyActivityItems(items, filter), [filter, items]);
  const groups = useMemo(() => groupSubcompanyActivityByDay(filtered), [filtered]);
  const filterLabel =
    SUBCOMPANY_ACTIVITY_FILTERS.find((option) => option.value === filter)?.label ?? "All activity";

  function exportCsv() {
    const csv = buildSubcompanyActivityExportCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = subcompanyActivityExportFileName(shell.subcompany.id);
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="subco-activity pb-4 sm:pb-5">
      <section className="subco-activity-card rph-card p-0 shadow-sm">
        <div className="subco-activity-head border-b border-rph-border px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="company-dash-section-label">Audit trail</p>
              <h2 className="mt-1 text-lg font-semibold text-rph-fg">Company activity</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="rph-input inline-flex h-9 min-w-[10.5rem] items-center justify-between gap-2 px-3 text-left text-sm font-medium"
                    aria-label="Filter activity"
                  >
                    <span className="truncate">{filterLabel}</span>
                    <ChevronDownIcon />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    side="bottom"
                    align="end"
                    sideOffset={6}
                    avoidCollisions={false}
                    className={filterMenuContentClass}
                  >
                    {SUBCOMPANY_ACTIVITY_FILTERS.map((option) => (
                      <DropdownMenu.Item
                        key={option.value}
                        className={filterMenuItemClass}
                        data-state={filter === option.value ? "checked" : undefined}
                        onSelect={() => setFilter(option.value)}
                      >
                        {option.label}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <button
                type="button"
                className="rph-btn-ghost h-9 shrink-0 px-3.5 text-sm font-semibold"
                onClick={exportCsv}
              >
                Export
              </button>
            </div>
          </div>
        </div>

        {!filtered.length ? (
          <p className="px-4 py-8 text-sm text-rph-fg-muted sm:px-5">
            {items.length ? "No activity matches this filter." : "No events recorded yet."}
          </p>
        ) : (
          <div className="subco-activity-scroll px-4 py-2 sm:px-5 sm:py-3">
            {groups.map((group) => (
              <div key={group.dayKey} className="subco-activity-day">
                <p className="subco-activity-day-label">{group.dayLabel}</p>
                <ol className="subco-activity-list">
                  {group.items.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActivityRow({ item }: { item: SubcompanyActivityItem }) {
  const toneClass =
    item.tone === "ok"
      ? "subco-activity-dot-ok"
      : item.tone === "warn"
        ? "subco-activity-dot-warn"
        : item.tone === "neutral"
          ? "subco-activity-dot-neutral"
          : "subco-activity-dot-info";

  const detailParts = [item.detail, item.actorLabel].filter(Boolean);

  return (
    <li className="subco-activity-row">
      <span className={`subco-activity-dot ${toneClass}`} aria-hidden />
      <div className="subco-activity-body min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-rph-fg">{item.title}</p>
            {detailParts.length ? (
              <p className="mt-0.5 text-xs leading-relaxed text-rph-fg-muted">
                {detailParts.join(" · ")}
              </p>
            ) : null}
          </div>
          <p className="shrink-0 pt-0.5 text-xs tabular-nums text-rph-fg-muted">{item.timeLabel}</p>
        </div>
      </div>
    </li>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-rph-fg-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
