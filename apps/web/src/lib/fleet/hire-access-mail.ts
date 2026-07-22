import { sendEsignMail } from "@/lib/esign/mail";
import { formatUkDate } from "@/lib/datetime/uk";

export type HireAccessEmailInput = {
  to: string;
  driverName: string;
  companyName: string;
  vehicleLabel: string;
  vrm: string;
  startDate: string;
  rentLabel: string;
  accessUrl: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendHireDriverAccessEmail(input: HireAccessEmailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const subject = `${input.companyName} — vehicle hire access request`;
  const text = [
    `Hello ${input.driverName},`,
    "",
    `${input.companyName} wants to create a vehicle hire agreement with you and needs access to your driver profile.`,
    "",
    `Vehicle: ${input.vrm} (${input.vehicleLabel})`,
    `Start date: ${formatUkDate(input.startDate)}`,
    `Rent: ${input.rentLabel}`,
    "",
    "Review the request and approve or reject here:",
    input.accessUrl,
    "",
    "If you approve, you will be asked to sign in and confirm before your profile is shared.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#0f172a">
      <p>Hello ${escapeHtml(input.driverName)},</p>
      <p><strong>${escapeHtml(input.companyName)}</strong> wants to create a vehicle hire agreement with you and needs access to your driver profile to proceed.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
        <tr><td style="padding:6px 0;color:#64748b">Vehicle</td><td style="padding:6px 0"><strong>${escapeHtml(input.vrm)}</strong> — ${escapeHtml(input.vehicleLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Start</td><td style="padding:6px 0">${escapeHtml(formatUkDate(input.startDate))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Rent</td><td style="padding:6px 0">${escapeHtml(input.rentLabel)}</td></tr>
      </table>
      <p style="color:#475569;font-size:14px">If you are happy for ${escapeHtml(input.companyName)} to use your profile information for this contract, approve the request. Otherwise you can reject it.</p>
      <p><a href="${escapeHtml(input.accessUrl)}" style="display:inline-block;background:#0f4c5c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Review request</a></p>
    </div>
  `;

  try {
    await sendEsignMail({ to: input.to, subject, text, html });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send email." };
  }
}

export async function sendDriverRegistrationInviteEmail(input: {
  to: string;
  companyName: string;
  signupUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const subject = `${input.companyName} — register as a driver on RMS`;
  const text = [
    `${input.companyName} would like you to register as a driver so they can create a hire agreement with you.`,
    "",
    "Create your account here:",
    input.signupUrl,
  ].join("\n");

  const html = `
    <p>${escapeHtml(input.companyName)} would like you to register as a driver on RMS.</p>
    <p><a href="${escapeHtml(input.signupUrl)}">Register your driver account</a></p>
  `;

  try {
    await sendEsignMail({ to: input.to, subject, text, html });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send email." };
  }
}
