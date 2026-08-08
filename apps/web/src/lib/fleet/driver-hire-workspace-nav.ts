export type DriverHireWorkspaceNavItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
};

export type DriverHireWorkspaceSection =
  | ""
  | "payments"
  | "settlement"
  | "documents"
  | "details"
  | "checkout"
  | "checkin";

/** Driver hire workspace pills — mirrors rental staff tab order (without Activity). */
export function driverHireWorkspaceNav(groupId: string, status?: string): DriverHireWorkspaceNavItem[] {
  const base = `/driver/hires/${groupId}`;
  const paymentsLabel =
    status === "terminated" || status === "completed" ? "Payments & settlement" : "Payments";
  const items: DriverHireWorkspaceNavItem[] = [
    { href: base, label: "Overview", match: "exact" },
    { href: `${base}/payments`, label: paymentsLabel, match: "prefix" },
    { href: `${base}/details`, label: "Details", match: "prefix" },
  ];

  if (status === "reserved" || status === "active" || status === "terminated" || status === "completed") {
    items.splice(1, 0, { href: `${base}/checkout`, label: "Checkout", match: "prefix" });
  }
  if (status === "terminated" || status === "completed") {
    items.splice(2, 0, { href: `${base}/checkin`, label: "Check-in", match: "prefix" });
    items.splice(3, 0, { href: `${base}/settlement`, label: "Settlement", match: "prefix" });
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
    segment === "settlement" ||
    segment === "documents" ||
    segment === "details" ||
    segment === "checkout" ||
    segment === "checkin"
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
