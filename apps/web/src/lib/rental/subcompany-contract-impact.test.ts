import { describe, expect, it } from "vitest";
import {
  buildSubcompanyChangeSummary,
  detectSubcompanySnapshotDrift,
  hasContractImpactDrift,
  sanitizeSubcompanyUpdatePatch,
} from "@/lib/rental/subcompany-contract-impact";
import {
  buildSubcompanyLegalSnapshot,
  lessorDisplayNameFromSnapshot,
} from "@/lib/rental/subcompany-legal-snapshot";
import {
  isSubcompanyWorkspaceNavItemActive,
  parseSubcompanyWorkspaceId,
  parseSubcompanyWorkspaceSection,
  subcompanyWorkspaceHref,
  subcompanyWorkspaceNav,
} from "@/lib/rental/subcompany-workspace-nav";

const liveBase = {
  name: "Branch A",
  display_name: "Branch A Trading",
  legal_name: "Branch A Ltd",
  company_number: "12345678",
  registered_address_line1: "1 High Street",
  registered_address_line2: null as string | null,
  registered_town: "London",
  registered_county: null as string | null,
  registered_postcode: "SW1A1AA",
  country: "GB",
  primary_contact_first_name: "Ada",
  primary_contact_last_name: "Lovelace",
  primary_contact_phone: "07000000000",
  primary_contact_email: "ada@example.com",
  logo_storage_path: null as string | null,
};

describe("sanitizeSubcompanyUpdatePatch", () => {
  it("rejects name and company_number", () => {
    expect(sanitizeSubcompanyUpdatePatch({ name: "X" }).ok).toBe(false);
    expect(sanitizeSubcompanyUpdatePatch({ company_number: "9" }).ok).toBe(false);
  });

  it("accepts editable fields", () => {
    const res = sanitizeSubcompanyUpdatePatch({
      legal_name: " New Legal ",
      registered_postcode: "sw1a 1aa",
      primary_contact_first_name: "Ada",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.patch.legal_name).toBe("New Legal");
    expect(res.patch.registered_postcode).toBe("SW1A1AA");
  });
});

describe("detectSubcompanySnapshotDrift", () => {
  it("detects address and contact drift against v2 snapshot", () => {
    const snap = buildSubcompanyLegalSnapshot(liveBase);
    const live = { ...liveBase, registered_town: "Manchester", primary_contact_phone: "07111111111" };
    const changes = detectSubcompanySnapshotDrift(live, snap);
    expect(changes.some((c) => c.field === "registered_town")).toBe(true);
    expect(changes.some((c) => c.field === "primary_contact_phone")).toBe(true);
    expect(hasContractImpactDrift(live, snap)).toBe(true);
  });

  it("detects legacy address-only snapshot drift", () => {
    const snap = {
      legal_name: "Branch A Ltd",
      company_number: "12345678",
      address: "Old Street, London",
    };
    const changes = detectSubcompanySnapshotDrift(liveBase, snap);
    expect(changes.some((c) => c.field === "address" || c.field === "registered_address_line1")).toBe(true);
  });

  it("returns empty when in sync", () => {
    const snap = buildSubcompanyLegalSnapshot(liveBase);
    expect(detectSubcompanySnapshotDrift(liveBase, snap)).toEqual([]);
  });
});

describe("buildSubcompanyChangeSummary / lessorDisplayName", () => {
  it("summarises changes", () => {
    expect(buildSubcompanyChangeSummary([])).toBe("No field changes.");
    expect(buildSubcompanyChangeSummary([{ field: "legal_name", label: "Legal name", from: "a", to: "b" }])).toBe(
      "Updated Legal name.",
    );
  });

  it("resolves lessor display name from snapshot", () => {
    expect(lessorDisplayNameFromSnapshot({ legal_name: "Ltd Co" })).toBe("Ltd Co");
    expect(lessorDisplayNameFromSnapshot({})).toBe("Lessor");
  });
});

describe("subcompany workspace nav", () => {
  it("builds hrefs and parses sections", () => {
    const nav = subcompanyWorkspaceNav("s1");
    expect(nav[0]).toEqual({ href: "/rental/subcompany/s1", label: "Overview", match: "exact" });
    expect(nav.find((i) => i.label === "Vehicles")).toEqual({
      href: "/rental/subcompany/s1/vehicles",
      label: "Vehicles",
      match: "prefix",
    });
    expect(nav.find((i) => i.label === "Hires")?.href).toBe("/rental/subcompany/s1/hires");
    expect(nav.find((i) => i.label === "Staff")?.external).toBe(true);
    expect(subcompanyWorkspaceHref("s1", "details")).toBe("/rental/subcompany/s1/details");
    expect(subcompanyWorkspaceHref("s1", "vehicles")).toBe("/rental/subcompany/s1/vehicles");
    expect(parseSubcompanyWorkspaceSection("/rental/subcompany/s1/details", "s1")).toBe("details");
    expect(parseSubcompanyWorkspaceSection("/rental/subcompany/s1/vehicles", "s1")).toBe("vehicles");
    expect(parseSubcompanyWorkspaceSection("/rental/subcompany/s1/hires", "s1")).toBe("hires");
    expect(parseSubcompanyWorkspaceSection("/rental/subcompany/s1", "s1")).toBe("");
    expect(parseSubcompanyWorkspaceId("/rental/subcompany/abc")).toBe("abc");
    expect(parseSubcompanyWorkspaceId("/rental/subcompany")).toBeNull();
  });

  it("marks internal nav active", () => {
    const details = { href: "/rental/subcompany/s1/details", label: "Details", match: "prefix" as const };
    expect(isSubcompanyWorkspaceNavItemActive("/rental/subcompany/s1/details", details)).toBe(true);
    const vehicles = {
      href: "/rental/subcompany/s1/vehicles",
      label: "Vehicles",
      match: "prefix" as const,
    };
    expect(isSubcompanyWorkspaceNavItemActive("/rental/subcompany/s1/vehicles", vehicles)).toBe(true);
    const staff = {
      href: "/rental/staff",
      label: "Staff",
      match: "exact" as const,
      external: true,
    };
    expect(isSubcompanyWorkspaceNavItemActive("/rental/staff", staff)).toBe(false);
  });
});
