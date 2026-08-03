# Security test cases (implementation-ready)

Stack: Next.js server actions / route handlers, Supabase Auth + RLS, Vitest in `apps/web`. Prefer **integration-style** tests that call server actions or exercise policies with distinct users — not “button hidden” UI-only checks.

For each protected endpoint, cover where relevant: authorised; unauthenticated; wrong-role; wrong-tenant; wrong-driver; wrong-subcompany; pending-access; revoked-access.

Assert: **HTTP/action result**, **database state**, and **audit row** when auditing is required.

---

## Tenant isolation

### T1 — Company A cannot access Company B company row

| Field | Value |
| --- | --- |
| Actor | Company A staff (owner) |
| Setup | Two parent companies A, B |
| Resource owner | B |
| Request | Load/update B by ID while session is A |
| Expected | Deny / not found |
| DB | Unchanged |
| Audit | Optional deny log |

### T2 — Company A cannot list/search Company B drivers / vehicles / contracts / invoices / documents

Same pattern for each resource type: scope must exclude B; counts/exports must not leak B.

### T3 — Client-supplied `parent_company_id` / `company_id` ignored

| Actor | A staff |
| Setup | Body/query claims `parent_company_id = B` |
| Expected | Scope remains A; B data unreachable |

### T4 — UUID/IDOR

| Actor | A staff |
| Setup | Valid A session; resource ID belonging to B |
| Expected | Deny; no existence leak that confirms B’s record if product policy requires opacity |

---

## Driver isolation

### D1 — Driver A cannot view/edit Driver B profile

| Actor | Driver A |
| Resource owner | Driver B |
| Expected | Deny |

### D2 — Driver A cannot download Driver B documents

| Actor | Driver A |
| Request | Signed URL or download for B’s licence path |
| Expected | Deny; no usable URL |

---

## Driver–company approval

### A1 — Pending: staff cannot load full profile / identity docs

| Actor | Ops/admin of company A |
| Setup | Access request `pending` for Driver D; no active link |
| Expected | Deny profile/docs |

### A2 — Approved + capable staff: profile package allowed

| Actor | Staff with Cap for driver review |
| Setup | Request `approved` + active `company_driver_links` |
| Expected | Allow product-defined package |
| Note | Not field-picked permissions |

### A3 — Finance-only cannot view identity docs (unless Cap allows)

| Actor | Finance membership |
| Setup | Active approval |
| Expected | Deny identity docs if Cap lacks module |

### A4 — Rejected / revoked / expired: no access

| Actor | Staff |
| Setup | Each terminal status |
| Expected | Immediate deny |

### A5 — Approval does not expose other companies’ data for that driver

| Actor | Company A staff |
| Setup | Driver also linked historically to B |
| Expected | A sees only A relationship data |

### A6 — Company staff approving on behalf of driver (if present)

Document current behaviour as **conflict** with product rule if staff can set `approved` without driver action; add regression once product enforces driver-only approval.

---

## Subcompany and role

### S1 — Explicit scope: Subcompany A staff cannot access Subcompany B resources

### S2 — Viewer cannot perform write actions (`can()` false)

### S3 — User cannot increase own role / assign Cap they lack

### S4 — Normal admin cannot access super-admin routes

---

## Documents / storage

### F1 — Another tenant’s storage path cannot be downloaded

### F2 — Expired signed URL fails

### F3 — Unsafe upload rejected (type/size/extension)

### F4 — Company cannot replace/delete another company’s object

---

## Payments / invoices / contracts

### P1 — Client-supplied invoice totals ignored/rejected

### P2 — Rental company cannot set invoice/payment to paid

### P3 — Duplicate payment validation idempotent

### P4 — Discount requires reason; billing amendment requires reason

### P5 — Historical invoices unchanged after future pricing change

### P6 — Signed contract versions immutable

### P7 — Invalid/replayed webhook rejected

---

## Logging

### L1 — Sensitive values absent from normal logs (tokens, signed URLs, full doc numbers, document bytes)

---

## Suggested Vitest shape

```ts
// Pseudocode — use existing action test harness / supabase test users when available
it("denies company A reading company B hire", async () => {
  // sign in as A → call loadX(B.id) → expect error
  // assert no mutation; optional audit
});
```

Prefer shared fixtures for two companies, two drivers, pending vs approved access, and explicit subcompany memberships.

Do not claim coverage is complete until negative cases above exist for the changed surface.
