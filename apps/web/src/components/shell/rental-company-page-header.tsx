export function RentalCompanyPageHeader({
  name,
  address,
}: {
  name: string;
  address?: string | null;
}) {
  const trimmedName = name.trim();
  if (!trimmedName) return null;

  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-rph-fg">{trimmedName}</p>
      {address?.trim() ? <p className="truncate text-xs text-rph-fg-muted">{address.trim()}</p> : null}
    </div>
  );
}
