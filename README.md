# cosmo-os

## Database setup

This app uses Prisma with PostgreSQL and expects two database URLs:

- `DATABASE_URL`: use the Neon pooled connection for the running app
- `DIRECT_URL`: use the Neon direct connection for Prisma schema operations like `db:push`, `db:migrate`, and restores

Neon mapping:

```env
DATABASE_URL="postgresql://neondb_owner:<password>@your-project-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:<password>@your-project.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

Why this split matters:

- the pooled Neon host works best for the app at runtime
- the direct Neon host is more reliable for Prisma migrations and restore scripts
- [`lib/prisma.ts`](/Users/chamigunawardane/Documents/Shopify/cosmo-os/lib/prisma.ts) automatically adds Neon-friendly pooled settings at runtime, including `pgbouncer=true`, `connect_timeout=15`, and removing `channel_binding=require` from pooled URLs

Local setup:

1. Copy [`.env.example`](/Users/chamigunawardane/Documents/Shopify/cosmo-os/.env.example) to `.env`.
2. Fill in your real Neon password and host values.
3. Run `npm run db:generate`.
4. If this is a fresh database, run `npm run db:push`.
5. Start the app with `npm run dev`.

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
