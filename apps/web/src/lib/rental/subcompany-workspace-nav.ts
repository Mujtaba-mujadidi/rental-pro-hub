export type SubcompanyWorkspaceNavItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
  /** Links that leave the subcompany workspace (e.g. Staff). */
  external?: boolean;
};

export type SubcompanyWorkspaceSection = "" | "details" | "activity" | "vehicles" | "hires";

const INTERNAL_SECTIONS = new Set<string>(["details", "activity", "vehicles", "hires"]);

export function subcompanyWorkspaceNav(subcompanyId: string): SubcompanyWorkspaceNavItem[] {
  const base = `/rental/subcompany/${subcompanyId}`;
  return [
    { href: base, label: "Overview", match: "exact" },
    { href: `${base}/details`, label: "Details", match: "prefix" },
    { href: `${base}/vehicles`, label: "Vehicles", match: "prefix" },
    { href: `${base}/hires`, label: "Hires", match: "prefix" },
    { href: "/rental/staff", label: "Staff", match: "exact", external: true },
    { href: `${base}/activity`, label: "Activity", match: "prefix" },
  ];
}

export function subcompanyWorkspaceHref(subcompanyId: string, path: SubcompanyWorkspaceSection = "") {
  return path ? `/rental/subcompany/${subcompanyId}/${path}` : `/rental/subcompany/${subcompanyId}`;
}

export function parseSubcompanyWorkspaceSection(
  pathname: string,
  subcompanyId: string,
): SubcompanyWorkspaceSection {
  const base = `/rental/subcompany/${subcompanyId}`;
  if (pathname === base) return "";
  if (!pathname.startsWith(`${base}/`)) return "";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  if (INTERNAL_SECTIONS.has(segment)) return segment as SubcompanyWorkspaceSection;
  return "";
}

export function parseSubcompanyWorkspaceId(pathname: string): string | null {
  const m = pathname.match(/^\/rental\/subcompany\/([^/]+)/);
  if (!m?.[1] || m[1] === "") return null;
  return m[1];
}

export function isSubcompanyWorkspaceNavItemActive(
  pathname: string,
  item: SubcompanyWorkspaceNavItem,
): boolean {
  if (item.external) return false;
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
