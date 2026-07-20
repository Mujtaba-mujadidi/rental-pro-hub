import { describe, expect, it } from "vitest";
import { hashTermsBody } from "@/lib/contract-terms/hash";
import { stripTagsToPlain, truncatePreview } from "@/lib/contract-terms/plain-preview";

describe("hashTermsBody", () => {
  it("returns stable sha256 hex", () => {
    expect(hashTermsBody("hello")).toBe(hashTermsBody("hello"));
    expect(hashTermsBody("hello")).toMatch(/^[a-f0-9]{64}$/);
    expect(hashTermsBody("hello")).not.toBe(hashTermsBody("hello!"));
  });
});

describe("stripTagsToPlain", () => {
  it("removes tags, scripts, styles, and collapses space", () => {
    expect(stripTagsToPlain("<p>Hi&nbsp;<b>there</b></p>")).toBe("Hi there");
    expect(stripTagsToPlain("<script>evil()</script><style>.x{}</style>Ok")).toBe("Ok");
  });
});

describe("truncatePreview", () => {
  it("returns unchanged when under max", () => {
    expect(truncatePreview("short", 120)).toBe("short");
  });

  it("truncates with ellipsis", () => {
    expect(truncatePreview("abcdefghij", 5)).toBe("abcd…");
  });
});
