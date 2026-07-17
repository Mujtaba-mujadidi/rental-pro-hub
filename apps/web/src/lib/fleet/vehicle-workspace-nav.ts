export type VehicleWorkspaceNavItem = {
  href: string;
  label: string;
  /** Exact match for dashboard; prefix match for nested routes. */
  match: "exact" | "prefix";
};

/** Vehicle workspace section menus (top bar pills). */
export function vehicleWorkspaceNav(vehicleId: string): VehicleWorkspaceNavItem[] {
  const base = `/rental/vehicles/${vehicleId}`;
  return [
    { href: base, label: "Dashboard", match: "exact" },
    { href: `${base}/details`, label: "Details", match: "prefix" },
    { href: `${base}/rentals`, label: "Rentals", match: "prefix" },
    { href: `${base}/maintenance`, label: "Maintenance", match: "prefix" },
    { href: `${base}/pcn`, label: "PCN", match: "prefix" },
    { href: `${base}/claims`, label: "Claims", match: "prefix" },
  ];
}

export function vehicleWorkspaceHref(
  vehicleId: string,
  path: "" | "details" | "rentals" | "maintenance" | "pcn" | "claims" = "",
) {
  return path ? `/rental/vehicles/${vehicleId}/${path}` : `/rental/vehicles/${vehicleId}`;
}

export type VehicleWorkspaceSection = "" | "details" | "rentals" | "maintenance" | "pcn" | "claims";

/** Current section under a vehicle workspace URL (preserves tab when switching vehicles). */
export function parseVehicleWorkspaceSection(pathname: string, vehicleId: string): VehicleWorkspaceSection {
  const base = `/rental/vehicles/${vehicleId}`;
  if (pathname === base) return "";
  if (!pathname.startsWith(`${base}/`)) return "";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  if (
    segment === "details" ||
    segment === "rentals" ||
    segment === "maintenance" ||
    segment === "pcn" ||
    segment === "claims"
  ) {
    return segment;
  }
  return "";
}

/** `/rental/vehicles/:id` workspace (not the fleet list). */
export function parseVehicleWorkspaceId(pathname: string): string | null {
  const m = pathname.match(/^\/rental\/vehicles\/([^/]+)/);
  if (!m?.[1]) return null;
  return m[1];
}

export function isVehicleWorkspaceNavItemActive(pathname: string, item: VehicleWorkspaceNavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
