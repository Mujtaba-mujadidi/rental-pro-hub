import { describe, expect, it } from "vitest";
import {
  buildSubcompanyHiresStats,
  isSubcompanyCurrentHireStatus,
  subcompanyHireAgreementBadge,
  subcompanyHirePeriodLabel,
  subcompanyHireRentLabel,
  subcompanyHireStatusBadge,
} from "@/lib/rental/subcompany-hires-display";

const base = {
  status: "active",
  start_date: "2026-08-02",
  activated_at: null,
  terminated_at: null,
  ended_at: null,
  rent_amount_gbp: 45,
  rent_cadence: "day",
  esign_label: "Fully signed",
  esign_tone: "success" as const,
  signed_agreement_count: 1,
  agreement_count: 1,
  can_view_signed_documents: true,
  driver_name: "Active driver",
  driver_email: null,
  driver_label: null,
};

describe("subcompany hire display", () => {
  it("formats period and rent for active hires", () => {
    expect(subcompanyHirePeriodLabel(base)).toBe("2 Aug 2026 — Ongoing");
    expect(subcompanyHireRentLabel(base)).toBe("£45.00 / Day");
    expect(subcompanyHireRentLabel({ rent_amount_gbp: 45, rent_cadence: "daily" })).toBe(
      "£45.00 / Day",
    );
  });

  it("formats scheduled starts", () => {
    expect(
      subcompanyHirePeriodLabel({
        ...base,
        status: "reserved",
        start_date: "2026-08-16",
      }),
    ).toBe("Starts 16 Aug 2026");
  });

  it("maps agreement and status badges", () => {
    expect(subcompanyHireAgreementBadge(base)).toEqual({ label: "Signed", tone: "success" });
    expect(subcompanyHireStatusBadge("active").label).toBe("Active");
    expect(subcompanyHireStatusBadge("pending_signature").label).toBe("Scheduled");
    expect(isSubcompanyCurrentHireStatus("active")).toBe(true);
  });

  it("builds overview stats", () => {
    const stats = buildSubcompanyHiresStats(
      [
        base,
        { ...base, status: "reserved", start_date: "2026-08-16" },
        {
          ...base,
          status: "completed",
          ended_at: "2026-08-10T12:00:00.000Z",
        },
      ],
      3080,
      "2026-08-15",
    );
    expect(stats.activeCount).toBe(1);
    expect(stats.scheduledCount).toBe(1);
    expect(stats.completedThisMonthCount).toBe(1);
    expect(stats.incomeThisMonthLabel).toBe("£3,080.00");
  });
});
