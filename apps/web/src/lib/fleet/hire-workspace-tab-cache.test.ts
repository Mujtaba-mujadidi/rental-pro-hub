import { describe, expect, it } from "vitest";
import {
  hireWorkspaceKeysInvalidatedByInspectionChange,
  hireWorkspaceKeysInvalidatedByPaymentChange,
  hireWorkspacePaymentRealtimeEnabled,
} from "@/lib/fleet/hire-workspace-tab-cache";

describe("hire workspace tab cache policy", () => {
  it("subscribes to payment changes only while the hire is active", () => {
    expect(hireWorkspacePaymentRealtimeEnabled(false)).toBe(true);
    expect(hireWorkspacePaymentRealtimeEnabled(true)).toBe(false);
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
