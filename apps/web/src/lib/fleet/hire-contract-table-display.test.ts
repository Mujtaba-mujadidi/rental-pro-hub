import { describe, expect, it } from "vitest";
import {
  hireContractTableEndLabel,
  hireContractTableStartLabel,
  hireEsignTableStatus,
  hireGroupTableStatus,
} from "@/lib/fleet/hire-contract-table-display";

describe("hireGroupTableStatus", () => {
  it("labels ended hires clearly", () => {
    expect(hireGroupTableStatus("terminated").label).toBe("Contract ended");
    expect(hireGroupTableStatus("completed").label).toBe("Hire completed");
    expect(hireGroupTableStatus("active").label).toBe("On rent");
  });

  it("includes wizard step for drafts", () => {
    expect(hireGroupTableStatus("draft", { wizardStep: 4 }).label).toBe("Draft · step 4");
  });
});

describe("hire contract table date labels", () => {
  it("uses standard UK datetime for actual start/end timestamps", () => {
    expect(
      hireContractTableStartLabel({
        activated_at: "2026-07-17T08:00:00.000Z",
        start_date: null,
        start_time: null,
        end_time: null,
        scheduled_end_date: null,
        terminated_at: null,
        ended_at: null,
      }),
    ).toBe("17/07/2026, 09:00");

    expect(
      hireContractTableEndLabel({
        activated_at: null,
        start_date: null,
        start_time: null,
        end_time: null,
        scheduled_end_date: null,
        terminated_at: "2026-07-20T11:30:00.000Z",
        ended_at: null,
      }),
    ).toBe("20/07/2026, 12:30");
  });

  it("does not show scheduled contract end under Ended for active hires", () => {
    const row = {
      activated_at: "2026-07-17T08:00:00.000Z",
      start_date: "2026-07-17",
      start_time: "09:00",
      end_time: "09:00",
      scheduled_end_date: "2027-07-28",
      terminated_at: null,
      ended_at: null,
    };
    expect(hireContractTableEndLabel(row)).toBe("—");
  });

  it("formats scheduled start with the same calendar datetime style", () => {
    expect(
      hireContractTableStartLabel({
        activated_at: null,
        start_date: "2027-07-28",
        start_time: "09:00",
        end_time: null,
        scheduled_end_date: null,
        terminated_at: null,
        ended_at: null,
      }),
    ).toBe("Scheduled 28/07/2027, 09:00");
  });
});

describe("hireEsignTableStatus", () => {
  it("shows awaiting hirer after bundle is sent", () => {
    const status = hireEsignTableStatus({
      groupStatus: "pending_signature",
      agreementCount: 2,
      envelopeRows: [
        {
          agreementId: "a1",
          contractLengthKind: "annual",
          endDate: "2027-01-01",
          envelopeId: "env-1",
          status: "sent",
          requiresOwner: true,
          ownerSignedAt: "2026-01-01T10:00:00Z",
          fieldLayout: [{ id: "f1", type: "signature", page: 1, x: 0, y: 0, w: 1, h: 1, role: "recipient" }],
          signed: false,
        },
      ],
      signingBundleSentAt: "2026-01-02T10:00:00Z",
      allAgreementsSigned: false,
    });
    expect(status.label).toBe("Awaiting hirer");
  });

  it("shows ready to send when lessor has signed all agreements", () => {
    const status = hireEsignTableStatus({
      groupStatus: "pending_signature",
      agreementCount: 1,
      envelopeRows: [
        {
          agreementId: "a1",
          contractLengthKind: "annual",
          endDate: "2027-01-01",
          envelopeId: "env-1",
          status: "awaiting_placement",
          requiresOwner: true,
          ownerSignedAt: "2026-01-01T10:00:00Z",
          fieldLayout: [{ id: "f1", type: "signature", page: 1, x: 0, y: 0, w: 1, h: 1, role: "owner" }],
          signed: false,
        },
      ],
      signingBundleSentAt: null,
      allAgreementsSigned: false,
    });
    expect(status.label).toBe("Ready to send");
  });
});
