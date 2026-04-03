export function getDocusealApiBaseUrl(): string {
  const u = process.env.DOCUSEAL_BASE_URL?.trim();
  return u && u.length > 0 ? u.replace(/\/$/, "") : "https://api.docuseal.com";
}

export function getDocusealApiKey(): string | null {
  const k = process.env.DOCUSEAL_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

export function getDocusealContractTemplateId(): number | null {
  const raw = process.env.DOCUSEAL_CONTRACT_TEMPLATE_ID?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** When true, new companies get legacy “already signed” contract rows (local dev without DocuSeal). */
export function useLegacyBootstrapContractSigning(): boolean {
  const legacy = process.env.RENTAL_CONTRACT_LEGACY_BOOTSTRAP_SIGNED?.trim().toLowerCase();
  if (legacy === "true" || legacy === "1") return true;
  if (legacy === "false" || legacy === "0") return false;
  return getDocusealApiKey() == null;
}

export function getDocusealWebhookSecret(): string | null {
  const s = process.env.DOCUSEAL_WEBHOOK_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}

export function getDocusealWebhookHeaderName(): string {
  return process.env.DOCUSEAL_WEBHOOK_HEADER_NAME?.trim() || "X-Webhook-Secret";
}
