import { sendEsignMail } from "@/lib/esign/mail";
import { formatUkDate } from "@/lib/datetime/uk";
import { buildTransactionalEmailHtml, escapeHtml } from "@/lib/email/transactional-layout";

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

  const html = buildTransactionalEmailHtml({
    greeting: input.driverName,
    paragraphs: [
      `${input.companyName} wants to create a vehicle hire agreement with you and needs access to your driver profile to proceed.`,
      `If you are happy for ${input.companyName} to use your profile information for this contract, approve the request. Otherwise you can reject it.`,
    ],
    tableRows: [
      { label: "Vehicle", value: `<strong>${escapeHtml(input.vrm)}</strong> — ${escapeHtml(input.vehicleLabel)}` },
      { label: "Start", value: escapeHtml(formatUkDate(input.startDate)) },
      { label: "Rent", value: escapeHtml(input.rentLabel) },
    ],
    cta: { label: "Review request", href: input.accessUrl },
    footer: "You can approve or reject this request from the link above. No profile data is shared until you approve.",
  });

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

  const html = buildTransactionalEmailHtml({
    paragraphs: [
      `${input.companyName} would like you to register as a driver on RMS so they can create a hire agreement with you.`,
    ],
    cta: { label: "Register your driver account", href: input.signupUrl },
    footer: "If you were not expecting this email, you can ignore it.",
  });

  try {
    await sendEsignMail({ to: input.to, subject, text, html });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send email." };
  }
}
