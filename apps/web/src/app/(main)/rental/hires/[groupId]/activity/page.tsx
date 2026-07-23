"use client";

import { loadHireGroupAuditTrailAction } from "@/app/actions/rental-hires";
import type { HireGroupAuditRow } from "@/lib/fleet/hire-audit";
import { formatUkDateTime } from "@/lib/datetime/uk";
import { useEffect, useState, useTransition } from "react";
import { useHireWorkspace } from "../hire-workspace-provider";

export default function HireActivityPage() {
  const { shell } = useHireWorkspace();
  const [pending, startTransition] = useTransition();
  const [events, setEvents] = useState<HireGroupAuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const res = await loadHireGroupAuditTrailAction(shell.hireGroupId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEvents(res.events);
      setError(null);
    });
  }, [shell.hireGroupId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="rph-h1">Activity</h1>
        <p className="rph-muted mt-1 text-sm">Audit trail for this hire contract.</p>
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
