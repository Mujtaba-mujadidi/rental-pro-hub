import { describe, expect, it } from "vitest";
import {
  ESIGN_OWNER_ROLE,
  ESIGN_RECIPIENT_ROLE,
  fieldsForRole,
  layoutHasRoleSignature,
  normalizeFieldRole,
} from "@/lib/esign/roles";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";

const field = (partial: Partial<EsignFieldLayoutItem> & Pick<EsignFieldLayoutItem, "id" | "type">): EsignFieldLayoutItem => ({
  page: 1,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  role: ESIGN_RECIPIENT_ROLE,
  ...partial,
});

describe("normalizeFieldRole", () => {
  it("maps empty and legacy signer to recipient", () => {
    expect(normalizeFieldRole(null)).toBe(ESIGN_RECIPIENT_ROLE);
    expect(normalizeFieldRole(undefined)).toBe(ESIGN_RECIPIENT_ROLE);
    expect(normalizeFieldRole("")).toBe(ESIGN_RECIPIENT_ROLE);
    expect(normalizeFieldRole("signer")).toBe(ESIGN_RECIPIENT_ROLE);
  });

  it("keeps other roles", () => {
    expect(normalizeFieldRole(ESIGN_OWNER_ROLE)).toBe(ESIGN_OWNER_ROLE);
  });
});

describe("fieldsForRole / layoutHasRoleSignature", () => {
  const layout = [
    field({ id: "1", type: "signature", role: "owner" }),
    field({ id: "2", type: "date", role: "owner" }),
    field({ id: "3", type: "signature", role: "signer" }),
  ];

  it("filters by normalized role", () => {
    expect(fieldsForRole(layout, "owner")).toHaveLength(2);
    expect(fieldsForRole(layout, "recipient")).toHaveLength(1);
  });

  it("detects signature for role", () => {
    expect(layoutHasRoleSignature(layout, "owner")).toBe(true);
    expect(layoutHasRoleSignature(layout, "recipient")).toBe(true);
    expect(layoutHasRoleSignature([field({ id: "d", type: "date", role: "owner" })], "owner")).toBe(false);
  });
});
