import { describe, expect, it } from "vitest";
import {
  HIRE_ACCESS_RESPONSE_TTL_MS,
  hireAccessExpiresAt,
  hireAccessOtpAttemptsExhausted,
  hireAccessOtpAttemptsRemaining,
  hireAccessRequestExpired,
  hireAccessRequestUnlocked,
  driverAccessResendReasonCopy,
  issueHireAccessResponseCredentials,
} from "@/lib/fleet/hire-access-token";

describe("issueHireAccessResponseCredentials", () => {
  it("issues a token, otp, and 30-minute expiry", () => {
    const from = new Date("2026-08-10T12:00:00.000Z");
    const creds = issueHireAccessResponseCredentials(from);
    expect(creds.token.length).toBeGreaterThan(10);
    expect(creds.otp).toMatch(/^\d{6}$/);
    expect(creds.expiresAt.getTime() - from.getTime()).toBe(HIRE_ACCESS_RESPONSE_TTL_MS);
  });
});

describe("hireAccessRequestExpired", () => {
  it("treats pending requests past expiry as expired", () => {
    expect(
      hireAccessRequestExpired({
        status: "pending",
        response_expires_at: "2020-01-01T11:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("keeps pending requests before expiry active", () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    expect(
      hireAccessRequestExpired({
        status: "pending",
        response_expires_at: future,
      }),
    ).toBe(false);
  });
});

describe("hireAccessRequestUnlocked", () => {
  it("unlocks after otp verification", () => {
    expect(
      hireAccessRequestUnlocked({ response_verified_at: "2026-08-10T12:00:00.000Z" }, null),
    ).toBe(true);
  });

  it("unlocks for the matching signed-in driver", () => {
    expect(hireAccessRequestUnlocked({ response_verified_at: null }, "driver-1")).toBe(true);
  });

  it("stays locked without verification or driver session", () => {
    expect(hireAccessRequestUnlocked({ response_verified_at: null }, null)).toBe(false);
  });
});

describe("hireAccessOtpAttemptsExhausted", () => {
  it("locks after three failed attempts", () => {
    expect(hireAccessOtpAttemptsExhausted({ response_otp_attempts: 3 })).toBe(true);
    expect(hireAccessOtpAttemptsExhausted({ response_otp_attempts: 2 })).toBe(false);
  });
});

describe("hireAccessOtpAttemptsRemaining", () => {
  it("counts down from three", () => {
    expect(hireAccessOtpAttemptsRemaining({ response_otp_attempts: 0 })).toBe(3);
    expect(hireAccessOtpAttemptsRemaining({ response_otp_attempts: 2 })).toBe(1);
    expect(hireAccessOtpAttemptsRemaining({ response_otp_attempts: 3 })).toBe(0);
  });
});

describe("driverAccessResendReasonCopy", () => {
  it("explains otp lockout to staff", () => {
    expect(driverAccessResendReasonCopy("otp_exhausted")).toMatch(/three times/i);
  });

  it("explains time expiry to staff", () => {
    expect(driverAccessResendReasonCopy("time_expired")).toMatch(/30 minutes/i);
  });
});

describe("hireAccessExpiresAt", () => {
  it("adds thirty minutes", () => {
    const from = new Date("2026-08-10T12:00:00.000Z");
    expect(hireAccessExpiresAt(from).toISOString()).toBe("2026-08-10T12:30:00.000Z");
  });
});
