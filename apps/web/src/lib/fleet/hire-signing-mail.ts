import { formatUkDate } from "@/lib/datetime/uk";
import { sendEsignMail } from "@/lib/esign/mail";

export type HireSigningBundleEmailAgreement = {
  lengthLabel: string;
  endDate: string;
};

export type HireSigningBundleEmailInput = {
  to: string;
  driverName: string;
  companyName: string;
  vehicleLabel: string;
  vrm: string;
  startDate: string;
  rentLabel: string;
  agreements: HireSigningBundleEmailAgreement[];
  unsignedCount: number;
  signingUrl: string;
  otp: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendHireSigningBundleEmail(
  input: HireSigningBundleEmailInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { unsignedCount, vrm, companyName, driverName } = input;
  const subject =
    unsignedCount === 1
      ? `${companyName} — sign vehicle hire agreement (${vrm})`
      : `${companyName} — sign ${unsignedCount} vehicle hire agreements (${vrm})`;

  const agreementLines = input.agreements
    .map((a) => `• ${a.lengthLabel} — ends ${formatUkDate(a.endDate)}`)
    .join("\n");

  const text = [
    `Hello ${driverName},`,
    "",
    `${companyName} has sent you ${unsignedCount === 1 ? "a vehicle hire agreement" : `${unsignedCount} vehicle hire agreements`} to sign for ${vrm}.`,
    "",
    `Vehicle: ${vrm} (${input.vehicleLabel})`,
    `Start date: ${formatUkDate(input.startDate)}`,
    `Rent: ${input.rentLabel}`,
    "",
    unsignedCount > 1 ? "Agreements to sign:" : "Agreement:",
    agreementLines,
    "",
    `Open this link to sign ${unsignedCount === 1 ? "the agreement" : "all agreements in one session"}:`,
    input.signingUrl,
    "",
    `Your access code (OTP): ${input.otp}`,
    "",
    "The code expires in 24 hours. Do not share this email.",
    "",
    "We collect your email, signature image, IP address, and device information for contract records under UK GDPR.",
  ].join("\n");

  const agreementRows = input.agreements
    .map(
      (a) =>
        `<tr><td style="padding:6px 0;color:#64748b">${escapeHtml(a.lengthLabel)}</td><td style="padding:6px 0">Ends ${escapeHtml(formatUkDate(a.endDate))}</td></tr>`,
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#0f172a">
      <p>Hello ${escapeHtml(driverName)},</p>
      <p><strong>${escapeHtml(companyName)}</strong> has sent you ${
        unsignedCount === 1
          ? `a vehicle hire agreement to sign for <strong>${escapeHtml(vrm)}</strong>.`
          : `<strong>${unsignedCount}</strong> vehicle hire agreements to sign for <strong>${escapeHtml(vrm)}</strong>.`
      }</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b">Vehicle</td><td style="padding:6px 0"><strong>${escapeHtml(vrm)}</strong> — ${escapeHtml(input.vehicleLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Start</td><td style="padding:6px 0">${escapeHtml(formatUkDate(input.startDate))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Rent</td><td style="padding:6px 0">${escapeHtml(input.rentLabel)}</td></tr>
      </table>
      ${
        input.agreements.length
          ? `<p style="font-size:14px;font-weight:600;margin:0 0 8px">${unsignedCount > 1 ? "Agreements to sign" : "Agreement"}</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px">${agreementRows}</table>`
          : ""
      }
      <p style="color:#475569;font-size:14px">You will ${unsignedCount > 1 ? "sign each agreement in order on one page" : "review and sign the agreement on the signing page"}.</p>
      <p><a href="${escapeHtml(input.signingUrl)}" style="display:inline-block;background:#0f4c5c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open signing page</a></p>
      <p style="font-size:14px">Your access code (OTP): <strong style="letter-spacing:0.08em">${escapeHtml(input.otp)}</strong></p>
      <p style="font-size:13px;color:#64748b">The code expires in 24 hours. Do not share this email.</p>
      <p style="font-size:12px;color:#64748b;margin-top:20px">We collect your email, signature image, IP address, and device information for contract records under UK GDPR.</p>
    </div>
  `;

  try {
    await sendEsignMail({ to: input.to, subject, text, html });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send email." };
  }
}
