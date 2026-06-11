# cosmo-os

## Database setup

This app uses Prisma with PostgreSQL and expects two database URLs per environment:

- `DATABASE_URL`: use the Neon pooled connection for the running app
- `DIRECT_URL`: use the Neon direct connection for Prisma schema operations like `db:deploy` and `db:migrate`

The same codebase runs **Vault OS** and **Cosmo OS** against **three separate Neon databases**. Use one env file per target:

| Target | Env file | Use for |
|--------|----------|---------|
| Vault OS | `.env.vault` | Supplement Vault DB + Auth0 |
| Cosmo OS dev | `.env.cosmo-dev` | Team dev DB + Auth0 |
| Cosmo OS prod | `.env.cosmo-prod` | Production DB + Auth0 (migrations only) |

Copy the matching `.example` file for each target and fill in credentials from the team.

```bash
cp .env.vault.example .env.vault
cp .env.cosmo-dev.example .env.cosmo-dev
npm run env:use vault          # or cosmo-dev — copies target → .env
npm run db:generate
npm run db:deploy:cosmo-dev    # or db:deploy:vault
npm run dev
```

After a new migration is merged, apply it to **all** databases:

```bash
npm run db:deploy:all
```

See [`.env.example`](/.env.example) for the full command reference. **Do not use `db:push` on shared or production databases.**

### Creating new migrations

Do **not** use `npm run db:migrate` (`prisma migrate dev`) — the repo has no base init migration, so the shadow database fails with P3006.

Instead, after editing `prisma/schema.prisma`:

```bash
npm run db:migrate:create -- your_change_name
npm run db:deploy:all
```

This diffs cosmo-dev against the schema and writes `prisma/migrations/<timestamp>_your_change_name/migration.sql`.

Neon mapping:

```env
DATABASE_URL="postgresql://neondb_owner:<password>@your-project-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:<password>@your-project.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

Why this split matters:

- the pooled Neon host works best for the app at runtime
- the direct Neon host is more reliable for Prisma migrations and restore scripts
- [`lib/prisma.ts`](/Users/chamigunawardane/Documents/Shopify/cosmo-os/lib/prisma.ts) automatically adds Neon-friendly pooled settings at runtime, including `pgbouncer=true`, `connect_timeout=15`, and removing `channel_binding=require` from pooled URLs

If you are moving data from Supabase into Neon, use [`scripts/migrate-supabase-to-neon.sh`](/Users/chamigunawardane/Documents/Shopify/cosmo-os/scripts/migrate-supabase-to-neon.sh). It already restores into `DIRECT_URL`.

## Mobile app (Cosmo Rider)

The rider delivery app lives in [`mobile/rider-app`](mobile/rider-app). It is a standalone Expo project that connects to the same Next.js backend.

```bash
# Start backend first
npm run dev

# In a second terminal
cd mobile/rider-app
npm install
cp .env.example .env   # set EXPO_PUBLIC_API_BASE_URL
npm start
```

See [`mobile/rider-app/README.md`](mobile/rider-app/README.md) for architecture, environment setup, and EAS build instructions.

Mobile login requires Auth0 M2M credentials in the root `.env` (`AUTH0_M2M_CLIENT_ID`, `AUTH0_M2M_CLIENT_SECRET`, `AUTH0_DATABASE_CONNECTION`).

### Mobile quality checks

From the repo root:

```bash
npm test                 # lib/mobile unit tests (Vitest)
npm run mobile:typecheck # TypeScript check for rider app
```

CI runs both on pull requests (see `.github/workflows/ci.yml`).


#NPM command for run project

COSMO-OS / VAULT OS — NPM COMMANDS CHEAT SHEET
================================================

FIRST-TIME SETUP
----------------
npm install

cp .env.vault.example .env.vault
cp .env.cosmo-dev.example .env.cosmo-dev
cp .env.cosmo-prod.example .env.cosmo-prod
(Fill in credentials in each file — never commit these files)


SWITCH ENVIRONMENT (copies target → .env)
-----------------------------------------
npm run env:use              Interactive menu
npm run env:use vault        Vault OS
npm run env:use cosmo-dev    Cosmo OS dev
npm run env:use cosmo-prod   Cosmo OS prod (migrations only — not daily dev)


RUN WEB APP
-----------
npm run dev                  Uses current .env
npm run dev:vault            Vault OS (without switching .env)
npm run dev:cosmo-dev        Cosmo dev (without switching .env)
npm run build                Production build
npm run start                Run built app


DATABASE — MIGRATIONS
---------------------
npm run db:generate          Regenerate Prisma client

npm run db:migrate           CREATE new migration (cosmo-dev only)

npm run db:deploy            Apply migrations → cosmo-dev (default)
npm run db:deploy:cosmo-dev  Apply migrations → cosmo-dev
npm run db:deploy:vault      Apply migrations → vault
npm run db:deploy:cosmo-prod Apply migrations → prod
npm run db:deploy:all        Apply to all 3 DBs (prod asks for "yes")


DATABASE — CHECK STATUS
-----------------------
npm run db:status:cosmo-dev
npm run db:status:vault
npm run db:status:cosmo-prod


DATABASE — AVOID ON SHARED/PROD
-------------------------------
npm run db:push              Local throwaway DB only — NOT shared/prod


TESTS & LINT
------------
npm test
npm run test:watch
npm run lint
npm run mobile:typecheck


DATA SCRIPTS
------------
npm run contacts:import
npm run contacts:backfill:orders
npm run products:import-statuses


MOBILE RIDER APP (second terminal)
----------------------------------
cd mobile/rider-app
npm install
cp .env.example .env
npm start
npm run android
npm run ios


TYPICAL DAILY FLOWS
-------------------

Vault OS:
  npm run env:use vault
  npm run dev

Cosmo dev:
  npm run env:use cosmo-dev
  npm run dev

After pulling dev branch:
  git pull origin dev
  npm install
  npm run db:generate
  npm run db:deploy:cosmo-dev    (or db:deploy:vault for your DB)

After new migration merged:
  npm run db:deploy:all

Fix failed migration (example):
  node scripts/with-env.mjs cosmo-dev npx prisma migrate resolve --applied "MIGRATION_NAME"
  npm run db:deploy:cosmo-dev


ENV FILES REFERENCE
-------------------
.env.vault       Vault OS DB + Auth0
.env.cosmo-dev   Cosmo dev DB + Auth0
.env.cosmo-prod  Cosmo prod DB + Auth0 (lead/CI only)
.env             Active copy (set by npm run env:use)

Rules:
  - One prisma/migrations folder for all 3 databases
  - After schema change: deploy to ALL databases
  - Never db:push on shared or production databases
  - Prod credentials stay in .env.cosmo-prod only
