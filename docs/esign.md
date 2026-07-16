# Native e-signature (RMS)

Reusable electronic signature module — **not** DocuSeal.

## Flow

1. Domain code generates a professional PDF (parties, commercial table, terms, execution placeholders).
2. Super-admin opens `/super-admin/esign/[envelopeId]` and chooses **Recipient only** or **Owner + recipient**.
3. Signature/date fields are auto-placed on the execution section (adjustable).
4. If owner is required: reuse a saved owner signature or draw once (applied without walking field-by-field), then **Send**.
5. Recipient signs at `/sign/[token]` with OTP (optional saved signature by email).
6. Contract activates when the recipient completes signing.

Owner signing (when required) happens **before** send. Recipient-only envelopes skip owner signing.

## Context types

- `platform_company_contract` — first consumer (wired)
- Future: company–driver rental agreements, etc. (same envelopes + designer + `/sign`)

## GDPR / UK compliance notes

- **Lawful basis:** performance of a contract; security audit as related legitimate interest.
- **Collected:** email, name (optional), signature image, IP, user agent, timestamps.
- **Retention:** `esign_envelopes.retention_until` defaults to completion + 6 years; company permanent purge removes `esign-documents` objects for that company.
- **Not QES:** UI states this is contractual electronic acceptance, not eIDAS qualified electronic signature.
- **Processors:** Supabase (DB + Storage + Auth). DocuSeal is no longer a processor for RMS e-sign.
- **Rights:** contact the sending organisation; erasure may be limited while a signed agreement is needed for legal/accounting retention.

## Env

```env
# Optional SMTP for signing emails (Gmail app password, etc.). If unset, OTP is logged to the server console in dev.
SMTP_ADDRESS=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM="RMS <noreply@example.com>"

# Optional: mark contracts active without e-sign (local only)
# RENTAL_CONTRACT_LEGACY_BOOTSTRAP_SIGNED=true
```

## SQL

Apply [`supabase/migrations/20260415120000_esign_envelopes.sql`](../supabase/migrations/20260415120000_esign_envelopes.sql) or [`supabase/manual/ensure_esign_envelopes.sql`](../supabase/manual/ensure_esign_envelopes.sql).

Owner-first signing + saved signatures: [`supabase/migrations/20260416120000_esign_owner_signing.sql`](../supabase/migrations/20260416120000_esign_owner_signing.sql) or [`supabase/manual/ensure_esign_owner_signing.sql`](../supabase/manual/ensure_esign_owner_signing.sql).

Signature mode columns: [`supabase/migrations/20260417120000_esign_signature_mode.sql`](../supabase/migrations/20260417120000_esign_signature_mode.sql) (also included in the owner signing ensure script).
