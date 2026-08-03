# Prioritised security gaps (vs documented model)

Snapshot after introducing `.cursor/rules/rms-security.mdc` and `rms-secure-development`. Not a claim of a full audit.

| Priority | Gap | Evidence (approx.) | Recommended next action |
| --- | --- | --- | --- |
| P0 | Pre-approval global driver licence scan via service role | Hire wizard loads many `driver_profiles` to match licence | Replace with constrained lookup (hash/index) that does not dump PII; never scan all drivers |
| P0 | Company staff can approve driver access requests | `resolveDriverAccessRequestAction` in `rental-driver-links.ts` | Enforce driver-only approval for profile access (or product-documented exception with audit) |
| P1 | Driver PII/docs gated only in app (service role), not RLS for company reads | Pattern across hire/driver preview actions | Shared authz helper + negative tests; longer-term RLS or SECURITY DEFINER accessors with checks |
| P1 | `assertSubcompanyInTenant` ≠ explicit subcompany scope | Vehicle/fleet helpers | Re-check `user_subcompany_permissions` on every admin path |
| P2 | Vehicle-documents storage select broader than table RLS | Membership on parent folder | Tighten storage policies to subcompany where required |
| P2 | Sparse automated negative authz tests for access/docs | Vitest coverage | Add cases from `security-test-cases.md` for hire access + document download |
| P3 | Super-admin env email + profile role dual paths | `roles.ts` / policies | Document and harden single source of truth + MFA ops process |
| P3 | No malware quarantine pipeline | Document security ref | Track residual risk; harden allow-lists |

Foundational docs/rules were added in this change. Behavioural remediations above should be separate, reviewed tickets — do not “fix” P0 by weakening other controls.
