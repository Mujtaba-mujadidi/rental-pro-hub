import {
  vehicleExpiryPillClass,
  type VehicleExpiryItem,
  type VehicleExpiryTone,
} from "@/lib/fleet/vehicle-expiry-attention";

export function VehicleExpiryPills({
  items,
  className = "",
}: {
  items: VehicleExpiryItem[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`.trim()}>
      {items.map((item) => (
        <span
          key={item.kind}
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${vehicleExpiryPillClass(item.tone)}`}
          title={item.message}
        >
          {item.label}: {item.shortStatus}
        </span>
      ))}
    </div>
  );
}

export function VehicleExpiryAlert({
  items,
  tone,
}: {
  items: VehicleExpiryItem[];
  tone: VehicleExpiryTone;
}) {
  if (!items.length || tone === "ok") return null;
  const alertClass = tone === "expired" ? "rph-alert-error" : "rph-alert-warn";
  return (
    <div className={`${alertClass} text-sm`}>
      <p className="font-semibold">{tone === "expired" ? "Compliance dates expired" : "Compliance dates expiring soon"}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((item) => (
          <li key={item.kind}>{item.message}</li>
        ))}
      </ul>
    </div>
  );
}
