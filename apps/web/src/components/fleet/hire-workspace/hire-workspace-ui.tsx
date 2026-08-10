import type { ReactNode } from "react";

export function HireWorkspacePlate({ vrm, compact }: { vrm: string; compact?: boolean }) {
  return <span className={compact ? "hire-ws-plate hire-ws-plate-sm" : "hire-ws-plate"}>{vrm}</span>;
}

export function HireWorkspaceChip({
  children,
  tone = "neutral",
  dot,
}: {
  children: ReactNode;
  tone?: "success" | "warn" | "neutral";
  dot?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "hire-ws-chip-success"
      : tone === "warn"
        ? "hire-ws-chip-warn"
        : "border-rph-border bg-rph-raised text-rph-fg-secondary";
  return (
    <span className={`hire-ws-chip ${toneClass}`}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function HireWorkspaceStatCard({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className={warn ? "hire-ws-stat-card hire-ws-stat-card-warn" : "hire-ws-stat-card"}>
      <p className="hire-ws-section-kicker">{label}</p>
      <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-rph-fg">{value}</p>
      {hint ? <p className="mt-1 text-xs text-rph-fg-muted">{hint}</p> : null}
    </div>
  );
}

export function HireWorkspaceProgressBar({
  percent,
  tone = "warn",
}: {
  percent: number;
  tone?: "ok" | "warn" | "danger";
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillClass =
    tone === "ok"
      ? "hire-ws-progress-fill-ok"
      : tone === "danger"
        ? "hire-ws-progress-fill-danger"
        : "hire-ws-progress-fill";
  return (
    <div className="hire-ws-progress" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={fillClass} style={{ width: `${clamped}%` }} />
    </div>
  );
}
