import { describe, expect, it } from "vitest";
import {
  responsiveTableCellClassName,
  responsiveTableCellProps,
  responsiveTableDataLabel,
} from "@/lib/ui/responsive-table";

describe("responsiveTableDataLabel", () => {
  it("uses meta dataLabel when set", () => {
    expect(responsiveTableDataLabel({ header: "Email", meta: { dataLabel: "Work email" } })).toBe("Work email");
  });

  it("falls back to string header", () => {
    expect(responsiveTableDataLabel({ header: "Vehicle" })).toBe("Vehicle");
  });

  it("returns empty string for react node headers", () => {
    expect(responsiveTableDataLabel({ header: () => null })).toBe("");
  });
});

describe("responsiveTableCellProps", () => {
  it("merges stack classes and data-label", () => {
    expect(
      responsiveTableCellProps(
        { header: "VRM", meta: { dataLabel: "VRM", tablePrimary: true } },
        "px-4 py-3",
      ),
    ).toEqual({
      "data-label": "VRM",
      className: "px-4 py-3 rph-table-primary",
    });
  });

  it("marks action cells", () => {
    expect(responsiveTableCellClassName({ tableActions: true })).toBe("rph-table-actions");
  });
});
