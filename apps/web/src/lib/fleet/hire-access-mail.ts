import { sendEsignMail } from "@/lib/esign/mail";
import { formatUkDate } from "@/lib/datetime/uk";
import type { HireLessorMailIdentity } from "@/lib/rental/subcompany-legal-snapshot";
import { buildTransactionalEmailHtml, escapeHtml } from "@/lib/email/transactional-layout";

export type HireAccessEmailInput = {
  to: string;
  driverName: string;
  lessor: HireLessorMailIdentity;
  vehicleLabel: string;
  vrm: string;
  startDate: string;
  rentLabel: string;
  accessUrl: string;
  accessCode: string;
};

function lessorEmailTableRows(lessor: HireLessorMailIdentity) {
  const rows: { label: string; value: string }[] = [
    {
      label: "Company",
      value: `<strong>${escapeHtml(lessor.displayName)}</strong>`,
    },
  ];
  if (lessor.companyNumber) {
    rows.push({ label: "Company number", value: escapeHtml(lessor.companyNumber) });
  }
  if (lessor.address) {
    rows.push({ label: "Registered address", value: escapeHtml(lessor.address) });
  }
  return rows;
}

export async function sendHireDriverAccessEmail(input: HireAccessEmailInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const lessorName = input.lessor.displayName;
  const subject = `${lessorName} — vehicle hire access request`;
  const text = [
    `Hello ${input.driverName},`,
    "",
    `${lessorName} wants to create a vehicle hire agreement with you and needs access to your driver profile.`,
    "",
    `Company: ${lessorName}`,
    input.lessor.companyNumber ? `Company number: ${input.lessor.companyNumber}` : null,
    input.lessor.address ? `Registered address: ${input.lessor.address}` : null,
    "",
    `Vehicle: ${input.vrm} (${input.vehicleLabel})`,
    `Start date: ${formatUkDate(input.startDate)}`,
    `Rent: ${input.rentLabel}`,
    "",
    "Review the request and approve or reject here:",
    input.accessUrl,
    "",
    `Access code: ${input.accessCode}`,
    "Enter this code when you open the link. The link and code expire in 30 minutes.",
    "",
    "Alternatively, sign in to your driver account from the review page to approve or reject from your hire requests inbox.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = buildTransactionalEmailHtml({
    greeting: input.driverName,
    paragraphs: [
      `${lessorName} wants to create a vehicle hire agreement with you and needs access to your driver profile to proceed.`,
      `If you are happy for ${lessorName} to use your profile information for this contract, approve the request. Otherwise you can reject it.`,
    ],
    tableRows: [
      ...lessorEmailTableRows(input.lessor),
      { label: "Vehicle", value: `<strong>${escapeHtml(input.vrm)}</strong> — ${escapeHtml(input.vehicleLabel)}` },
      { label: "Start", value: escapeHtml(formatUkDate(input.startDate)) },
      { label: "Rent", value: escapeHtml(input.rentLabel) },
    ],
    cta: { label: "Review request", href: input.accessUrl },
    otp: {
      code: input.accessCode,
      expiresLabel: "The link and access code expire in 30 minutes. Do not share this email.",
    },
    footer:
      "Open the link above and enter your access code to review the request. You can approve or reject without signing in once the code is verified, or sign in from the review page instead.",
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
  lessor: HireLessorMailIdentity;
  signupUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const lessorName = input.lessor.displayName;
  const subject = `${lessorName} — register as a driver on RMS`;
  const text = [
    `${lessorName} would like you to register as a driver so they can create a hire agreement with you.`,
    "",
    `Company: ${lessorName}`,
    input.lessor.companyNumber ? `Company number: ${input.lessor.companyNumber}` : null,
    input.lessor.address ? `Registered address: ${input.lessor.address}` : null,
    "",
    "Create your account here:",
    input.signupUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const html = buildTransactionalEmailHtml({
    paragraphs: [
      `${lessorName} would like you to register as a driver on RMS so they can create a hire agreement with you.`,
    ],
    tableRows: lessorEmailTableRows(input.lessor),
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
