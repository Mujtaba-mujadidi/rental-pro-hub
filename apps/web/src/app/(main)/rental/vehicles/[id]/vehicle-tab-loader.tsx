"use client";

export function VehicleTabLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[12rem] items-center justify-center" role="status" aria-live="polite" aria-busy="true">
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <span
          className="h-8 w-8 animate-spin rounded-full border-[3px] border-rph-border border-t-rph-rail"
          aria-hidden
        />
        <p className="text-xs font-medium text-rph-fg-secondary">{label}</p>
      </div>
    </div>
  );
}
