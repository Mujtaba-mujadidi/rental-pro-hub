export default function RentalLoading() {
  return (
    <div className="flex min-h-[12rem] items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <span
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-rph-rail dark:border-slate-600 dark:border-t-sky-400"
          aria-hidden
        />
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      </div>
    </div>
  );
}
