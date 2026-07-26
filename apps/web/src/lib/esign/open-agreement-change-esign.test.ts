import { describe, expect, it } from "vitest";
import { loadOpenAgreementChangeEsignByCompanyIds } from "@/lib/esign/open-agreement-change-esign";

describe("loadOpenAgreementChangeEsignByCompanyIds", () => {
  it("returns empty map when no company ids", async () => {
    const admin = {} as Parameters<typeof loadOpenAgreementChangeEsignByCompanyIds>[0];
    const map = await loadOpenAgreementChangeEsignByCompanyIds(admin, []);
    expect(map.size).toBe(0);
  });
});
