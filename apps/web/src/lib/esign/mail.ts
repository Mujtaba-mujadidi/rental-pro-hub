import dns from "node:dns/promises";
import net from "node:net";
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
 * Nodemailer 9 resolves A+AAAA and may pick IPv6. On Railway, public IPv6 egress
 * often fails (ENETUNREACH … Local :::0). Bypass that by connecting to an A record.
 */
async function resolveSmtpIpv4(host: string): Promise<string> {
  if (net.isIPv4(host)) return host;
  if (net.isIPv6(host)) {
    throw new Error(`SMTP host is IPv6-only (${host}); Railway needs an IPv4 SMTP endpoint.`);
  }
  const addresses = await dns.resolve4(host);
  if (!addresses.length) {
    throw new Error(`No IPv4 (A) records for SMTP host ${host}.`);
  }
  return addresses[0]!;
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
    const ipv4 = await withTimeout(resolveSmtpIpv4(host), 10_000, "SMTP DNS (IPv4)");

    const transporter = nodemailer.createTransport({
      // Literal IPv4 skips nodemailer's dual-stack resolver (which can pick AAAA).
      host: ipv4,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: { user, pass },
      connectionTimeout: SMTP_CONNECT_MS,
      greetingTimeout: SMTP_CONNECT_MS,
      socketTimeout: SMTP_SOCKET_MS,
      // Keep TLS/SNI + cert validation tied to the real hostname, not the IP.
      servername: host,
      name: host,
      tls: {
        servername: host,
        minVersion: "TLSv1.2",
      },
    } as Parameters<typeof nodemailer.createTransport>[0]);

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
