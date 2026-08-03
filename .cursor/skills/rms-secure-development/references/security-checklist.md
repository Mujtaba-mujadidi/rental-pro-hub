# Security checklist (Rental Pro Hub)

Use before marking a security-sensitive change complete. Check only what applies; do not tick items you did not verify.

## Authentication and session

- [ ] User authenticated via existing Supabase Auth
- [ ] Server trusts verified identity (claims / `getUser`), not `getSession()` alone
- [ ] Active account / not suspended
- [ ] Session cookies secure; no secrets in `NEXT_PUBLIC_*`
- [ ] No password re-prompt required for ordinary navigation
- [ ] High-risk actions use fresh server authz (not stale permission cache alone)

## Company membership and tenant scope

- [ ] Active parent-company membership resolved server-side
- [ ] Every tenant query scoped to authorised `parent_company_id`
- [ ] No fetch-by-ID without tenant (or ownership) predicate
- [ ] Client-supplied company IDs cannot change scope
- [ ] List / detail / update / delete / search / count / export all scoped
- [ ] Cache keys include user + parent-company context

## Subcompany scope

- [ ] Explicit vs `all` scope enforced for staff
- [ ] Wrong-subcompany access denied
- [ ] Admin/service-role paths re-check scope (not RLS-only assumption)

## Driver approval

- [ ] Pending ≠ profile/docs access
- [ ] Active/approved required for company access to driver package
- [ ] Rejected / revoked / expired fail closed immediately
- [ ] No cross-company driver data leakage
- [ ] Package is fixed product-defined (no per-field driver picker)
- [ ] Staff Cap still required for identity documents

## Module permission (`can()`)

- [ ] Uses `@/lib/auth/rental-permissions` — no DIY matrix
- [ ] Combined with membership, scope, ownership, driver approval
- [ ] No self-escalation or assigning Caps the actor lacks

## Object ownership

- [ ] Resource belongs to authorised tenant / driver
- [ ] Browser resource IDs treated as untrusted handles

## RLS and database

- [ ] RLS on SELECT/INSERT/UPDATE/DELETE for touched tables
- [ ] App authorisation **and** RLS (neither replaces the other)
- [ ] Tenant ownership columns not client-editable
- [ ] Security-definer functions reviewed (caller + search_path)
- [ ] Migration + `ensure_*.sql` if schema changed

## Storage and documents

- [ ] Private bucket
- [ ] Authz before signed URL
- [ ] Server-generated paths; no cross-tenant path control
- [ ] Type / size / extension validation
- [ ] Safe download headers; no signed URL in logs
- [ ] Sensitive access audited

## Input validation

- [ ] Strict server schemas
- [ ] Unknown/forbidden fields rejected
- [ ] User-safe errors; no stack/DB leakage

## Logging and audit

- [ ] Sensitive actions audited (actor, tenant, target, outcome, time)
- [ ] No secrets / tokens / document bodies / unnecessary PII in logs or audit payloads
- [ ] Audit not editable by ordinary users

## Payments / contracts / webhooks

- [ ] Server-side money calculations
- [ ] Client cannot set paid / totals / snapshots
- [ ] Idempotent validation; reasons for discounts/amendments
- [ ] Webhooks verified; replays rejected

## Tests

- [ ] Positive authorised path
- [ ] Negative: unauthenticated, wrong-role, wrong-tenant, wrong-driver, wrong-subcompany, pending, revoked
- [ ] Document download negative case if docs touched
- [ ] Commands run and passing

## Secrets and dependencies

- [ ] No service-role key or secrets committed
- [ ] Dependencies unchanged or reviewed for known issues

## Residual risk

- [ ] Unresolved risks documented honestly
- [ ] No claim of “fully secure” / vulnerability-free
