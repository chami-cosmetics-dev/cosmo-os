# Implementation Plan: Shop Item Requests

**Branch**: `feature/066-shop-item-requests` | **Date**: 2026-10-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/066-shop-item-requests/spec.md`

**Note**: Spec directory stays `specs/066-shop-item-requests`. Git branch is `feature/066-shop-item-requests`.

## Summary

Shop users with an outlet request any item from stores. They add by barcode or by SKU suggestion, set a needed quantity, and can remove a line before submit. OSF Shop Availability **Not Allowed** plays the existing error sound and still stays on the form. Each line shows live stock at six company main warehouses. A warehouse under 4 units is marked cannot-transfer. That mark does not block the request. Stores see who asked and which outlet, the same stocks, and mark the whole request done. Done does not move stock and does not create a material transfer. Pending is the default list. Done requests stay in history.

**Technical approach**: New `ShopItemRequest` and `ShopItemRequestLine` tables. Do not extend `MaterialTransfer` — that row always becomes a stock entry. Reuse ERP item lookup, `fetchBinActualQty`, `ProductOsfProfile.shopAvailability`, `playScanErrorSound`, and the outlet gate on the receive page. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router)

**Primary Dependencies**: Next.js, React, Prisma, Zod, Auth0 via `requireMaterialTransferView` / `store.material_transfer.write`, `lib/material-transfer/erp.ts` (item code and `scan_barcode`, warehouse list), `fetchBinActualQty` in `lib/osf/erp-stock.ts`, `ProductOsfProfile.shopAvailability`, `playScanErrorSound`

**Storage**: New `ShopItemRequest` and `ShopItemRequestLine`. Migration via `npm run db:migrate:create`. Deploy with `npm run db:deploy:all` only when the user asks. No stock columns. Shop availability is stored on the line at submit. Main-warehouse quantities are read live on each view.

**Testing**: Vitest for warehouse matching, cannot-transfer (`qty < 4`), SKU form match for Shop Availability, ambiguous item rejection, and the pending → done claim. `npm test` and lint on touched files. Manual UAT in [quickstart.md](./quickstart.md). No rider-app change, so no mobile typecheck unless a shared type is touched.

**Target Platform**: Cosmo OS web store screens. Shop tab on `/dashboard/store/material-transfer/receive`. Stores queue on `/dashboard/store/material-transfer`. Vault OS out of scope.

**Project Type**: Single full-stack Next.js web app

**Performance Goals**: A shop user can add 10 lines and submit in under 3 minutes. SKU suggestions return within about a second of a pause in typing. Opening a request loads the six stocks in one Bin query per ERP, not one query per cell.

**Constraints**: Constitution I–V. No new permission. No Stock Entry and no write to `MaterialTransfer` from this feature. Outlet users see only their outlet. Stores with `store.material_transfer.write` see every outlet and are the only role that can mark done. A failed ERP stock read shows unknown, not zero. A successful read with no Bin row is 0.

**Scale/Scope**: One shop tab, one stores tab, list capped at 300 rows like transfer history. Six fixed main warehouses.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **PASS** — one migration created with `npm run db:migrate:create`. Deploy only when the user confirms. No `prisma db push` against vault, cosmo-dev, or cosmo-prod. |
| II. Environment & Credential Isolation | **PASS** — ERP reads use the existing erp1/erp2 instances already configured per company. No new secrets. |
| III. Test & Typecheck Gates | **PASS** — Vitest for the pure rules. Lint on touched files. No mobile change. |
| IV. Production Deployment Safety | **PASS** — planning only. No prod deploy, push, or database deploy in this command. |
| V. Simplicity & Scope Discipline | **PASS** — new tables because a request never becomes a transfer. Reuse lookup, Bin fetch, OSF profile, scan sound, and the outlet gate. No new permission. No stock movement. |

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](./data-model.md) — request header plus lines; stock stays live
- [contracts/shop-item-requests.md](./contracts/shop-item-requests.md) — suggest, lookup, create, list, get, mark done
- [quickstart.md](./quickstart.md) — unit checks plus a staff UAT path; no prod deploy step

## Project Structure

### Documentation (this feature)

```text
specs/066-shop-item-requests/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── shop-item-requests.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/<timestamp>_shop_item_requests/

lib/material-transfer/shop-item-request.ts          # six mains, cannot-transfer, sku forms, done claim
lib/material-transfer/shop-item-request.test.ts
lib/material-transfer/shop-item-request-lookup.ts   # ERP suggest + exact/barcode resolve, OSF, bins
lib/validation/material-transfer.ts                 # request body schemas

components/organisms/material-transfer-request-panel.tsx
components/organisms/material-transfer-request-queue.tsx
components/organisms/material-transfer-panel.tsx    # stores tab
components/organisms/material-transfer-receive-panel.tsx  # unchanged receive list

app/(dashboard)/dashboard/store/material-transfer/receive/page.tsx  # shop tabs
app/api/admin/store/material-transfer/shop-requests/route.ts
app/api/admin/store/material-transfer/shop-requests/lookup/route.ts
app/api/admin/store/material-transfer/shop-requests/suggest/route.ts
app/api/admin/store/material-transfer/shop-requests/[id]/route.ts
app/api/admin/store/material-transfer/shop-requests/[id]/done/route.ts
```

**Structure Decision**: Shop users already land on the receive page, which requires an outlet. Add a tab there: Request items, Receive, and Return to main when the user has shop-return permission. Stores already land on the material-transfer page. Add a tab there: Send, Shop requests. Draft lines stay in the browser until submit, same as a send list. Submitted requests are the new tables.

## Complexity Tracking

None. Constitution Check has no violations to justify.

## Agent context

No `.specify/scripts/**/update-agent-context*` script in this repo (same skip as `065-material-transfer-counts`). Context is this plan plus [research.md](./research.md), [data-model.md](./data-model.md), and [contracts/shop-item-requests.md](./contracts/shop-item-requests.md).
