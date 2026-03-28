# Rental Pro Hub

Monorepo for **Rental Pro Hub** (PHV rental management): **Next.js** web app, **Expo** mobile app, **Supabase** (hosted).

## Requirements

- Node.js 20+
- npm 10+

## Phase 0 — setup

### 1. Environment

**Web** — copy [`apps/web/.env.example`](apps/web/.env.example) → `apps/web/.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Mobile** — copy [`apps/mobile/.env.example`](apps/mobile/.env.example) → `apps/mobile/.env`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Do not commit real keys. The **service role** key must never go in client env files.

### 2. Install

```bash
npm install
```

### 3. Run

```bash
npm run web
```

```bash
npm run mobile
```

## Layout

| Path | Purpose |
|------|---------|
| `apps/web` | Role-based web app (Next.js App Router) |
| `apps/mobile` | Role-based mobile app (Expo) |
| `packages/shared` | Shared constants/types |
| `supabase/migrations` | SQL migrations (Phase 1+) |

## Scripts

- `npm run web` — dev server for web
- `npm run mobile` — Expo dev tools
- `npm run lint` — lint all workspaces (where configured)
- `npm run typecheck` — TypeScript check all workspaces

## Monorepo note

The root `devDependency` on `next` exists so `eslint-config-next` can resolve Next’s ESLint parser when dependencies are hoisted to the repo root.

## Phase 1 — auth, tenancy, RLS (web)

### 1. Apply the SQL migration

In the [Supabase SQL Editor](https://supabase.com/dashboard), open and run the contents of:

[`supabase/migrations/20260327190000_phase1_auth_tenancy.sql`](supabase/migrations/20260327190000_phase1_auth_tenancy.sql)

This creates `user_profile`, `rental_company`, `subcompany`, staff/role tables, RLS policies, the `auth.users` → profile trigger, and the `admin_add_company_staff` RPC.

If the trigger syntax errors on your Postgres version, change the last line to use `execute function` instead of `execute procedure` (or the reverse), per your project’s Postgres docs.

### 2. Make your first platform admin

Sign up once through `/signup`, then in SQL Editor (replace the UUID with your `auth.users.id`, or match by email):

```sql
update public.user_profile
set user_type = 'platform_admin', updated_at = now()
where id = (select id from auth.users where email = 'you@example.com');
```

### 3. Typical flow

1. **Admin** — `/admin/companies`: create a rental company; open **Manage** to add subcompanies and **link staff by email** (the user must have signed up already).
2. **Staff** — after being linked, open **Subcompanies** to create/list subcompanies for their company.
3. **Drivers** — sign up stays on `driver` until you add staff flows for them in later phases.

### 4. Auth settings

In Supabase **Authentication → Providers**, keep **Email** enabled. For local dev, turning **Confirm email** off avoids extra friction; turn it on for production when ready.
