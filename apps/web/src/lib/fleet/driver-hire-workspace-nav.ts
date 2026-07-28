import { driverHireDocumentsPath } from "@/lib/fleet/driver-hire-nav";

export type DriverHireWorkspaceNavItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
};

export type DriverHireWorkspaceSection =
  | ""
  | "payments"
  | "details"
  | "checkout"
  | "checkin"
  | "settlement";

export function driverHireWorkspaceNav(groupId: string, status?: string): DriverHireWorkspaceNavItem[] {
  const base = `/driver/hires/${groupId}`;
  const items: DriverHireWorkspaceNavItem[] = [
    { href: base, label: "Overview", match: "exact" },
    { href: `${base}/payments`, label: "Payments", match: "prefix" },
    { href: `${base}/details`, label: "Details", match: "prefix" },
  ];

  if (status === "reserved" || status === "active" || status === "terminated" || status === "completed") {
    items.push({ href: `${base}/checkout`, label: "Checkout", match: "prefix" });
  }
  if (status === "active" || status === "terminated" || status === "completed") {
    items.push({ href: `${base}/checkin`, label: "Check-in", match: "prefix" });
  }
  if (status === "terminated" || status === "completed") {
    items.push({ href: `${base}/settlement`, label: "Settlement", match: "prefix" });
  }

  if (status === "terminated" || status === "completed" || status === "cancelled") {
    items.push({
      href: driverHireDocumentsPath(groupId, "hire-history"),
      label: "Signed documents",
      match: "prefix",
    });
  }

  return items;
}

export function driverHireWorkspaceHref(groupId: string, section: DriverHireWorkspaceSection = "") {
  return section ? `/driver/hires/${groupId}/${section}` : `/driver/hires/${groupId}`;
}

export function parseDriverHireWorkspaceSection(
  pathname: string,
  groupId: string,
): DriverHireWorkspaceSection {
  const base = `/driver/hires/${groupId}`;
  if (pathname === base) return "";
  if (!pathname.startsWith(`${base}/`)) return "";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  if (
    segment === "payments" ||
    segment === "details" ||
    segment === "checkout" ||
    segment === "checkin" ||
    segment === "settlement"
  ) {
    return segment;
  }
  return "";
}

export function isDriverHireWorkspaceNavItemActive(
  pathname: string,
  item: DriverHireWorkspaceNavItem,
): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
