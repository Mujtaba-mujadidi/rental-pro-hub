# Access-control model (Rental Pro Hub)

Authoritative product model for agents. Map to live schema when implementing (see Current schema mapping).

## Principles

Access to a protected resource requires the **appropriate combination** of:

| Check | Answers |
| --- | --- |
| Authenticated + active user | Who is acting? |
| Active parent-company membership | Which tenant? |
| Role / capability (`can()`) | What may this staff member do? |
| Subcompany scope | Where may they do it? |
| Resource ownership / tenant FK | Does this row belong to that tenant? |
| Active driver–company relationship | May this company access this driver? |
| Valid resource status + permitted action | Is this operation allowed now? |

Do **not** treat any single role or `can()` check as sufficient for all access.

### Never trust client-supplied

User ID, role, company ID, parent company ID, subcompany ID, driver ID, access status, document ID, invoice total, payment status, super-admin status.

Resolve from **server session + database**.

---

## Actors

| Actor | Notes |
| --- | --- |
| Unauthenticated user | Public routes only; no tenant or driver PII |
| Driver | Owns platform profile; grants company access via approval |
| Rental company owner | Full company capabilities per `can()` |
| Rental company admin | Staff/settings/onboarding/contract per matrix |
| Operations staff | Fleet / rentals write; not staff.manage |
| Finance staff | Billing pay; limited fleet write |
| Viewer | Read-oriented capabilities only |
| Super admin | Platform operator; server-side only elevation |
| Suspended user | No access |
| Revoked former staff | Membership inactive; no access |

Staff roles: `owner` \| `admin` \| `operations` \| `finance` \| `viewer` — see `.cursor/rules/fixed-rental-roles.mdc` and `@/lib/auth/rental-permissions`.

---

## Driver access approval (relationship-level)

A rental company must **not** view a driver’s profile or identity documents until the driver has **approved** access.

- Approval is a **single product-defined access package** — the driver does **not** choose individual fields or document categories.
- Do **not** build a driver-controlled per-field / per-document permission selector.
- Statuses: `pending` \| `active` (approved) \| `rejected` \| `revoked` \| `expired` (map to live columns as documented below).
- **`pending` does not allow** profile or document access. Only **active/approved** does.
- Access must fail immediately when rejected, revoked, or expired.
- Approval must be **auditable**.
- Companies must not browse/search all platform drivers; use controlled invite/connect workflows.
- Avoid exposing whether unrelated driver accounts exist.
- After approval, **staff `can()` still applies** — e.g. finance-only must not automatically gain identity-document access.
- Company access **never** includes the driver’s relationships or data with **other** companies.
- After relationship end, retained records follow retention / legal-access rules only.

### Package (when active + staff permitted)

May include (where stored): driver profile, contact, address, identity info/docs, licence info/docs, proof of address, contracts with **that** company, vehicle assignments for that relationship, payments for that company, documents for that relationship.

### Explicitly out of package

Other companies’ contracts, payments, vehicles, notes, exclusive documents, unrelated platform data.

---

## Current schema mapping

| Product concept | Current tables / fields |
| --- | --- |
| Access request | `company_driver_access_requests` (`pending` / `approved` / `rejected` / `expired`) |
| Active link | `company_driver_links` (`active` / `removed`) |
| Hire-gated access | `vehicle_hire_groups.driver_access_status`, `driver_profile_confirmed` |
| Staff membership | `user_company_memberships` |
| Subcompany allow-list | `user_subcompany_permissions` when `subcompany_scope = explicit` |

Suggested future table name `driver_company_access_grants` is a **product model**; prefer extending the tables above unless a dedicated migration is approved.

---

## Resources and actions (summary matrix)

Legend: **A** = allow (with listed conditions); **D** = deny; **C** = conditional.

Conditions abbreviations:

- **M** = active company membership  
- **Cap** = `can()` capability  
- **Sub** = subcompany scope where resource is subcompany-scoped  
- **DA** = active/approved driver–company relationship  
- **Own** = resource owned by actor (driver) or tenant  
- **Audit** = write audit event  

| Resource | Actor class | Read | Write / mutate | Notes |
| --- | --- | --- | --- | --- |
| Parent company | Staff | C: M | C: Cap + M | Tenant root |
| Subcompany | Staff | C: M+Sub | C: Cap+Sub | |
| Staff | Owner/admin | C: Cap | C: Cap | Cannot self-escalate |
| Driver profile | Driver | A: Own | A: Own | |
| Driver profile | Staff | C: M+DA+Cap | C: rare / Cap | No access if pending |
| Driver identity docs | Staff | C: M+DA+Cap | C: Cap | Stricter Cap than finance-only |
| Driver identity docs | Driver | A: Own | A: Own | |
| Driver licence / PoA | Same as identity docs | | | |
| Rental contract | Staff | C: M+Sub+Cap | C: Cap | Own company only |
| Rental contract | Driver | C: party to hire | C: sign/respond only | |
| Vehicle | Staff | C: M+Sub+Cap | C: Cap | |
| Invoice | Staff | C: M+Cap | Server-calculated | No client totals |
| Payment submission | Staff/driver | C: relationship | Submit ≠ set paid | Validation = super-admin / policy |
| Company agreement / legal | Owner/admin | C: Cap | C: Cap + versioning | |
| Audit log | Elevated staff / SA | C: Cap | D for ordinary users | Append-only |
| Data export | Cap + M | C | Audit + rate limit | Fresh authz |

### Super admin

- Elevation **server-side only** (not email domain alone as sole trust in new code — align with `isSuperAdmin` + profile role).
- Audit sensitive document access, legal changes, payment validation, impersonation.
- Impersonation: explicit, visible, time-limited, clear exit.

### Deny always

- Cross-tenant read/write/search/count/export/download.
- Client-supplied role or company ID changing scope.
- Self role increase / assigning permissions the actor lacks.
- Bypassing driver approval via IDOR or service-role without checks.

---

## Staff permission layering

1. **Role / `can()`** — what modules.  
2. **Subcompany scope** — where.  
3. **Driver approval** — whether the company may access this driver at all.  

All three apply for driver PII and identity documents.
