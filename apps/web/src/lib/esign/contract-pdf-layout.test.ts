import { describe, expect, it } from "vitest";
import {
  CONTRACT_BODY_CLEARANCE_ABOVE_PARAPH,
  CONTRACT_MARGIN_BOTTOM,
  CONTRACT_PARAPH_LABEL_FROM_TOP,
  CONTRACT_PARAPH_SIG_FROM_TOP,
  CONTRACT_PARAPH_SIG_H,
  CONTRACT_PARAPH_STRIP_H,
  contractContentBottomReserve,
  contractParaphStripBottomY,
  contractParaphStripTopY,
  formatContractLetterheadContactLine,
} from "@/lib/esign/contract-pdf-layout";

describe("contract pdf paraph layout", () => {
  it("places paraph strip above footer margin", () => {
    expect(contractParaphStripBottomY()).toBeGreaterThan(CONTRACT_MARGIN_BOTTOM - 12);
    expect(contractParaphStripTopY()).toBe(
      contractParaphStripBottomY() + CONTRACT_PARAPH_STRIP_H,
    );
  });

  it("reserves clearance above paraph strip for body text", () => {
    expect(contractContentBottomReserve()).toBe(
      contractParaphStripTopY() + CONTRACT_BODY_CLEARANCE_ABOVE_PARAPH,
    );
  });

  it("allows at least one full text line above the paraph zone", () => {
    const reserve = contractContentBottomReserve();
    const stripTop = contractParaphStripTopY();
    expect(reserve - stripTop).toBeGreaterThanOrEqual(14);
  });

  it("places signature fields below printed paraph labels", () => {
    expect(CONTRACT_PARAPH_SIG_FROM_TOP).toBeGreaterThan(CONTRACT_PARAPH_LABEL_FROM_TOP);
    expect(CONTRACT_PARAPH_SIG_FROM_TOP + CONTRACT_PARAPH_SIG_H).toBeLessThanOrEqual(
      CONTRACT_PARAPH_STRIP_H,
    );
  });
});

describe("contract letterhead contact line", () => {
  it("joins company number, email, and phone", () => {
    expect(
      formatContractLetterheadContactLine({
        companyNumber: "12345678",
        email: "hire@example.com",
        phone: "020 7946 0958",
      }),
    ).toBe("Co. No. 12345678  ·  hire@example.com  ·  020 7946 0958");
  });

  it("omits empty segments", () => {
    expect(formatContractLetterheadContactLine({ email: "a@b.co" })).toBe("a@b.co");
    expect(formatContractLetterheadContactLine({})).toBe("");
  });
});
