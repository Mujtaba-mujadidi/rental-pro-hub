/** Hire workspace section pills (mirrors vehicle-workspace-nav). */
export type HireWorkspaceNavItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
};

export type HireWorkspaceSection = "" | "payments" | "documents" | "details" | "activity";

export function hireWorkspaceNav(groupId: string): HireWorkspaceNavItem[] {
  const base = `/rental/hires/${groupId}`;
  return [
    { href: base, label: "Overview", match: "exact" },
    { href: `${base}/payments`, label: "Payments", match: "prefix" },
    { href: `${base}/details`, label: "Details", match: "prefix" },
    { href: `${base}/documents`, label: "Documents", match: "prefix" },
    { href: `${base}/activity`, label: "Activity", match: "prefix" },
  ];
}

export function hireWorkspaceHref(groupId: string, section: HireWorkspaceSection = "") {
  return section ? `/rental/hires/${groupId}/${section}` : `/rental/hires/${groupId}`;
}

export function parseHireWorkspaceSection(pathname: string, groupId: string): HireWorkspaceSection {
  const base = `/rental/hires/${groupId}`;
  if (pathname === base) return "";
  if (!pathname.startsWith(`${base}/`)) return "";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  if (segment === "payments" || segment === "documents" || segment === "details" || segment === "activity") {
    return segment;
  }
  return "";
}

export function parseHireWorkspaceGroupId(pathname: string): string | null {
  const m = pathname.match(/^\/rental\/hires\/([^/]+)/);
  return m?.[1] ?? null;
}

export function isHireWorkspaceNavItemActive(pathname: string, item: HireWorkspaceNavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
