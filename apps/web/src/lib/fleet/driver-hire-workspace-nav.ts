export type DriverHireWorkspaceNavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  match: "exact" | "prefix";
};

export type DriverHireWorkspaceSection =
  | ""
  | "payments"
  | "settlement"
  | "documents"
  | "details"
  | "checkout"
  | "checkin"
  | "activity";

/** Driver hire workspace tabs — aligned with staff Summary / Inspections / Payments / Details / Activity. */
export function driverHireWorkspaceNav(groupId: string): DriverHireWorkspaceNavItem[] {
  const base = `/driver/hires/${groupId}`;
  return [
    { href: base, label: "Summary", match: "exact" },
    { href: `${base}/checkout`, label: "Inspections", match: "prefix" },
    { href: `${base}/payments`, label: "Payments", match: "prefix" },
    { href: `${base}/details`, label: "Details & documents", mobileLabel: "Details", match: "prefix" },
    { href: `${base}/activity`, label: "Activity", match: "prefix" },
  ];
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
    segment === "checkin" ||
    segment === "activity"
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
  if (item.label === "Inspections") {
    return pathname.startsWith(`${item.href}`) || pathname.includes("/checkin");
  }
  if (item.label === "Payments") {
    return pathname === item.href || pathname.startsWith(`${item.href}/`) || pathname.includes("/settlement");
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
