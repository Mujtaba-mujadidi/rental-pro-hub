import { describe, expect, it } from "vitest";
import { getPlatformLetterhead } from "@/lib/platform/letterhead";
import { APP_NAME } from "@rph/shared";

describe("getPlatformLetterhead", () => {
  it("defaults to the app name when env is unset", () => {
    const lh = getPlatformLetterhead();
    expect(lh.name).toBe(APP_NAME);
    expect(lh.companyNumber).toBeNull();
    expect(lh.contactEmail).toBeNull();
    expect(lh.contactPhone).toBeNull();
  });
});
