export type SubcompanyWorkspaceNavItem = {
  href: string;
  label: string;
  section: SubcompanyWorkspaceSection;
};

export type SubcompanyWorkspaceSection = "" | "details" | "activity" | "vehicles" | "hires";

const INTERNAL_SECTIONS = new Set<string>(["details", "activity", "vehicles", "hires"]);

export function subcompanyWorkspaceNav(subcompanyId: string): SubcompanyWorkspaceNavItem[] {
  const base = `/rental/subcompany/${subcompanyId}`;
  return [
    { href: base, label: "Overview", section: "" },
    { href: `${base}?section=details`, label: "Details", section: "details" },
    { href: `${base}?section=vehicles`, label: "Vehicles", section: "vehicles" },
    { href: `${base}?section=hires`, label: "Hires", section: "hires" },
    { href: `${base}?section=activity`, label: "Activity", section: "activity" },
  ];
}

export function subcompanyWorkspaceHref(subcompanyId: string, section: SubcompanyWorkspaceSection = "") {
  const base = `/rental/subcompany/${subcompanyId}`;
  return section ? `${base}?section=${section}` : base;
}

/** Active section from `?section=` (preferred) or legacy `/…/details` path segments. */
export function parseSubcompanyWorkspaceSection(
  pathname: string,
  subcompanyId: string,
  searchSection?: string | null,
): SubcompanyWorkspaceSection {
  const fromSearch = parseSubcompanyWorkspaceSectionParam(searchSection);
  if (fromSearch) return fromSearch;

  const base = `/rental/subcompany/${subcompanyId}`;
  if (pathname === base) return "";
  if (!pathname.startsWith(`${base}/`)) return "";
  const segment = pathname.slice(base.length + 1).split("/")[0] ?? "";
  if (INTERNAL_SECTIONS.has(segment)) return segment as SubcompanyWorkspaceSection;
  return "";
}

export function parseSubcompanyWorkspaceSectionParam(
  raw: string | null | undefined,
): SubcompanyWorkspaceSection {
  const section = raw?.trim() ?? "";
  if (!section) return "";
  if (INTERNAL_SECTIONS.has(section)) return section as SubcompanyWorkspaceSection;
  return "";
}

export function parseSubcompanyWorkspaceId(pathname: string): string | null {
  const m = pathname.match(/^\/rental\/subcompany\/([^/?]+)/);
  if (!m?.[1] || m[1] === "") return null;
  return m[1];
}

export function isSubcompanyWorkspaceNavItemActive(
  activeSection: SubcompanyWorkspaceSection,
  item: SubcompanyWorkspaceNavItem,
): boolean {
  return activeSection === item.section;
}
