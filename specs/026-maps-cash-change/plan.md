# Implementation Plan: Rider Maps Fallback & Cash Change Display

**Branch**: `026-maps-cash-change` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-maps-cash-change/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Fix Cosmo Rider **Open map** so riders are never stuck on a dead-end “Maps unavailable” alert—try workable map URLs and offer **copy address** (and clear messaging) when maps cannot open. On the payment screen, place a prominent **customer gave** input under/near the order total and show live **change/balance** (e.g. due 2,500 / gave 5,000 → balance 2,500), persisting via existing or restored `DeliveryPayment` tender fields and Cosmo OS order visibility.

## Technical Context

**Language/Version**: TypeScript 5, Expo SDK 54 / React Native 0.81, Next.js 16 (admin display only)

**Primary Dependencies**: Expo Router rider app (`Linking`, `Clipboard`/`expo-clipboard` as available), shared mobile payment API + Zod validation, Prisma `DeliveryPayment`

**Storage**: Neon PostgreSQL — tender columns `customerGaveAmount` / `changeAmount` already designed in 025 and present on `origin/main`; current local branch may lack them until synced from `main`

**Testing**: Vitest for maps URL/fallback helpers + tender/change math; `npm run mobile:typecheck`; manual device smoke for Open map + payment

**Target Platform**: Cosmo Rider Android (EAS APK / OTA); Cosmo OS web order detail for tender display

**Project Type**: Mobile client + shared backend (minimal web display)

**Performance Goals**: Open map feedback &lt; 1s; change display updates immediately on input (&lt; 100ms perceived)

**Constraints**: Prefer JS-only maps/payment UX (OTA-friendly); no new native modules unless clipboard/linking requires them; do not overload `collectedAmount`; change vs **cash due** (COD line sum / COD total); constitution: migrate+deploy all DBs if schema still missing on a target

**Scale/Scope**: One maps utility path (`openDirections`); payment form + payment submit hooks; confirm admin order detail already shows tender when fields exist

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Multi-Database Migration Discipline — PASS**: No new schema for this feature if 025 tender migration already deployed. If implementing from a branch without tender columns, reuse 025 migration (or create only if absent)—never `db push` on shared DBs; `db:deploy:all` when applying.
- **II. Environment & Credential Isolation — PASS**: No new secrets.
- **III. Test & Typecheck Gates — PASS**: Unit tests for maps fallback + change math; `npm test` + `npm run mobile:typecheck` before merge.
- **IV. Production Deployment Safety — PASS**: Plan does not push `main` or run prod migrate without explicit user request.
- **V. Simplicity & Scope Discipline — PASS**: Extend `openDirections` + payment form UX; reuse 025 tender API/fields; no new maps SDK or payment subsystem.

**Post-design re-check**: Still PASS — maps = URL attempts + clipboard fallback; tender = existing fields + UI placement.

## Project Structure

### Documentation (this feature)

```text
specs/026-maps-cash-change/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
└── tasks.md             # /speckit-tasks (not this command)
```

### Source Code (repository root)

```text
mobile/rider-app/
├── src/utils/contact.ts                 # openDirections + fallbacks
├── src/components/delivery-contact-section.tsx
├── src/components/payment-form.tsx      # customer gave + change UI
├── src/hooks/…                          # payment submit payload
└── src/types/delivery.ts                # tender on payment DTO if needed

lib/mobile/
├── payment-tender.ts                    # ensure exists (from 025) or add
├── validation.ts                        # tender Zod rules
└── dto.ts                               # expose tender on payment

app/api/mobile/v1/deliveries/[id]/payment/route.ts

components/organisms/
└── order-fulfillment-detail.tsx         # show tender if not already

prisma/schema.prisma                     # only if tender fields missing on branch
```

**Structure Decision**: Stay inside existing rider-app utilities/components and mobile payment API. No new packages. Base implementation branch should include `main` (025 tender) or restore those fields before UI work.

## Complexity Tracking

> No constitution violations requiring justification.
