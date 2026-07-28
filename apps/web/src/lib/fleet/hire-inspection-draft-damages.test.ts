import { describe, expect, it } from "vitest";
import {
  draftDamageToSaveInput,
  isLocalDamageId,
  mapInspectionDamagesToDraft,
  newLocalDamageId,
} from "@/lib/fleet/hire-inspection-draft-damages";

describe("hire-inspection-draft-damages", () => {
  it("creates and detects local damage ids", () => {
    const id = newLocalDamageId();
    expect(id.startsWith("local:")).toBe(true);
    expect(isLocalDamageId(id)).toBe(true);
    expect(isLocalDamageId("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
  });

  it("maps inspection damages to draft rows", () => {
    const rows = mapInspectionDamagesToDraft([
      {
        id: "d1",
        panelId: "front_bumper",
        damageType: "scratch",
        severity: "minor",
        notes: "Small mark",
        checkoutDamageId: null,
        diagramView: "front",
        pinX: 10,
        pinY: 20,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.panelId).toBe("front_bumper");
  });

  it("strips local ids when preparing save input", () => {
    const local = draftDamageToSaveInput({
      id: newLocalDamageId(),
      panelId: "front_bumper",
      damageType: "scratch",
      severity: "minor",
      notes: null,
      checkoutDamageId: null,
      diagramView: null,
      pinX: null,
      pinY: null,
      chargeGbp: null,
      chargeResolution: null,
    });
    expect(local.id).toBeNull();

    const persisted = draftDamageToSaveInput({
      id: "550e8400-e29b-41d4-a716-446655440000",
      panelId: "front_bumper",
      damageType: "scratch",
      severity: "minor",
      notes: null,
      checkoutDamageId: null,
      diagramView: null,
      pinX: null,
      pinY: null,
      chargeGbp: 50,
      chargeResolution: "add_to_balance",
    });
    expect(persisted.id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});
