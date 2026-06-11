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
