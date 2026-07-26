export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[12rem] items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <span
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
          aria-hidden
        />
        <p className="text-sm text-rph-fg-muted">{label}</p>
      </div>
    </div>
  );
}
