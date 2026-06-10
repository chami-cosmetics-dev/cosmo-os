# Cosmo Rider

Native delivery operations app for Cosmo OS riders — route management, payment collection, proof of delivery, and cash handovers.

Built with **Expo SDK 54**, **Expo Router**, and **React Native**. Talks to the same Next.js backend as the web dashboard via `/api/mobile/v1/*`.

## Prerequisites

- Node.js 20+
- [Expo Go](https://expo.dev/go) or Android Studio (emulator)
- Cosmo OS backend running locally (`npm run dev` from repo root)
- Rider account: user must have `employeeProfile.isRider = true` and active status

## Quick start

```bash
# Terminal 1 — backend (repo root)
npm install
npm run dev

# Terminal 2 — rider app
cd mobile/rider-app
npm install
cp .env.example .env
npm start
```

Set `EXPO_PUBLIC_API_BASE_URL` in `.env`:

| Environment | URL |
|-------------|-----|
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |
| Physical device | `http://<your-computer-lan-ip>:3000` |

The backend must be reachable from the device. For physical devices, use your machine's LAN IP, not `localhost`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run android` | Run on Android emulator/device |
| `npm run ios` | Run on iOS simulator (macOS only) |
| `npm run build:android:apk` | EAS APK for sideloading on Android devices |
| `npm run build:android:preview` | EAS staging/internal Android build (APK) |
| `npm run build:android:staging` | Alias for preview (staging) profile |
| `npm run build:android:production` | EAS production Android App Bundle |
| `npm run env:staging` | List EAS env vars for preview/staging |
| `npm run env:production` | List EAS env vars for production |

## Architecture

The app follows a layered structure. Routes stay thin; shared logic lives under `src/`.

```
mobile/rider-app/
├── app/                      # Expo Router — screens only (no business logic)
│   ├── _layout.tsx           # Root providers
│   ├── index.tsx             # Auth redirect gate
│   ├── login.tsx
│   ├── (tabs)/               # Tab navigator (route, completed, cash)
│   └── delivery/[tenant]/[id].tsx  # Delivery detail + actions (multi-tenant)
├── src/
│   ├── api/client.ts         # Tenant-aware HTTP client (Bearer auth)
│   ├── tenants/              # Cosmetics + Vault config and API URLs
│   ├── components/           # Reusable UI (DeliveryCard, PaymentForm, HeroBanner, etc.)
│   ├── hooks/                # Data + action hooks (useDeliveries, useDeliveryDetail, etc.)
│   ├── config.ts             # API base URL from env
│   ├── types/                # API response types (mirror lib/mobile/dto.ts)
│   ├── utils/                # Pure helpers
│   ├── providers/            # React context (auth, sync, theme, session gate)
│   ├── storage/              # SecureStore + AsyncStorage persistence
│   └── theme.ts              # Design tokens
```

### Multi-tenant (one APK)

Riders who deliver for **Cosmetics.lk** and **Supplement Vault** use a single app and one login. On sign-in the app authenticates against both backends in parallel and stores a token per company. Deliveries, cash summaries, and handovers are merged in the UI with company labels.

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_COSMETICS_API_URL` | Cosmo OS backend (e.g. `https://os.cosmetics.lk`) |
| `EXPO_PUBLIC_VAULT_API_URL` | Vault OS backend (e.g. `https://vault-os-sandy.vercel.app`) |
| `EXPO_PUBLIC_API_BASE_URL` | Dev fallback when tenant URLs are unset |

The same rider email/password must exist on both deployments with `employeeProfile.isRider = true`.

### Backend integration

```
┌─────────────────┐     Bearer tokens     ┌──────────────────────────┐
│  Cosmo Rider    │ ────────────────────► │  Cosmetics OS + Vault OS │
│  (Expo app)     │   (one per company)   │  /api/mobile/v1/*        │
└─────────────────┘                       └──────────────────────────┘
        │                                              │
        │ Offline queue (AsyncStorage)                 ▼
        └──────────────────────────────────►  PostgreSQL (Prisma)
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Screens | `app/` | UI, local form state, navigation |
| Providers | `src/providers/` | Session, offline sync, local completed cache |
| API client | `src/api/` | HTTP, auth headers |
| Types | `src/types/` | Contract with backend DTOs |
| Storage | `src/storage/` | Session (SecureStore), queue, preferences |
| Server | `lib/mobile/` + `app/api/mobile/v1/` | Auth, validation, business rules |

### Auth

Mobile uses bearer tokens (`RiderMobileSession`), separate from web Auth0 cookies. Login validates credentials via Auth0 Management API against each configured backend; the app stores tokens in Expo SecureStore (one per tenant).

- **Login:** parallel `POST /api/mobile/v1/auth/login` to Cosmetics + Vault
- **Logout:** revokes all tenant sessions server-side; clears SecureStore locally even if offline
- **401 handling:** removes the expired tenant token; redirects to login when no tenants remain

### Offline sync

Payment, complete, fail, and handover actions can be queued when offline. `SyncProvider` flushes the queue when connectivity returns.

## Release builds (EAS)

Environment is controlled with `EXPO_PUBLIC_APP_ENV` and baked in at build time via `app.config.ts`.

| EAS profile | App env | Android package | Use case |
|-------------|---------|-----------------|----------|
| `development` | development | `com.cosmo.rider.dev` | Dev client |
| `preview` | staging | `com.cosmo.rider.staging` | Internal QA / staging API |
| `production` | production | `com.cosmo.rider` | Play Store release |

### Required EAS environment variables

Set these in the [Expo dashboard](https://expo.dev) or with `eas env:create` for **preview** and **production** environments:

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_COSMETICS_API_URL` | Yes (production) | Cosmetics.lk Cosmo OS URL |
| `EXPO_PUBLIC_VAULT_API_URL` | Yes (production) | Supplement Vault OS URL |
| `EXPO_PUBLIC_API_BASE_URL` | Dev / fallback | Local or single-backend staging |
| `EXPO_PUBLIC_SENTRY_DSN` | Recommended | Sentry DSN for crash reports |
| `SENTRY_AUTH_TOKEN` | For source maps | EAS secret — upload debug symbols on build |
| `SENTRY_ORG` | For source maps | Sentry organization slug |
| `SENTRY_PROJECT` | For source maps | Sentry project slug |

Example:

```bash
cd mobile/rider-app

# Staging
eas env:create --environment preview --name EXPO_PUBLIC_API_BASE_URL --value https://staging.your-domain.com
eas env:create --environment preview --name EXPO_PUBLIC_SENTRY_DSN --value https://...

# Production
eas env:create --environment production --name EXPO_PUBLIC_COSMETICS_API_URL --value https://os.cosmetics.lk
eas env:create --environment production --name EXPO_PUBLIC_VAULT_API_URL --value https://vault-os-sandy.vercel.app
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value https://...

npm run build:android:staging
npm run build:android:production
```

Staging builds show **Cosmo Rider (Staging)** on the home screen so riders can distinguish them from production.

### Install an APK on rider phones

1. Build: `npm run build:android:apk` (or `preview` — both produce an APK).
2. When the build finishes, open the link from the terminal or [expo.dev](https://expo.dev) → your project → Builds.
3. Download the `.apk` on the phone (or scan the QR code).
4. Allow **Install unknown apps** for the browser/files app if Android prompts you.
5. Open the APK and install **Cosmo Rider (Staging)**.

The APK must be built with an API URL the phone can reach:

| Backend location | Example `EXPO_PUBLIC_API_BASE_URL` |
|------------------|-------------------------------------|
| Deployed staging/prod | `https://your-app.vercel.app` |
| Dev machine on same Wi‑Fi | `http://192.168.1.50:3000` (use your PC’s LAN IP, not `localhost`) |

Set that URL before building — via EAS env or inline:

```bash
cd mobile/rider-app
eas env:create --environment preview --name EXPO_PUBLIC_API_BASE_URL --value https://YOUR-BACKEND-URL
npm run build:android:apk
```

For a quick local debug APK (USB/emulator, no EAS):

```bash
npm run android
```

That installs a dev build from your machine; riders usually want the EAS APK instead.

### Monitoring

Sentry is optional locally and enabled when `EXPO_PUBLIC_SENTRY_DSN` is set. The API client reports non-401 failures to Sentry automatically.

## Conventions

- **Screens are thin** — extract reusable UI into `src/components/` as the app grows (Phase 3).
- **Types live in `src/types/`** — keep in sync with `lib/mobile/dto.ts` on the server.
- **Never trust the client** — all validation and authorization happen server-side in `lib/mobile/validation.ts`.
- **No secrets in the app** — only `EXPO_PUBLIC_*` env vars; backend holds Auth0 M2M credentials.

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| 1 — Cleanup | Done | Remove legacy code, docs, shared types, login fixes |
| 2 — Quality | Done | Tests, CI, 401 handling, logout endpoint |
| 3 — Structure | Done | Components, hooks, profile tab, theme provider |
| 4 — Release | Done | EAS env profiles, Sentry, staging/production config |
| 5 — Multi-tenant | Done | One APK for Cosmetics + Vault, merged route list |

## Related backend paths

- API routes: `app/api/mobile/v1/`
- Business logic: `lib/mobile/`
- Admin rider ops: `app/(dashboard)/dashboard/riders/`
- Prisma models: `RiderMobileSession`, `RiderDeliveryTask`, `DeliveryPayment`, `RiderCashHandover`
