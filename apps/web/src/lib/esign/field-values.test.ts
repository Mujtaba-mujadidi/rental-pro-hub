import { describe, expect, it } from "vitest";
import { buildSignerPrefillValues, expandDerivedFieldValues, signableFieldLayout } from "@/lib/esign/field-values";
import type { EsignFieldLayoutItem } from "@/lib/esign/types";

const field = (
  partial: Partial<EsignFieldLayoutItem> & Pick<EsignFieldLayoutItem, "id" | "type">,
): EsignFieldLayoutItem => ({
  page: 1,
  x: 0,
  y: 0,
  w: 0.1,
  h: 0.05,
  role: "recipient",
  ...partial,
});

describe("signableFieldLayout", () => {
  it("excludes derived paraph fields", () => {
    const layout = [
      field({ id: "recipient_sig", type: "signature" }),
      field({ id: "recipient_sig_p2", type: "signature", derivedFrom: "recipient_sig" }),
    ];
    expect(signableFieldLayout(layout)).toHaveLength(1);
    expect(signableFieldLayout(layout)[0]?.id).toBe("recipient_sig");
  });
});

describe("expandDerivedFieldValues", () => {
  it("copies primary signature onto derived fields", () => {
    const layout = [
      field({ id: "owner_sig", type: "signature", role: "owner" }),
      field({ id: "owner_sig_p1", type: "signature", role: "owner", derivedFrom: "owner_sig" }),
    ];
    const values = {
      owner_sig: { type: "signature" as const, value: "data:image/png;base64,abc" },
    };
    const expanded = expandDerivedFieldValues(layout, values);
    expect(expanded.owner_sig_p1?.value).toBe("data:image/png;base64,abc");
  });
});

describe("buildSignerPrefillValues", () => {
  it("prefills recipient name and date fields", () => {
    const layout = [
      field({ id: "recipient_sig", type: "signature" }),
      field({ id: "recipient_name", type: "text", label: "Recipient full name" }),
      field({ id: "recipient_date", type: "date", label: "Date signed" }),
    ];
    const values = buildSignerPrefillValues(layout, {
      signerName: "Jane Driver",
      signedAt: new Date("2026-07-22T14:30:00"),
    });
    expect(values.recipient_name?.value).toBe("Jane Driver");
    expect(values.recipient_date?.value).toMatch(/22\/07\/2026/);
    expect(values.recipient_sig).toBeUndefined();
  });
});
