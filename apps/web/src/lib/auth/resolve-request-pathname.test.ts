import { describe, expect, it } from "vitest";
import {
  resolveRequestPathname,
  resolveRequestPathnameForRedirect,
} from "@/lib/auth/resolve-request-pathname";

function headers(map: Record<string, string>) {
  return (name: string) => map[name.toLowerCase()] ?? map[name] ?? null;
}

describe("resolveRequestPathname", () => {
  it("prefers x-pathname from middleware", () => {
    expect(
      resolveRequestPathname(headers({ "x-pathname": "/rental/awaiting-contract" })),
    ).toBe("/rental/awaiting-contract");
  });

  it("falls back to next-url when x-pathname is missing", () => {
    expect(
      resolveRequestPathname(headers({ "next-url": "/rental/vehicles?tab=1" })),
    ).toBe("/rental/vehicles");
  });

  it("falls back to referer when other headers are missing", () => {
    expect(
      resolveRequestPathname(headers({ referer: "http://localhost:3002/rental/onboarding" })),
    ).toBe("/rental/onboarding");
  });

  it("returns null instead of guessing when pathname is unknown", () => {
    expect(resolveRequestPathname(headers({}))).toBeNull();
  });
});

describe("resolveRequestPathnameForRedirect", () => {
  it("uses x-pathname and next-url but not referer", () => {
    expect(
      resolveRequestPathnameForRedirect(headers({ "x-pathname": "/rental/contract" })),
    ).toBe("/rental/contract");
    expect(
      resolveRequestPathnameForRedirect(headers({ "next-url": "/rental/vehicles" })),
    ).toBe("/rental/vehicles");
    expect(
      resolveRequestPathnameForRedirect(headers({ referer: "http://localhost:3002/rental/onboarding" })),
    ).toBeNull();
  });
});
