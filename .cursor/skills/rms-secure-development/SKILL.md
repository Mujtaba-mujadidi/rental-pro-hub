---
name: rms-secure-development
description: Secure design, implementation and review for Rental Pro Hub. Use whenever creating or changing authentication, authorisation, users, rental companies, subcompanies, staff access, drivers, driver access approval, vehicles, contracts, documents, invoices, payments, signatures, APIs, Supabase RLS, storage, webhooks, exports or any feature involving personal or company data.
---

# Rental Pro Hub — secure development

Use this skill for any change that touches identity, tenancy, drivers, documents, money, contracts, or Supabase security.

Read the references under this skill when needed:

- [access-control-model.md](references/access-control-model.md)
- [document-security.md](references/document-security.md)
- [security-test-cases.md](references/security-test-cases.md)
- [security-checklist.md](references/security-checklist.md)

Also obey the always-applied rule `.cursor/rules/rms-security.mdc` and fixed roles in `.cursor/rules/fixed-rental-roles.mdc`.

---

## Before coding

1. Identify all **actors** (driver, staff roles, super-admin, unauthenticated, suspended, revoked).
2. Identify **parent-company** and **subcompany** boundaries.
3. Identify whether **driver-owned** data is involved.
4. Identify the required **active driver–company** relationship (pending ≠ access).
5. Define **allowed** actions.
6. Define **denied** actions (especially cross-tenant and cross-driver).
7. Inspect current server-side permission helpers (`can()`, `require*`, membership/scope helpers).
8. Inspect **RLS** and **storage** policies for touched tables/buckets.
9. Identify **IDOR**, cross-tenant, file-access, and privilege-escalation risks.
10. Define required **positive and negative** tests.

Map product language to current schema where present:

- Access requests / approval: `company_driver_access_requests` (+ hire `driver_access_status`).
- Active company↔driver link: `company_driver_links`.
- Staff: `user_company_memberships` + `user_subcompany_permissions`.
- Prefer extending these over inventing parallel grant tables unless a migration is explicitly required.

---

## During coding

1. Implement **server-side authorisation first**.
2. Scope all **tenant-owned** queries to the authorised parent company.
3. Scope all **driver-owned** queries to the authorised driver or approved relationship.
4. Validate the **driver–company access** relationship before company access to profile/identity docs.
5. Validate company staff **role/capability** (`can()`) and **subcompany scope**.
6. Validate input with **strict server-side schemas**; reject unknown/forbidden fields.
7. Protect **document storage and downloads** (private buckets; auth then short-lived signed URLs).
8. Add **audit** records for sensitive actions.
9. Add appropriate **tests** (especially negative cases).
10. Avoid personal data and secrets in **logs**.

### Service role

- Never expose the service-role key to the browser.
- Every admin/service-role path must re-check authz in application code (tenant, ownership, driver approval, capability).
- Do not use service role to “make it work” by skipping checks.

### Session vs authorisation

- Authentication = who is signed in (verified claims / user; cookie session + refresh).
- Authorisation = whether they may act on this company / subcompany / driver / document.
- Reuse verified user and permission context within one request; do not password-prompt on every navigation.
- Do not treat `getSession()` alone as proof of identity for trusted server authorisation — prefer verified claims / `getUser` patterns already used in `apps/web/src/lib/auth/profile.ts`.
- High-risk operations require a fresh DB-backed authorisation check (see `rms-security.mdc`).

---

## After coding

1. Run relevant unit and integration tests.
2. Test **ID substitution** (IDOR).
3. Test **wrong-tenant** access.
4. Test **wrong-driver** access.
5. Test **revoked / inactive** relationships.
6. Test **wrong subcompany**.
7. Test **wrong role**.
8. Test **document downloads**.
9. Review **logs and error responses** (no existence leaks / secrets).
10. Report **residual risks** honestly — never claim the application is fully secure.

Use wording such as:

> The implemented controls address the identified risks, but continued dependency maintenance, monitoring, access-control review, security testing, and periodic penetration testing remain necessary.

---

## Acceptance (security-sensitive features)

Not complete until: authentication; object-level server authorisation; tenant scope; driver approval where applicable; staff capability; subcompany scope; input schemas; private documents; audit events; wrong-tenant / wrong-driver / revoked-access tests pass; no secrets committed; relevant tests/typecheck/lint/build pass; unresolved risks documented.

Work through [security-checklist.md](references/security-checklist.md) before declaring done.
