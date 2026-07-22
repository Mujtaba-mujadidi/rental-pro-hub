export default function DriverHireSignedDocumentsLoading() {
  return (
    <div className="flex min-h-[28rem] flex-col items-center justify-center gap-4">
      <span
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
        aria-hidden
      />
      <div className="text-center">
        <p className="text-sm font-semibold text-rph-fg">Loading signed documents</p>
        <p className="mt-1 text-xs text-rph-fg-muted">Preparing your hire agreements…</p>
      </div>
    </div>
  );
}
