/** Maps Supabase Auth errors to copy suitable for end users (login / reset flows). */
export function userMessageForSupabaseAuthEmailError(err: {
  message: string;
  code?: string;
}): string {
  const code = err.code;
  const low = err.message.toLowerCase();
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    low.includes("rate limit")
  ) {
    return "Supabase would not send another auth email: rate limits were hit. With the built-in sender, the whole project often shares a very low hourly cap (commonly 2/hour until you add custom SMTP under Project Settings → Authentication). Invites, password resets, and similar messages all count toward that cap. There is also a minimum time between password resets to the same address. Use a link from an email you already received when possible. To fix this properly, configure custom SMTP in Supabase, then increase “Rate limit for sending emails” in Authentication → Rate limits.";
  }
  return err.message;
}
