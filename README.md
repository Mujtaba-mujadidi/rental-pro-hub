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
