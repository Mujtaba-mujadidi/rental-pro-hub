# Prioritised security gaps (vs documented model)

Updated after `fix/security-hardening` remediations (2026-08-03). Not a claim of a full audit or that the application is vulnerability-free.

| Priority | Gap | Status | Notes |
| --- | --- | --- | --- |
| P0 | Self-assign `profiles.role = super_admin` | **Mitigated** | Trigger + tightened insert policy; privileged profile writes require service role |
| P0 | Unauthenticated `loadDriverLabelsMap` server action | **Mitigated** | Moved to internal `@/lib/fleet/driver-labels` (not a server action) |
| P0 | Global driver licence PII scan | **Mitigated** | Normalised column + exact `.eq` lookup; apply migration `20260803120000_security_privileged_columns.sql` |
| P0 | Staff can approve driver access | **Mitigated** | `resolveDriverAccessRequestAction` rejects approve; driver-only paths remain |
| P0 | Broad membership/`companies` JWT updates | **Mitigated** | Triggers block identity / lifecycle / legal hijacks under JWT |
| P0 | Stale membership → admin-ish fallback | **Mitigated** | No active membership clears tenant context; `requireRentalCompanyArea` / writable guard require membership |
| P0 | E-sign OTP/links logged when mail unset | **Mitigated** | Mail refuses send without logging body |
| P1 | Finance/viewer identity docs | **Mitigated** | `driver.identity.read` for owner/admin/operations only |
| P1 | Pending request emails | **Mitigated** | List returns labels only |
| P1 | Logo signed URL path trust | **Mitigated** | Path must be `{parent}/{sub}/…` |
| P1 | Client-controlled payment proof path | **Mitigated** | Ignored until real upload exists |
| P1 | E-sign envelope expiry on token / complete | **Mitigated** | Checked in `findRecipientByAccessToken` + `completeSigning` |
| P1 | Subcompany scope on mutations / hire inspections RLS | **Open** | Still parent-membership based in places |
| P1 | Driver PII mainly app-gated (service role) | **Open** | Residual; missed app check remains high impact |
| P2 | Vehicle storage broader than subcompany | **Open** | |
| P2 | Negative authz automated tests | **Open** | Add cases from skill `security-test-cases.md` |
| P2 | OTP attempt race | **Partial** | Optimistic `otp_attempts` match on failure path |
| P2 | Audit fail-open | **Open** | |
| P3 | Super-admin env email + DB role dual trust | **Open** | DB role still trusted but no longer self-writable |
| P3 | Malware quarantine | **Open** | Residual |

## Deploy note

Apply migration (or `supabase/manual/ensure_security_privileged_columns.sql`) before relying on licence exact-match in production.
