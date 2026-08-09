import type { ReactNode } from "react";

/** Filter row + action buttons — stacks on narrow viewports to prevent overlap. */
export function RphFilterToolbar({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:flex-1">{children}</div>
      {actions ? (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

/** Page title with optional actions — stacks on narrow viewports. */
export function RphPageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="rph-h1">{title}</h1>
        {description ? <p className="rph-muted mt-1 text-sm">{description}</p> : null}
        {meta}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/** Inline section header with optional trailing actions. */
export function RphSectionHeader({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0">{children}</div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
