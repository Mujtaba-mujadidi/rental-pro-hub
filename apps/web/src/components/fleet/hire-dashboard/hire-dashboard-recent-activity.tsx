"use client";

import type { HireDashboardRecentEvent } from "@/app/actions/hire-dashboard";
import { formatUkDateTime } from "@/lib/datetime/uk";
import Link from "next/link";

export function HireDashboardRecentActivity({
  events,
  activityHref,
  title = "Recent activity",
}: {
  events: HireDashboardRecentEvent[];
  activityHref?: string | null;
  title?: string;
}) {
  return (
    <section className="rph-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-rph-fg">{title}</h2>
        {activityHref ? (
          <Link href={activityHref} className="text-xs font-medium text-rph-link hover:text-rph-link-hover">
            View all
          </Link>
        ) : null}
      </div>
      {!events.length ? (
        <p className="rph-meta mt-3 text-sm">No recent payment or hire events.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {events.map((event) => (
            <li key={event.id} className="border-b border-rph-border pb-2 text-sm last:border-0 last:pb-0">
              <p className="text-rph-fg">{event.summary}</p>
              <p className="rph-meta text-xs">{formatUkDateTime(event.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
