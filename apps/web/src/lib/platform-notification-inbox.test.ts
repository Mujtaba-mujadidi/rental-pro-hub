import { describe, expect, it } from "vitest";
import { formatPlatformNotification } from "@/lib/platform-notification-display";
import {
  buildPlatformNotificationInboxRows,
  filterPlatformNotificationInboxRows,
  platformNotificationGroupingKey,
} from "@/lib/platform-notification-inbox";

describe("platformNotificationGroupingKey", () => {
  it("groups hire payment events for the same hire", () => {
    expect(
      platformNotificationGroupingKey({
        id: "a",
        type: "hire_payment_submitted",
        display: { href: "/rental/hires/hg1/payments" },
        payloadHireGroupId: "hg1",
      }),
    ).toBe("hire-payment:hg1");
  });
});

describe("buildPlatformNotificationInboxRows", () => {
  it("groups related hire payment events onto the latest card", () => {
    const submitted = formatPlatformNotification("hire_payment_submitted", {
      amountGbp: 100,
      vehicleVrm: "KE18 FSX",
      driverLabel: "Driver",
      href: "/rental/hires/hg1/payments",
    });
    const approved = formatPlatformNotification("hire_payment_approved", {
      amountGbp: 100,
      vehicleVrm: "KE18 FSX",
      href: "/rental/hires/hg1/payments",
    });
    const rows = buildPlatformNotificationInboxRows(
      [
        {
          id: "1",
          type: "hire_payment_submitted",
          readAt: "2026-07-29T02:00:00.000Z",
          createdAt: "2026-07-29T02:00:00.000Z",
          display: submitted,
        },
        {
          id: "2",
          type: "hire_payment_approved",
          readAt: null,
          createdAt: "2026-07-29T03:35:00.000Z",
          display: approved,
        },
      ],
      { "1": "hg1", "2": "hg1" },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ids).toEqual(["2", "1"]);
    expect(rows[0]?.unread).toBe(true);
    expect(rows[0]?.display.title).toBe("Payment approved");
    expect(rows[0]?.display.body).toContain("Related review events are grouped here.");
    expect(rows[0]?.groups).toContain("payments");
    expect(rows[0]?.tone).toBe("success");
  });

  it("filters unread and payment groups", () => {
    const rows = buildPlatformNotificationInboxRows([
      {
        id: "doc",
        type: "contract_signed",
        readAt: "2026-07-29T02:00:00.000Z",
        createdAt: "2026-07-29T02:00:00.000Z",
        display: formatPlatformNotification("contract_signed", {}),
      },
    ]);
    expect(filterPlatformNotificationInboxRows(rows, "unread")).toHaveLength(0);
    expect(filterPlatformNotificationInboxRows(rows, "documents")).toHaveLength(1);
    expect(filterPlatformNotificationInboxRows(rows, "payments")).toHaveLength(0);
  });
});
