"use client";

export type ActionStatusPhase = "pending" | "success" | "error";

export type ActionStatusOverlayState = {
  phase: ActionStatusPhase;
  title: string;
  detail: string;
};

/**
 * Full-screen feedback for slow admin/auth actions (send email, reset password, etc.).
 */
export function ActionStatusOverlay({
  state,
  onDismiss,
}: {
  state: ActionStatusOverlayState | null;
  onDismiss?: () => void;
}) {
  if (!state) return null;

  const pending = state.phase === "pending";

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
      role={pending ? "status" : "alertdialog"}
      aria-live="polite"
      aria-busy={pending}
      aria-label={state.title}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-2xl dark:border-slate-600 dark:bg-slate-900">
        {state.phase === "pending" ? (
          <span
            className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-rph-rail dark:border-slate-600 dark:border-t-sky-400"
            aria-hidden
          />
        ) : null}
        {state.phase === "success" ? (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            aria-hidden
          >
            <span className="text-xl font-bold">✓</span>
          </div>
        ) : null}
        {state.phase === "error" ? (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
            aria-hidden
          >
            <span className="text-xl font-bold">!</span>
          </div>
        ) : null}
        <div className="space-y-1">
          <p
            className={`text-base font-semibold ${
              state.phase === "success"
                ? "text-emerald-800 dark:text-emerald-200"
                : state.phase === "error"
                  ? "text-red-800 dark:text-red-200"
                  : "text-slate-900 dark:text-slate-50"
            }`}
          >
            {state.title}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{state.detail}</p>
        </div>
        {state.phase === "error" && onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg bg-rph-rail px-4 py-2 text-sm font-semibold text-white"
          >
            Dismiss
          </button>
        ) : null}
        {state.phase === "success" && onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
