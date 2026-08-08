"use client";

import type { SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";
import { formatUkDateTime } from "@/lib/datetime/uk";

export function SubcompanyActivityClient({ events }: { events: SubcompanyAuditRow[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="rph-h1">Activity</h1>
        <p className="rph-muted mt-1 text-sm">Audit trail for changes to this subcompany.</p>
      </div>
      {!events.length ? <p className="rph-muted text-sm">No events recorded yet.</p> : null}
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id} className="rph-card p-3 text-sm">
            <p className="font-medium text-rph-fg">{event.summary}</p>
            <p className="rph-meta text-xs">
              {formatUkDateTime(event.created_at)}
              {event.actor_role ? ` · ${event.actor_role.replace(/_/g, " ")}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
