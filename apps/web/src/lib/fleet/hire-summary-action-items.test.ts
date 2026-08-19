import { describe, expect, it } from "vitest";
import { buildHireDocumentExpiryAttentionItem } from "@/lib/fleet/hire-document-expiry-attention";
import { buildHireSummaryActionItems } from "@/lib/fleet/hire-summary-action-items";
import type { HireLifecycleAttentionItem } from "@/lib/fleet/hire-lifecycle-attention";

describe("buildHireDocumentExpiryAttentionItem", () => {
  it("aggregates expiring vehicle and driver documents with a count", () => {
    const item = buildHireDocumentExpiryAttentionItem({
      hireGroupId: "g1",
      vehicle: {
        mot_expiry: "2026-08-12",
        tax_expiry: "2027-01-01",
        phv_licence_expiry: "2026-08-11",
      },
      driver: {
        driving_licence_expiry: "2026-08-15",
        phv_licence_expiry: "2027-01-01",
      },
      settings: {
        notify_mot_days_before: 30,
        notify_tax_days_before: 5,
        notify_phv_licence_days_before: 30,
        notify_contract_expiry_days_before: 28,
        notify_insurance_days_before: 28,
      },
      detailsHref: "/rental/hires/g1/details",
    });

    expect(item?.title).toBe("Documents expire during hire");
    expect(item?.detail).toMatch(/^3 documents:/);
    expect(item?.detail).toContain("MOT");
    expect(item?.detail).toContain("driver licences");
  });
});

describe("buildHireSummaryActionItems", () => {
  it("excludes informational hire-active lifecycle item", () => {
    const lifecycle: HireLifecycleAttentionItem[] = [
      {
        kind: "awaiting_termination",
        title: "Hire is active",
        detail: "End the contract when the rental period finishes to settle accounts and unlock check-in.",
        href: "/rental/hires/g1",
      },
      {
        kind: "awaiting_insurance_upload",
        title: "Hire insurance required",
        detail: "Upload a certificate",
        href: "/rental/hires/g1/details",
      },
    ];

    const items = buildHireSummaryActionItems({
      lifecycleAttentionItems: lifecycle,
      attentionItems: [
        { kind: "due", rowId: "r1", title: "Day 1 rent", amountGbp: 10 },
      ],
      position: {
        depositOutstandingGbp: 100,
        rentDueToDateGbp: 10,
        rentOutstandingGbp: 10,
        rentPaidGbp: 0,
        currentlyDueGbp: 110,
        extraChargesOutstandingGbp: 0,
        dueBreakdownLabel: null,
      },
      paymentsHref: "/rental/hires/g1/payments",
      includeDeposit: true,
    });

    expect(items.some((item) => item.title === "Hire is active")).toBe(false);
    expect(items.some((item) => item.title === "Hire insurance required")).toBe(true);
    expect(items.some((item) => item.title === "Deposit has not been paid")).toBe(true);
    expect(items.find((item) => item.title === "Day 1 rent")?.detail).toBe("£10.00 due today");
    expect(items.find((item) => item.title === "Deposit has not been paid")?.icon).toBe("pound");
  });
});
