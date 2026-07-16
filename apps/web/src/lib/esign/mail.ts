import nodemailer from "nodemailer";

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const SMTP_CONNECT_MS = 15_000;
const SMTP_SOCKET_MS = 20_000;
const SMTP_SEND_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. Check SMTP settings / network.`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Outbound mail for e-sign OTP / links.
 * Configure SMTP_* in apps/web/.env.local (and Railway Variables). If unset, logs to console (dev fallback).
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
      requireTLS: port === 587,
      auth: { user, pass },
      connectionTimeout: SMTP_CONNECT_MS,
      greetingTimeout: SMTP_CONNECT_MS,
      socketTimeout: SMTP_SOCKET_MS,
    });

    await withTimeout(
      transporter.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      SMTP_SEND_MS,
      "SMTP send",
    );

    try {
      transporter.close();
    } catch {
      /* ignore */
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send email.";
    console.error("[esign-mail] send failed:", msg);
    return {
      ok: false,
      error: `Could not email the recipient (${msg}). Check SMTP_* on the server and try again.`,
    };
  }
}
