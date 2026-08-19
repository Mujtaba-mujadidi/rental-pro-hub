import { describe, expect, it } from "vitest";
import type { HireGroupAuditRow } from "@/lib/fleet/hire-audit";
import {
  buildHireActivityExportCsv,
  buildHireActivityItems,
  DRIVER_HIRE_ACTIVITY_EVENT_TYPES,
  hireActivityActorRoleLabel,
  hireActivityExportFileName,
  hireActivityKind,
  hireActivityTitle,
} from "@/lib/fleet/hire-activity-display";

function event(partial: Partial<HireGroupAuditRow> & Pick<HireGroupAuditRow, "id" | "event_type">): HireGroupAuditRow {
  return {
    actor_user_id: null,
    actor_role: "company_staff",
    summary: "Event summary.",
    metadata: {},
    created_at: "2026-08-09T11:30:00.000Z",
    ...partial,
  };
}

describe("hireActivityTitle", () => {
  it("maps known event types to workspace titles", () => {
    expect(hireActivityTitle("hire_terminated")).toBe("Hire ended");
    expect(hireActivityTitle("driver_charge_added")).toBe("Extra charge added");
    expect(hireActivityTitle("driver_charge_payment_submitted")).toBe("Extra charge payment submitted");
    expect(hireActivityTitle("driver_charge_payment_approved")).toBe("Extra charge payment approved");
    expect(hireActivityTitle("driver_charge_payment_rejected")).toBe("Extra charge payment rejected");
    expect(hireActivityKind("driver_charge_amended")).toBe("charge");
    expect(hireActivityTitle("checkout_completed")).toBe("Vehicle checked out");
    expect(hireActivityTitle("settlement_refund_recorded")).toBe("Refund recorded");
  });
});

describe("hireActivityKind", () => {
  it("groups events for timeline icons", () => {
    expect(hireActivityKind("deposit_refund_recorded")).toBe("payment");
    expect(hireActivityKind("driver_charge_payment_submitted")).toBe("payment");
    expect(hireActivityKind("driver_charge_payment_rejected")).toBe("warn");
    expect(hireActivityKind("checkin_completed")).toBe("inspection");
    expect(hireActivityKind("hire_cancelled")).toBe("warn");
    expect(hireActivityKind("hire_terminated")).toBe("status");
  });
});

describe("buildHireActivityItems", () => {
  it("lists newest events first", () => {
    const items = buildHireActivityItems(
      [
        event({ id: "older", event_type: "checkout_completed", created_at: "2026-07-28T09:18:00.000Z" }),
        event({ id: "newer", event_type: "hire_terminated", created_at: "2026-08-08T14:58:00.000Z" }),
      ],
      { audience: "staff" },
    );
    expect(items.map((item) => item.id)).toEqual(["newer", "older"]);
  });

  it("uses UK compact timestamps", () => {
    const [item] = buildHireActivityItems(
      [event({ id: "1", event_type: "hire_terminated", created_at: "2026-08-09T11:30:00.000Z" })],
      { audience: "staff" },
    );
    expect(item?.dateLabel).toMatch(/Aug 2026/);
    expect(item?.timeLabel).toMatch(/^\d{2}:\d{2}$/);
    expect(item?.timestampLabel).toContain(item?.dateLabel ?? "");
  });

  it("includes recorded-by copy for staff and omits it for drivers", () => {
    const row = event({
      id: "1",
      event_type: "checkin_completed",
      actor_user_id: "staff-1",
      actor_role: "company_staff",
    });
    const staff = buildHireActivityItems([row], {
      audience: "staff",
      actorNames: { "staff-1": "Mujtaba Ghulamfarooq" },
    });
    const driver = buildHireActivityItems([row], { audience: "driver" });
    expect(staff[0]?.recordedByLabel).toBe("Recorded by Mujtaba Ghulamfarooq · Company staff");
    expect(driver[0]?.recordedByLabel).toBeNull();
  });

  it("hides internal events from the driver timeline", () => {
    const items = buildHireActivityItems(
      [
        event({ id: "draft", event_type: "draft_created" }),
        event({ id: "checkin", event_type: "checkin_completed" }),
        event({ id: "pdfs", event_type: "hire_pdfs_refreshed" }),
      ],
      { audience: "driver" },
    );
    expect(items.map((item) => item.id)).toEqual(["checkin"]);
    expect(DRIVER_HIRE_ACTIVITY_EVENT_TYPES.has("draft_created")).toBe(false);
  });
});

describe("hireActivityActorRoleLabel", () => {
  it("labels known actor roles", () => {
    expect(hireActivityActorRoleLabel("company_staff")).toBe("Company staff");
    expect(hireActivityActorRoleLabel("driver")).toBe("Driver");
    expect(hireActivityActorRoleLabel("system")).toBe("System");
  });
});

describe("buildHireActivityExportCsv", () => {
  it("includes recorded-by for staff exports only", () => {
    const items = buildHireActivityItems(
      [
        event({
          id: "1",
          event_type: "hire_terminated",
          summary: 'Ended with a "refund" position.',
        }),
      ],
      { audience: "staff" },
    );
    const staffCsv = buildHireActivityExportCsv(items, "staff");
    const driverCsv = buildHireActivityExportCsv(items, "driver");
    expect(staffCsv).toContain("Recorded by");
    expect(driverCsv).not.toContain("Recorded by");
    expect(staffCsv).toContain('""refund""');
  });

  it("replaces dashes and other non-ASCII punctuation so Excel does not show mojibake", () => {
    const items = buildHireActivityItems(
      [
        event({
          id: "1",
          event_type: "hire_terminated",
          summary: "Contract ended — refund of £100.00 saved.",
        }),
      ],
      { audience: "staff" },
    );
    const csv = buildHireActivityExportCsv(items, "staff");
    expect(csv).toContain("Contract ended - refund of GBP 100.00 saved.");
    expect(csv).not.toMatch(/[^\uFEFF\t\n\r\x20-\x7E,]/);
  });
});

describe("hireActivityExportFileName", () => {
  it("uses a stable hire-prefixed csv name", () => {
    expect(hireActivityExportFileName("abcdefgh-1234")).toBe("hire-activity-abcdefgh.csv");
  });
});
