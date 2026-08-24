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
  synthesizeExtraChargePaymentActivityEvents,
  synthesizeSchedulePaymentActivityEvents,
  synthesizeSettlementBalancePaymentActivityEvents,
} from "@/lib/fleet/hire-activity-display";

function event(
  partial: Partial<HireGroupAuditRow> & Pick<HireGroupAuditRow, "id" | "event_type">,
): HireGroupAuditRow {
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
    expect(hireActivityTitle("driver_charge_voided")).toBe("Extra charge voided");
    expect(hireActivityTitle("driver_charge_payment_submitted")).toBe("Extra charge payment submitted");
    expect(hireActivityTitle("driver_charge_payment_approved")).toBe("Extra charge payment approved");
    expect(hireActivityTitle("driver_charge_payment_rejected")).toBe("Extra charge payment rejected");
    expect(hireActivityTitle("driver_charge_payment_recorded")).toBe("Extra charge payment recorded");
    expect(hireActivityTitle("schedule_payment_submitted")).toBe("Schedule payment submitted");
    expect(hireActivityTitle("schedule_payment_approved")).toBe("Schedule payment approved");
    expect(hireActivityTitle("schedule_discount_changed")).toBe("Schedule discount updated");
    expect(hireActivityTitle("settlement_balance_payment_recorded")).toBe("Settlement payment recorded");
    expect(hireActivityTitle("checkout_completed")).toBe("Vehicle checked out");
    expect(hireActivityTitle("settlement_refund_recorded")).toBe("Refund recorded");
  });
});

describe("hireActivityKind", () => {
  it("groups events for timeline icons", () => {
    expect(hireActivityKind("deposit_refund_recorded")).toBe("payment");
    expect(hireActivityKind("driver_charge_payment_submitted")).toBe("payment");
    expect(hireActivityKind("driver_charge_payment_rejected")).toBe("warn");
    expect(hireActivityKind("driver_charge_amended")).toBe("charge");
    expect(hireActivityKind("checkin_completed")).toBe("inspection");
    expect(hireActivityKind("hire_cancelled")).toBe("warn");
    expect(hireActivityKind("hire_terminated")).toBe("status");
  });
});

describe("synthesizeExtraChargePaymentActivityEvents", () => {
  it("adds activity rows for balance payments without audit events", () => {
    const merged = synthesizeExtraChargePaymentActivityEvents(
      [event({ id: "charge-added", event_type: "driver_charge_added", summary: "Added £40." })],
      [
        {
          id: "pay-1",
          amountGbp: 25,
          paidAt: "2026-08-17T14:00:00.000Z",
          recordedByUserId: "staff-1",
        },
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      id: "balance-payment:pay-1",
      event_type: "driver_charge_payment_recorded",
      actor_user_id: "staff-1",
      summary: "Recorded £25.00 against extra charges.",
    });
  });

  it("skips payments already linked from audit metadata", () => {
    const merged = synthesizeExtraChargePaymentActivityEvents(
      [
        event({
          id: "logged",
          event_type: "driver_charge_payment_recorded",
          summary: "Recorded £25.00 against extra charges.",
          metadata: { balancePaymentId: "pay-1", amountGbp: 25 },
        }),
      ],
      [{ id: "pay-1", amountGbp: 25, paidAt: "2026-08-17T14:00:00.000Z" }],
    );
    expect(merged).toHaveLength(1);
  });

  it("surfaces synthesized payments on staff and driver timelines", () => {
    const merged = synthesizeExtraChargePaymentActivityEvents([], [
      { id: "pay-2", amountGbp: 10, paidAt: "2026-08-17T15:00:00.000Z" },
    ]);
    const staff = buildHireActivityItems(merged, { audience: "staff" });
    const driver = buildHireActivityItems(merged, { audience: "driver" });
    expect(staff[0]?.title).toBe("Extra charge payment recorded");
    expect(driver[0]?.title).toBe("Extra charge payment recorded");
  });
});

describe("synthesizeSchedulePaymentActivityEvents", () => {
  const statusBase = {
    scheduleRowId: "sched-1",
    rowKind: "rent" as const,
    periodStart: "2026-08-01",
    periodEnd: "2026-08-07",
    eventKind: "status_change",
    comment: null,
    amendmentPayload: { submittedAmountGbp: 120 } as Record<string, unknown>,
    actorUserId: "driver-1",
    actorRole: "driver" as const,
    createdAt: "2026-08-17T12:00:00.000Z",
  };

  it("maps pending approval status events into Activity", () => {
    const merged = synthesizeSchedulePaymentActivityEvents([], [
      {
        ...statusBase,
        id: "status-1",
        fromStatus: "not_received",
        toStatus: "pending_approval",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      event_type: "schedule_payment_submitted",
      summary: expect.stringContaining("£120.00"),
    });
    expect(merged[0]?.summary).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("skips status events already linked from audit metadata", () => {
    const merged = synthesizeSchedulePaymentActivityEvents(
      [
        event({
          id: "logged",
          event_type: "schedule_payment_submitted",
          metadata: { paymentStatusEventId: "status-1", scheduleRowId: "sched-1" },
        }),
      ],
      [
        {
          ...statusBase,
          id: "status-1",
          fromStatus: "not_received",
          toStatus: "pending_approval",
        },
      ],
    );
    expect(merged).toHaveLength(1);
  });

  it("skips near-duplicate logged Activity rows without status event ids", () => {
    const merged = synthesizeSchedulePaymentActivityEvents(
      [
        event({
          id: "logged",
          event_type: "schedule_payment_approved",
          created_at: "2026-08-17T12:00:01.000Z",
          metadata: { scheduleRowId: "sched-1", amountGbp: 120 },
        }),
      ],
      [
        {
          ...statusBase,
          id: "status-2",
          fromStatus: "pending_approval",
          toStatus: "approved",
          actorRole: "company_staff",
          amendmentPayload: { approvedAmountGbp: 120 },
          createdAt: "2026-08-17T12:00:00.000Z",
        },
      ],
    );
    expect(merged).toHaveLength(1);
  });
});

describe("synthesizeSettlementBalancePaymentActivityEvents", () => {
  it("adds settlement payment Activity rows", () => {
    const merged = synthesizeSettlementBalancePaymentActivityEvents([], [
      {
        id: "set-1",
        amountGbp: 50,
        paidAt: "2026-08-18T10:00:00.000Z",
        direction: "received_from_driver",
        recordedByUserId: "staff-1",
      },
    ]);
    expect(merged[0]).toMatchObject({
      event_type: "settlement_balance_payment_recorded",
      summary: "Recorded £50.00 settlement payment received from driver.",
    });
    const items = buildHireActivityItems(merged, { audience: "staff" });
    expect(items[0]?.title).toBe("Settlement payment recorded");
  });

  it("skips settlement payments already linked from audit metadata", () => {
    const merged = synthesizeSettlementBalancePaymentActivityEvents(
      [
        event({
          id: "logged",
          event_type: "settlement_balance_payment_recorded",
          metadata: { balancePaymentId: "set-1" },
        }),
      ],
      [{ id: "set-1", amountGbp: 50, paidAt: "2026-08-18T10:00:00.000Z", direction: "paid_to_driver" }],
    );
    expect(merged).toHaveLength(1);
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
    expect(staff[0]?.recordedByLabel).toMatch(/Mujtaba Ghulamfarooq/);
    expect(staff[0]?.recordedByLabel).toMatch(/Company staff/);
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
