import { describe, expect, it } from "vitest";
import {
  buildHireListStats,
  defaultHireListTab,
  hireListMatchesTab,
  hireListNeedsAction,
  hireListPeriodLabel,
  hireListProgress,
  hireListRentLabel,
  type HireListRowLike,
} from "@/lib/fleet/hire-list-tabs";

function row(partial: Partial<HireListRowLike> = {}): HireListRowLike {
  return {
    status: "active",
    wizard_step: 1,
    start_date: "2026-08-10",
    activated_at: null,
    terminated_at: null,
    ended_at: null,
    rent_amount_gbp: 10,
    rent_cadence: "day",
    lifecycle_label: null,
    lifecycle_tone: "neutral",
    can_prepare_for_signature: false,
    can_send_for_signature: false,
    esign_label: "Fully signed",
    esign_tone: "success",
    driver_access_status: "approved",
    driver_access_label: "Approved",
    driver_access_tone: "success",
    ...partial,
  };
}

describe("hireListNeedsAction", () => {
  it("flags drafts and lifecycle next steps", () => {
    expect(hireListNeedsAction(row({ status: "draft" }))).toBe(true);
    expect(
      hireListNeedsAction(
        row({ lifecycle_label: "Awaiting checkout", lifecycle_tone: "warning" }),
      ),
    ).toBe(true);
  });

  it("flags signing and driver-access blockers", () => {
    expect(
      hireListNeedsAction(
        row({ status: "pending_signature", can_send_for_signature: true }),
      ),
    ).toBe(true);
    expect(
      hireListNeedsAction(
        row({
          status: "active",
          driver_access_status: "pending",
          driver_access_label: "Pending approval",
          driver_access_tone: "pending",
        }),
      ),
    ).toBe(true);
  });

  it("does not flag a healthy active hire", () => {
    expect(hireListNeedsAction(row())).toBe(false);
  });
});

describe("hireListMatchesTab / stats", () => {
  it("buckets statuses into tabs", () => {
    expect(hireListMatchesTab(row({ status: "active" }), "active")).toBe(true);
    expect(hireListMatchesTab(row({ status: "reserved" }), "scheduled")).toBe(true);
    expect(hireListMatchesTab(row({ status: "pending_signature" }), "scheduled")).toBe(true);
    expect(hireListMatchesTab(row({ status: "completed" }), "ended")).toBe(true);
    expect(hireListMatchesTab(row({ status: "terminated" }), "ended")).toBe(true);
    expect(hireListMatchesTab(row({ status: "draft" }), "all")).toBe(true);
    expect(hireListMatchesTab(row({ status: "draft" }), "needs_action")).toBe(true);
  });

  it("keeps drafts and ended out of Active/Scheduled", () => {
    const draft = row({ status: "draft" });
    const completed = row({ status: "completed", ended_at: "2026-08-01T12:00:00.000Z" });
    expect(hireListMatchesTab(draft, "active")).toBe(false);
    expect(hireListMatchesTab(draft, "scheduled")).toBe(false);
    expect(hireListMatchesTab(draft, "ended")).toBe(false);
    expect(hireListMatchesTab(completed, "active")).toBe(false);
    expect(hireListMatchesTab(completed, "scheduled")).toBe(false);
  });

  it("puts lifecycle blockers on Needs action while still matching lifecycle tabs", () => {
    const activeCheckout = row({
      status: "active",
      lifecycle_label: "Awaiting checkout",
      lifecycle_tone: "warning",
    });
    expect(hireListMatchesTab(activeCheckout, "active")).toBe(true);
    expect(hireListMatchesTab(activeCheckout, "needs_action")).toBe(true);

    const reservedOk = row({
      status: "reserved",
      esign_label: "Fully signed",
      esign_tone: "success",
      driver_access_status: "approved",
      driver_access_tone: "success",
    });
    expect(hireListMatchesTab(reservedOk, "scheduled")).toBe(true);
    expect(hireListMatchesTab(reservedOk, "needs_action")).toBe(false);
  });

  it("builds KPI counts with UK month for completed", () => {
    const stats = buildHireListStats(
      [
        row(),
        row({ status: "reserved" }),
        row({
          status: "completed",
          ended_at: "2026-08-05T12:00:00.000Z",
        }),
        row({
          status: "terminated",
          terminated_at: "2026-07-20T12:00:00.000Z",
        }),
        row({ status: "draft" }),
      ],
      "2026-08-16",
    );
    expect(stats.activeCount).toBe(1);
    expect(stats.scheduledCount).toBe(1);
    expect(stats.completedThisMonthCount).toBe(1);
    expect(stats.needsActionCount).toBe(1);
    expect(defaultHireListTab(stats)).toBe("needs_action");
  });

  it("defaults to active when nothing needs action", () => {
    expect(defaultHireListTab(buildHireListStats([row()], "2026-08-16"))).toBe("active");
  });
});

describe("hireList display helpers", () => {
  it("formats period and rent from real fields", () => {
    expect(hireListPeriodLabel(row())).toBe("10 Aug 2026 — Ongoing");
    expect(hireListPeriodLabel(row({ status: "reserved", start_date: "2026-08-20" }))).toBe(
      "Starts 20 Aug 2026",
    );
    expect(hireListRentLabel(row())).toBe("£10.00 / Day");
  });

  it("builds progress from lifecycle or Ready when healthy", () => {
    expect(
      hireListProgress(
        row({ lifecycle_label: "Awaiting check-in", lifecycle_tone: "warning" }),
      ).label,
    ).toBe("Awaiting check-in");
    const ready = hireListProgress(row());
    expect(ready.label).toBe("Ready");
    expect(ready.detail).toBe("Access on · E-sign complete");
  });
});
