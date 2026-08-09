import { describe, expect, it } from "vitest";
import {
  buildVehicleTransferDocumentOptions,
  vehicleTransferDocumentKey,
} from "./vehicle-transfer-document-impact";

describe("buildVehicleTransferDocumentOptions", () => {
  it("includes default fleet docs when no hire", () => {
    const options = buildVehicleTransferDocumentOptions({
      hireGroupId: null,
      agreements: [],
      inspections: [],
    });
    expect(options.map((o) => o.documentKind)).toEqual([
      "logbook",
      "phv_taxi_licence_paper",
      "insurance",
    ]);
    expect(options.filter((o) => o.defaultSelected).map((o) => o.documentKind)).toEqual([
      "logbook",
      "phv_taxi_licence_paper",
    ]);
  });

  it("includes issued hire agreements and completed inspections", () => {
    const options = buildVehicleTransferDocumentOptions({
      hireGroupId: "g1",
      agreements: [
        {
          id: "a1",
          hire_group_id: "g1",
          contract_length_kind: "annual",
          status: "signed",
          signed_at: "2026-01-01T00:00:00Z",
        },
      ],
      inspections: [
        { id: "i1", hire_group_id: "g1", kind: "checkout", status: "completed" },
        { id: "i2", hire_group_id: "g1", kind: "checkin", status: "completed" },
      ],
    });
    const kinds = options.map((o) => o.documentKind);
    expect(kinds).toContain("hire_agreement");
    expect(kinds).toContain("inspection_checkout");
    expect(kinds).toContain("inspection_checkin");
  });
});

describe("vehicleTransferDocumentKey", () => {
  it("is stable for the same inputs", () => {
    expect(
      vehicleTransferDocumentKey({
        documentKind: "logbook",
      }),
    ).toBe("logbook:::");
  });
});
