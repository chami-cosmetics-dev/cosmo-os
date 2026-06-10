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
| `npm run build:android:preview` | EAS internal Android build |
| `npm run build:android:production` | EAS production Android App Bundle |

## Architecture

The app follows a layered structure. Routes stay thin; shared logic lives under `src/`.

```
mobile/rider-app/
├── app/                      # Expo Router — screens only (no business logic)
│   ├── _layout.tsx           # Root providers
│   ├── index.tsx             # Auth redirect gate
│   ├── login.tsx
│   ├── (tabs)/               # Tab navigator (route, completed, cash)
│   └── delivery/[id].tsx     # Delivery detail + actions
├── src/
│   ├── api/client.ts         # HTTP client (Bearer auth)
│   ├── config.ts             # API base URL from env
│   ├── types/                # API response types (mirror lib/mobile/dto.ts)
│   ├── utils/                # Pure helpers
│   ├── providers/            # React context (auth, sync, completed)
│   ├── storage/              # SecureStore + AsyncStorage persistence
│   └── theme.ts              # Design tokens
```

### Backend integration

```
┌─────────────────┐     Bearer token      ┌──────────────────────────┐
│  Cosmo Rider    │ ────────────────────► │  /api/mobile/v1/*        │
│  (Expo app)     │                       │  lib/mobile/* (server)   │
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

Mobile uses bearer tokens (`RiderMobileSession`), separate from web Auth0 cookies. Login validates credentials via Auth0 Management API; the app stores the token in Expo SecureStore.

### Offline sync

Payment, complete, fail, and handover actions can be queued when offline. `SyncProvider` flushes the queue when connectivity returns.

## Conventions

- **Screens are thin** — extract reusable UI into `src/components/` as the app grows (Phase 3).
- **Types live in `src/types/`** — keep in sync with `lib/mobile/dto.ts` on the server.
- **Never trust the client** — all validation and authorization happen server-side in `lib/mobile/validation.ts`.
- **No secrets in the app** — only `EXPO_PUBLIC_*` env vars; backend holds Auth0 M2M credentials.

## Roadmap

| Phase | Status | Focus |
|-------|--------|-------|
| 1 — Cleanup | Done | Remove legacy code, docs, shared types, login fixes |
| 2 — Quality | Planned | Tests, CI, 401 handling, logout endpoint |
| 3 — Structure | Planned | Components, hooks, profile tab, theme provider |
| 4 — Release | Planned | EAS env profiles, Sentry, staging/production |

## Related backend paths

- API routes: `app/api/mobile/v1/`
- Business logic: `lib/mobile/`
- Admin rider ops: `app/(dashboard)/dashboard/riders/`
- Prisma models: `RiderMobileSession`, `RiderDeliveryTask`, `DeliveryPayment`, `RiderCashHandover`
