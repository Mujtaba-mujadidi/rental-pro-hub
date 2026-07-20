import { describe, expect, it } from "vitest";
import { userMessageForSupabaseAuthEmailError } from "@/lib/auth/supabase-auth-user-message";

describe("userMessageForSupabaseAuthEmailError", () => {
  it("maps rate-limit codes to guidance copy", () => {
    const msg = userMessageForSupabaseAuthEmailError({
      message: "ignored",
      code: "over_email_send_rate_limit",
    });
    expect(msg).toMatch(/rate limits/i);
    expect(msg).toMatch(/SMTP/i);
  });

  it("maps over_request_rate_limit and message text", () => {
    expect(
      userMessageForSupabaseAuthEmailError({ message: "x", code: "over_request_rate_limit" }),
    ).toMatch(/rate limits/i);
    expect(
      userMessageForSupabaseAuthEmailError({ message: "Email rate limit exceeded" }),
    ).toMatch(/rate limits/i);
  });

  it("returns original message otherwise", () => {
    expect(userMessageForSupabaseAuthEmailError({ message: "Invalid login" })).toBe("Invalid login");
  });
});
