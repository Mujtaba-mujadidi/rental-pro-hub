export default function EsignLoading() {
  return (
    <div className="-m-4 flex min-h-[28rem] flex-col items-center justify-center gap-4 md:-m-6">
      <span
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-300 border-t-rph-rail dark:border-slate-600 dark:border-t-sky-400"
        aria-hidden
      />
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Loading e-signature</p>
        <p className="mt-1 text-xs text-slate-500">Preparing the contract designer…</p>
      </div>
    </div>
  );
}
