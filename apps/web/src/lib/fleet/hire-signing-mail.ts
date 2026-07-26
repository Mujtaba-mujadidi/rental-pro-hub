import { formatUkDate } from "@/lib/datetime/uk";
import { sendEsignMail } from "@/lib/esign/mail";
import { buildTransactionalEmailHtml, escapeHtml } from "@/lib/email/transactional-layout";

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

  const tableRows = [
    { label: "Vehicle", value: `<strong>${escapeHtml(vrm)}</strong> — ${escapeHtml(input.vehicleLabel)}` },
    { label: "Start", value: escapeHtml(formatUkDate(input.startDate)) },
    { label: "Rent", value: escapeHtml(input.rentLabel) },
    ...input.agreements.map((a) => ({
      label: a.lengthLabel,
      value: `Ends ${escapeHtml(formatUkDate(a.endDate))}`,
    })),
  ];

  const html = buildTransactionalEmailHtml({
    greeting: driverName,
    paragraphs: [
      `${companyName} has sent you ${
        unsignedCount === 1
          ? `a vehicle hire agreement to sign for ${vrm}.`
          : `${unsignedCount} vehicle hire agreements to sign for ${vrm}.`
      }`,
      unsignedCount > 1
        ? "You will sign each agreement in order on one page."
        : "Review and sign the agreement on the signing page.",
    ],
    tableRows,
    cta: { label: "Open signing page", href: input.signingUrl },
    otp: { code: input.otp },
  });

  try {
    await sendEsignMail({ to: input.to, subject, text, html });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not send email." };
  }
}
