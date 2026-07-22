"use client";

import { FormModalShell } from "@/components/forms/form-modal-shell";
import { formatUkDateTime } from "@/lib/datetime/uk";
import type { HireGroupAuditRow } from "@/lib/fleet/hire-audit";

type Props = {
  open: boolean;
  title: string;
  loading?: boolean;
  error?: string | null;
  events: HireGroupAuditRow[];
  onClose: () => void;
};

function actorLabel(row: HireGroupAuditRow): string {
  if (row.actor_role === "company_staff") return "Rental staff";
  if (row.actor_role === "driver") return "Driver";
  return "System";
}

export function HireGroupAuditModal({ open, title, loading, error, events, onClose }: Props) {
  return (
    <FormModalShell
      open={open}
      titleId="hire-group-audit-title"
      title={title}
      description="Chronological record of actions on this hire contract from creation through execution."
      allowMaximize
      showDraftActions={false}
      pending={loading}
      maxWidthClass="max-w-2xl"
      panelHeightClass="h-[min(80vh,40rem)]"
      onRequestClose={onClose}
      discardConfirmOpen={false}
      onConfirmDiscard={onClose}
      onCancelDiscard={onClose}
      footer={
        loading ? (
          <span className="text-xs text-rph-fg-muted">Loading…</span>
        ) : (
          <span className="text-xs text-rph-fg-muted">
            {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        )
      }
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite" aria-busy="true">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-rph-rail/30 border-t-rph-rail" />
          <p className="text-sm text-rph-fg-secondary">Loading audit trail…</p>
        </div>
      ) : error ? (
        <p className="rph-alert-error text-sm">{error}</p>
      ) : !events.length ? (
        <p className="rph-muted text-sm">No events recorded yet.</p>
      ) : (
        <ol className="relative space-y-0 border-l border-rph-border pl-5">
          {events.map((e) => (
            <li key={e.id} className="relative pb-6 last:pb-0">
              <span
                className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-rph-rail bg-rph-page"
                aria-hidden
              />
              <p className="text-sm font-medium text-rph-fg">{e.summary}</p>
              <p className="rph-meta mt-1 text-xs">
                {formatUkDateTime(e.created_at)} · {actorLabel(e)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </FormModalShell>
  );
}
