# RMS — progress tracker

**Last updated:** 2026-07-16  
**Epic:** Native reusable e-signature + company lifecycle  
**Plan:** [esign.md](./esign.md) · historical: [plans/esign-and-rental-onboarding.md](./plans/esign-and-rental-onboarding.md)

---

## Quick resume

1. Apply SQL (remote Supabase) if not already:
   - [`ensure_esign_envelopes.sql`](../supabase/manual/ensure_esign_envelopes.sql)
   - [`ensure_esign_owner_signing.sql`](../supabase/manual/ensure_esign_owner_signing.sql)
   - company deletion / contract status scripts as needed
2. `SMTP_*` in `apps/web/.env.local` for signing + invite emails
3. Smoke: register company → Prepare e-sign → mode → (owner name+sig) → Send → `/sign/[token]` + OTP → contract `active`

---

## Done (this epic)

| Area | State |
|------|--------|
| Native e-sign schema + Storage bucket | Done |
| Professional PDF (parties, commercial, terms new page, execution) | Done |
| Signature mode: recipient only vs owner + recipient | Done |
| Auto placeholders (sig + full name + date) inside execution cards | Done |
| Owner quick-sign with confirmed printed name; date auto | Done |
| Field designer (hide owner tools in recipient-only) | Done |
| Public OTP signing walkthrough | Done |
| Platform company contract adapter + regenerate PDF by mode | Done |
| Companies table: contract status labels, Prepare/View, loaders | Done |
| Action loaders (reset password, invite, send e-sign, login forgot) | Done |
| Rental gating / awaiting-contract / offboarding / account-closed | Done |
| DocuSeal product path | Removed |
| Company deletion lifecycle (offboarding → purge) | Done (code + SQL) |

---

## Next actions (build order)

### Stabilize e-sign (short)

- [ ] Confirm remote SQL applied (envelopes + owner signing + signature mode columns)
- [ ] Full E2E smoke on staging/prod-like Supabase (both signature modes)
- [ ] Audit trail / signed PDF download from companies row (polish if gaps)
- [ ] Void / resend envelope when email fails or link expires

### Product next (pick one track)

1. **Fleet / vehicles** — in progress on `feature/vehicle-fleet-module` (CRUD, transfer, docs)
2. **Driver hire / assignment** — after vehicles
3. **Hire agreements via e-sign** — reuse envelope module
4. **Billing after active contract** — invoices/payments only when agreement active (tighten UX)
5. **Amendments / renewals** — re-issue e-sign when commercial terms change

---

## Session log

| Date | What happened |
|------|----------------|
| 2026-07-17 | Branch `feature/vehicle-fleet-module`: vehicles schema/RLS, rental Vehicles UI (CRUD, transfer, docs) |
| 2026-07-16 | PDF layout (terms/execution page breaks, field placement); owner name confirm; send/reset loaders; back navigation; recipient-only hides owner fields |
| 2026-07-15 | Native e-sign module shipped; DocuSeal deleted from product path |
| 2026-05-19 | Earlier DocuSeal local setup (superseded) |
