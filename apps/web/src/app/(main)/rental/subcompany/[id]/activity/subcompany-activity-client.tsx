"use client";

import { useEffect, useState, useTransition } from "react";
import { loadSubcompanyAuditTrailAction } from "@/app/actions/rental-subcompany-workspace";
import type { SubcompanyAuditRow } from "@/lib/rental/subcompany-audit";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { useSubcompanyWorkspace } from "../subcompany-workspace-provider";

export function SubcompanyActivityClient() {
  const { shell } = useSubcompanyWorkspace();
  const [pending, startTransition] = useTransition();
  const [events, setEvents] = useState<SubcompanyAuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const res = await loadSubcompanyAuditTrailAction(shell.subcompany.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEvents(res.events);
      setError(null);
    });
  }, [shell.subcompany.id]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="rph-h1">Activity</h1>
        <p className="rph-muted mt-1 text-sm">Audit trail for changes to this subcompany.</p>
      </div>
      {pending && !events.length ? <p className="rph-muted text-sm">Loading activity…</p> : null}
      {error ? <p className="rph-alert-error text-sm">{error}</p> : null}
      {!events.length && !pending ? <p className="rph-muted text-sm">No events recorded yet.</p> : null}
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
