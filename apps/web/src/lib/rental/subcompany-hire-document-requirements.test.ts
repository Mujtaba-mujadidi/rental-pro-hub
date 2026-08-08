import { describe, expect, it } from "vitest";
import {
  hireEndedStatusLabel,
  hireIsEndedForSubcompanyDocumentImpact,
} from "@/lib/rental/subcompany-hire-document-requirements";

describe("hireIsEndedForSubcompanyDocumentImpact", () => {
  it("treats terminated, completed, and cancelled hires as ended", () => {
    expect(hireIsEndedForSubcompanyDocumentImpact("terminated")).toBe(true);
    expect(hireIsEndedForSubcompanyDocumentImpact("completed")).toBe(true);
    expect(hireIsEndedForSubcompanyDocumentImpact("cancelled")).toBe(true);
  });

  it("does not treat active or reserved hires as ended", () => {
    expect(hireIsEndedForSubcompanyDocumentImpact("active")).toBe(false);
    expect(hireIsEndedForSubcompanyDocumentImpact("reserved")).toBe(false);
  });
});

describe("hireEndedStatusLabel", () => {
  it("returns human labels for ended statuses", () => {
    expect(hireEndedStatusLabel("terminated")).toBe("Contract ended");
    expect(hireEndedStatusLabel("completed")).toBe("Hire completed");
    expect(hireEndedStatusLabel("active")).toBeNull();
  });
});
