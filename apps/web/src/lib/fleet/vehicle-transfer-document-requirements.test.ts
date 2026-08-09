import { describe, expect, it } from "vitest";
import {
  mapVehicleTransferOpenRequirements,
  openTransferRequirementForVehicleDocType,
  vehicleTransferFleetDocKindForVehicleDocType,
} from "./vehicle-transfer-document-requirements";

describe("vehicleTransferFleetDocKindForVehicleDocType", () => {
  it("maps fleet doc types", () => {
    expect(vehicleTransferFleetDocKindForVehicleDocType("logbook")).toBe("logbook");
    expect(vehicleTransferFleetDocKindForVehicleDocType("phv_taxi_licence_paper")).toBe("phv_taxi_licence_paper");
    expect(vehicleTransferFleetDocKindForVehicleDocType("photo")).toBeNull();
  });
});

describe("mapVehicleTransferOpenRequirements", () => {
  it("builds fleet and hire requirement rows", () => {
    const items = mapVehicleTransferOpenRequirements([
      {
        id: "r1",
        document_kind: "logbook",
        vehicle_transfer_id: "t1",
        hire_group_id: null,
        agreement_id: null,
        inspection_id: null,
      },
      {
        id: "r2",
        document_kind: "inspection_checkout",
        vehicle_transfer_id: "t1",
        hire_group_id: "hg-1",
        agreement_id: null,
        inspection_id: "in-1",
      },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.vehicleDocType).toBe("logbook");
    expect(items[0]?.href).toBeNull();
    expect(items[1]?.href).toBe("/rental/hires/hg-1/checkout");
  });
});

describe("openTransferRequirementForVehicleDocType", () => {
  it("finds matching fleet requirement", () => {
    const items = mapVehicleTransferOpenRequirements([
      {
        id: "r1",
        document_kind: "mot",
        vehicle_transfer_id: "t1",
        hire_group_id: null,
        agreement_id: null,
        inspection_id: null,
      },
    ]);
    expect(openTransferRequirementForVehicleDocType(items, "mot")?.id).toBe("r1");
    expect(openTransferRequirementForVehicleDocType(items, "logbook")).toBeUndefined();
  });
});
