import { describe, expect, it } from "vitest";
import {
  buildSubcompanyPortfolioPayload,
  subcompanyInitials,
  subcompanyPortfolioCardDetail,
  subcompanyPortfolioCardTone,
} from "@/lib/rental/subcompanies-portfolio-display";

describe("subcompanyInitials", () => {
  it("uses first letters of the first two words", () => {
    expect(subcompanyInitials("Oxus Cars Ltd")).toBe("OC");
    expect(subcompanyInitials("Regal Car Hire Limited")).toBe("RC");
    expect(subcompanyInitials("Select Me Ltd")).toBe("SM");
  });
});

describe("subcompanyPortfolioCardDetail", () => {
  it("uses primary copy for the main company", () => {
    expect(
      subcompanyPortfolioCardDetail({ isPrimary: true, vehicleCount: 1, attentionCount: 0 }),
    ).toBe("Primary account and billing entity");
  });

  it("surfaces attention on the primary company so totals match the summary", () => {
    expect(
      subcompanyPortfolioCardDetail({ isPrimary: true, vehicleCount: 1, attentionCount: 1 }),
    ).toBe("Primary account and billing entity · 1 needs attention");
  });

  it("describes attention and healthy fleets", () => {
    expect(
      subcompanyPortfolioCardDetail({ isPrimary: false, vehicleCount: 7, attentionCount: 1 }),
    ).toBe("7 fleet vehicles · 1 needs attention");
    expect(
      subcompanyPortfolioCardDetail({ isPrimary: false, vehicleCount: 1, attentionCount: 0 }),
    ).toBe("1 fleet vehicle · all documents current");
  });
});

describe("subcompanyPortfolioCardTone", () => {
  it("maps primary / attention / ok", () => {
    expect(subcompanyPortfolioCardTone({ isPrimary: true, attentionCount: 9 })).toBe("primary");
    expect(subcompanyPortfolioCardTone({ isPrimary: false, attentionCount: 1 })).toBe("attention");
    expect(subcompanyPortfolioCardTone({ isPrimary: false, attentionCount: 0 })).toBe("ok");
  });
});

describe("buildSubcompanyPortfolioPayload", () => {
  it("sorts primary first and builds summary totals", () => {
    const payload = buildSubcompanyPortfolioPayload([
      {
        id: "s2",
        name: "Select Me Ltd",
        isPrimary: false,
        vehicleCount: 1,
        activeHireCount: 1,
        attentionCount: 0,
      },
      {
        id: "s1",
        name: "Oxus Cars Ltd",
        isPrimary: true,
        vehicleCount: 1,
        activeHireCount: 0,
        attentionCount: 0,
      },
      {
        id: "s3",
        name: "Regal Car Hire Limited",
        isPrimary: false,
        vehicleCount: 7,
        activeHireCount: 4,
        attentionCount: 1,
      },
    ]);

    expect(payload.cards.map((c) => c.id)).toEqual(["s1", "s3", "s2"]);
    expect(payload.cards[0]?.badgeLabel).toBe("Main company");
    expect(payload.cards[1]?.tone).toBe("attention");
    expect(payload.summary).toEqual({
      companyCount: 3,
      fleetVehicleCount: 9,
      activeHireCount: 5,
      needsAttentionCount: 1,
    });
  });
});
