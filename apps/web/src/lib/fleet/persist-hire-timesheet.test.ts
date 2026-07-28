import { describe, expect, it, vi } from "vitest";
import { persistHireTimesheetForGroup } from "@/lib/fleet/persist-hire-timesheet";

function createMockDb(existingRows: { payment_status: string; approved_amount_gbp: number | null }[]) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({
      data: {
        start_date: "2026-07-01",
        rent_cadence: "weekly",
        rent_amount_gbp: 100,
        deposit_gbp: 500,
        default_payment_account_id: null,
        vehicle_hire_agreements: [{ end_date: "2026-12-31" }],
      },
      error: null,
    })),
    then: undefined as unknown,
  };

  const from = vi.fn((table: string) => {
    if (table === "vehicle_hire_payment_schedule") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: existingRows, error: null })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
        insert: vi.fn(async () => ({ error: null })),
      };
    }
    if (table === "vehicle_hire_groups") {
      return chain;
    }
    return chain;
  });

  return { from } as unknown as Parameters<typeof persistHireTimesheetForGroup>[0];
}

describe("persistHireTimesheetForGroup", () => {
  it("blocks regeneration when approved payments exist", async () => {
    const db = createMockDb([{ payment_status: "approved", approved_amount_gbp: 100 }]);
    const result = await persistHireTimesheetForGroup(db, "hire-1");
    expect(result).toEqual({
      ok: false,
      error:
        "Cannot regenerate the payment schedule while payments have been recorded or are awaiting approval.",
    });
  });

  it("allows regeneration when schedule is untouched", async () => {
    const db = createMockDb([{ payment_status: "not_received", approved_amount_gbp: null }]);
    const result = await persistHireTimesheetForGroup(db, "hire-1");
    expect(result).toEqual({ ok: true });
  });
});
