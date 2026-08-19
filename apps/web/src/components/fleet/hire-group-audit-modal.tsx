"use client";

import { FormModalShell } from "@/components/forms/form-modal-shell";
import { formatUkDateText, formatUkDateTimeText } from "@/lib/datetime/uk";
import { formatAuditActorLabel, type HireGroupAuditRow } from "@/lib/fleet/hire-audit";

type Props = {
  open: boolean;
  title: string;
  loading?: boolean;
  error?: string | null;
  events: HireGroupAuditRow[];
  onClose: () => void;
};

function actorLabel(row: HireGroupAuditRow): string {
  return formatAuditActorLabel(row.actor_display_name, row.actor_role);
}

function splitUkDateTimeText(value: string): { dateLabel: string; timeLabel: string } {
  const comma = value.lastIndexOf(", ");
  if (comma < 0) return { dateLabel: value, timeLabel: "" };
  return { dateLabel: value.slice(0, comma), timeLabel: value.slice(comma + 2) };
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
        <ol className="hire-ws-activity-list -mx-6 sm:-mx-10">
          {events.map((e) => {
            const timestampLabel = formatUkDateTimeText(e.created_at);
            const { timeLabel } = splitUkDateTimeText(timestampLabel);
            const dateLabel = formatUkDateText(e.created_at);
            return (
              <li key={e.id} className="hire-ws-activity-row">
                <div className="hire-ws-activity-when">
                  <p className="hire-ws-activity-date">{dateLabel}</p>
                  {timeLabel ? <p className="hire-ws-activity-time">{timeLabel}</p> : null}
                </div>
                <div className="hire-ws-activity-rail">
                  <span className="hire-ws-activity-icon hire-ws-activity-icon-neutral" aria-hidden>
                    <AuditDotIcon />
                  </span>
                </div>
                <div className="hire-ws-activity-body">
                  <p className="hire-ws-activity-when-inline">{timestampLabel}</p>
                  <p className="text-sm font-semibold text-rph-fg">{e.summary}</p>
                  <p className="mt-1 text-xs text-rph-fg-muted">{actorLabel(e)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </FormModalShell>
  );
}

function AuditDotIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
