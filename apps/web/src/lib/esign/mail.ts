import nodemailer from "nodemailer";

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Outbound mail for e-sign OTP / links.
 * Configure SMTP_* in apps/web/.env.local. If unset, logs to console (dev fallback).
 */
export async function sendEsignMail(input: SendMailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = process.env.SMTP_ADDRESS?.trim() || process.env.ESIGN_SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || process.env.ESIGN_SMTP_PORT || "587");
  const user = process.env.SMTP_USERNAME?.trim() || process.env.ESIGN_SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim() || process.env.ESIGN_SMTP_PASSWORD?.trim();
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.ESIGN_SMTP_FROM?.trim() ||
    "RMS <noreply@localhost>";

  if (!host || !user || !pass) {
    console.warn(
      "[esign-mail] SMTP not configured — logging message instead.\n",
      `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}`,
    );
    return { ok: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send email." };
  }
}
