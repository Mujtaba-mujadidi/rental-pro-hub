"use client";

export function VehicleComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="rph-h1">{title}</h1>
        <p className="rph-muted mt-1 max-w-2xl text-sm">{description}</p>
      </div>
      <div className="rounded-xl border border-dashed border-rph-border-strong bg-rph-chrome px-4 py-10 text-center">
        <p className="text-sm font-medium text-rph-fg-secondary">Coming soon</p>
        <p className="rph-muted mt-1 text-sm">
          This section is ready in the vehicle menu — data and workflows will land in a later phase.
        </p>
      </div>
    </div>
  );
}
