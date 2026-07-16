import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";

export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const SMTP_CONNECT_MS = 12_000;
const SMTP_SOCKET_MS = 15_000;
const SMTP_SEND_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`));
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

function defaultFrom() {
  return (
    process.env.RESEND_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.ESIGN_SMTP_FROM?.trim() ||
    "RMS <noreply@localhost>"
  );
}

/**
 * Nodemailer 9 resolves A+AAAA and may pick IPv6. On Railway, public IPv6 egress
 * often fails (ENETUNREACH … Local :::0). Bypass that by connecting to an A record.
 */
async function resolveSmtpIpv4(host: string): Promise<string> {
  if (net.isIPv4(host)) return host;
  if (net.isIPv6(host)) {
    throw new Error(`SMTP host is IPv6-only (${host}); use an IPv4 SMTP endpoint or RESEND_API_KEY.`);
  }
  const addresses = await dns.resolve4(host);
  if (!addresses.length) {
    throw new Error(`No IPv4 (A) records for SMTP host ${host}.`);
  }
  return addresses[0]!;
}

/** HTTPS transactional email — works on Railway Hobby (SMTP ports are blocked there). */
async function sendViaResend(input: SendMailInput, apiKey: string): Promise<void> {
  const from = defaultFrom();
  const res = await withTimeout(
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html ?? undefined,
      }),
    }),
    SMTP_SEND_MS,
    "Resend API",
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 240) || res.statusText}`);
  }
}

async function sendViaSmtp(input: SendMailInput): Promise<void> {
  const host = process.env.SMTP_ADDRESS?.trim() || process.env.ESIGN_SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || process.env.ESIGN_SMTP_PORT || "587");
  const user = process.env.SMTP_USERNAME?.trim() || process.env.ESIGN_SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD?.trim() || process.env.ESIGN_SMTP_PASSWORD?.trim();
  const from = defaultFrom();

  if (!host || !user || !pass) {
    throw new Error("SMTP_* incomplete");
  }

  const ipv4 = await withTimeout(resolveSmtpIpv4(host), 10_000, "SMTP DNS (IPv4)");

  const transporter = nodemailer.createTransport({
    host: ipv4,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    connectionTimeout: SMTP_CONNECT_MS,
    greetingTimeout: SMTP_CONNECT_MS,
    socketTimeout: SMTP_SOCKET_MS,
    servername: host,
    name: host,
    tls: {
      servername: host,
      minVersion: "TLSv1.2",
    },
  } as Parameters<typeof nodemailer.createTransport>[0]);

  try {
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
  } finally {
    try {
      transporter.close();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Outbound mail for e-sign OTP / links.
 *
 * Prefer RESEND_API_KEY on Railway Hobby/Free (outbound SMTP 25/465/587 is blocked).
 * SMTP_* still works locally and on Railway Pro after redeploy.
 */
export async function sendEsignMail(input: SendMailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const smtpHost = process.env.SMTP_ADDRESS?.trim() || process.env.ESIGN_SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USERNAME?.trim() || process.env.ESIGN_SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASSWORD?.trim() || process.env.ESIGN_SMTP_PASSWORD?.trim();
  const hasSmtp = Boolean(smtpHost && smtpUser && smtpPass);

  if (!resendKey && !hasSmtp) {
    console.warn(
      "[esign-mail] No RESEND_API_KEY or SMTP_* — logging message instead.\n",
      `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}`,
    );
    return { ok: true };
  }

  try {
    if (resendKey) {
      await sendViaResend(input, resendKey);
      return { ok: true };
    }

    await sendViaSmtp(input);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send email.";
    console.error("[esign-mail] send failed:", msg);

    const looksLikeSmtpBlock =
      /timed out|timeout|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/i.test(msg) && !resendKey;

    return {
      ok: false,
      error: looksLikeSmtpBlock
        ? `Could not email the recipient (${msg}). Railway Hobby/Free blocks outbound SMTP — set RESEND_API_KEY (https://resend.com) or upgrade to Railway Pro and redeploy.`
        : `Could not email the recipient (${msg}). Check RESEND_API_KEY / SMTP_* on the server and try again.`,
    };
  }
}
