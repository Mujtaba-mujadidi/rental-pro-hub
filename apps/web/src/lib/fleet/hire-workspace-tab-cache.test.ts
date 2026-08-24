import { describe, expect, it } from "vitest";
import {
  hireWorkspaceKeysInvalidatedByInspectionChange,
  hireWorkspaceKeysInvalidatedByPaymentChange,
  hireWorkspacePaymentRealtimeEnabled,
} from "@/lib/fleet/hire-workspace-tab-cache";

describe("hire workspace tab cache policy", () => {
  it("keeps payment realtime enabled for active and ended hires", () => {
    expect(hireWorkspacePaymentRealtimeEnabled(false)).toBe(true);
    expect(hireWorkspacePaymentRealtimeEnabled(true)).toBe(true);
  });

  it("invalidates money tabs together, not inspections", () => {
    const keys = hireWorkspaceKeysInvalidatedByPaymentChange();
    expect(keys).toContain("payments");
    expect(keys).toContain("dashboard");
    expect(keys).toContain("activity");
    expect(keys).not.toContain("inspections");
    expect(keys).not.toContain("details");
  });

  it("invalidates inspections without dropping the payments sheet", () => {
    const keys = hireWorkspaceKeysInvalidatedByInspectionChange();
    expect(keys).toContain("inspections");
    expect(keys).toContain("dashboard");
    expect(keys).not.toContain("payments");
  });
});
