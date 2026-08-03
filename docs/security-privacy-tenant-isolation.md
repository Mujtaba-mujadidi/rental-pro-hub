# Security, Privacy and Tenant Isolation

Rental Pro Hub stores sensitive personal and company data (driver profiles and identity documents, licences, proof of address, signatures, contracts, vehicles, company legal details, invoices, payments, staff details, and internal notes). The product is **multi-tenant**. Security, privacy, object-level authorisation, and tenant isolation are mandatory acceptance criteria.

Agent-facing controls:

- Always-applied rule: [`.cursor/rules/rms-security.mdc`](../.cursor/rules/rms-security.mdc)
- Skill: [`.cursor/skills/rms-secure-development/SKILL.md`](../.cursor/skills/rms-secure-development/SKILL.md)
- Feature build quality: [`.cursor/rules/build.mdc`](../.cursor/rules/build.mdc) (does not replace security)

## Invariants

1. **Parent company is the tenant boundary.**  
   Company A must never read, mutate, search, count, export, or download Company B’s data.

2. **A user belongs to a company through membership** (`user_company_memberships`), not through client-supplied company IDs.

3. **Staff access is controlled by role/capability and subcompany scope.**  
   Use fixed roles and `can()` from `@/lib/auth/rental-permissions`. Subcompany scope answers *where*; capability answers *what*.

4. **Drivers own their platform profile** before a company relationship is approved.  
   RLS keeps `driver_profiles` / licence storage owner-scoped; company access is via authorised server paths only.

5. **A rental company cannot access a driver profile or identity documents until the driver approves access.**  
   Pending requests do not grant access. Live tables: `company_driver_access_requests`, `company_driver_links`, hire `driver_access_status`.

6. **Once approved, the company receives a fixed product-defined driver profile and identity-document access package.**  
   The driver does **not** select individual fields or document categories.

7. **Company staff access remains restricted by internal permissions.**  
   An active company↔driver relationship does not automatically grant every staff member identity-document access (e.g. finance-only).

8. **A company cannot view driver relationships or data belonging to another company.**

9. **Pending, rejected, revoked, or expired relationships do not allow access.**

10. **Documents are private by default** (private buckets; short-lived signed URLs only after authorisation).

11. **Every sensitive action is authorised server-side and audited** where the product requires an audit trail.

12. **RLS and application-layer authorisation are both required.**  
    Service-role usage must not skip application checks.

13. **Historical contracts, invoices, and payment records cannot be silently overwritten.**  
    Signed versions and issued invoices use snapshots / immutability rules.

## Session vs authorisation

Authentication establishes identity (Supabase session cookies, verified claims). Authorisation decides whether that identity may act on a specific company, subcompany, driver, or document. A valid login does not grant every resource. High-risk operations require a current server-side database authorisation check.

## Honest residual risk

Controls reduce risk; they do not eliminate it. Continued dependency maintenance, monitoring, access-control review, security testing, and periodic penetration testing remain necessary. Known implementation gaps versus this model (for example service-role licence lookups before approval, or company-side approval paths) must be tracked and remediated deliberately — see security skill references and engineering backlog.
