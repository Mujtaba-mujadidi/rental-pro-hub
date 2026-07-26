export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type TransactionalEmailTableRow = {
  label: string;
  value: string;
};

export type TransactionalEmailCallout = {
  text: string;
  tone?: "info" | "warning" | "success";
};

export type TransactionalEmailCta = {
  label: string;
  href: string;
};

export type TransactionalEmailOtp = {
  code: string;
  expiresLabel?: string;
};

export type BuildTransactionalEmailInput = {
  greeting?: string | null;
  paragraphs: string[];
  tableRows?: TransactionalEmailTableRow[];
  callout?: TransactionalEmailCallout | null;
  cta?: TransactionalEmailCta | null;
  otp?: TransactionalEmailOtp | null;
  footer?: string;
};

const CALLOUT_STYLES: Record<NonNullable<TransactionalEmailCallout["tone"]>, string> = {
  info: "background:#f0f9ff;border:1px solid #bae6fd;color:#0c4a6e",
  warning: "background:#fffbeb;border:1px solid #fde68a;color:#92400e",
  success: "background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46",
};

/** Shared HTML layout for RMS transactional emails (hire, platform agreement, access requests). */
export function buildTransactionalEmailHtml(input: BuildTransactionalEmailInput): string {
  const paragraphs = input.paragraphs
    .map((text) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(text)}</p>`)
    .join("");

  const table =
    input.tableRows && input.tableRows.length
      ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">${input.tableRows
          .map(
            (row) =>
              `<tr><td style="padding:6px 0;color:#64748b;vertical-align:top;width:34%">${escapeHtml(row.label)}</td><td style="padding:6px 0;vertical-align:top">${row.value}</td></tr>`,
          )
          .join("")}</table>`
      : "";

  const callout = input.callout
    ? `<div style="margin:16px 0;padding:12px 14px;border-radius:8px;font-size:14px;line-height:1.5;${CALLOUT_STYLES[input.callout.tone ?? "info"]}">${escapeHtml(input.callout.text)}</div>`
    : "";

  const cta = input.cta
    ? `<p style="margin:20px 0 16px"><a href="${escapeHtml(input.cta.href)}" style="display:inline-block;background:#0f4c5c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(input.cta.label)}</a></p>`
    : "";

  const otp = input.otp
    ? `<p style="font-size:14px;margin:0 0 8px">Your access code (OTP): <strong style="letter-spacing:0.08em">${escapeHtml(input.otp.code)}</strong></p>
       <p style="font-size:13px;color:#64748b;margin:0 0 14px">${escapeHtml(input.otp.expiresLabel ?? "The code expires in 24 hours. Do not share this email.")}</p>`
    : "";

  const footer =
    input.footer ??
    "We collect your email, signature image, IP address, and device information for contract records under UK GDPR.";

  return `
    <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;color:#0f172a">
      ${input.greeting ? `<p style="margin:0 0 14px;line-height:1.55">Hello ${escapeHtml(input.greeting)},</p>` : ""}
      ${paragraphs}
      ${table}
      ${callout}
      ${cta}
      ${otp}
      <p style="font-size:12px;color:#64748b;margin-top:20px;line-height:1.5">${escapeHtml(footer)}</p>
    </div>
  `.trim();
}
