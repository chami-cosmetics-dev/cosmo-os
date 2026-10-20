# Implementation Plan: Material Transfer Counts and Shop Returns

**Branch**: `065-material-transfer-counts` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/065-material-transfer-counts/spec.md`

**Note**: `setup-plan.ps1 -Json` returned `BRANCH` empty (no `SPECIFY_FEATURE`). Spec directory is `specs/065-material-transfer-counts` via `.specify/feature.json`. Checkout at plan time is `fix/mnk-cool-planet-material-transfer`. This command does not create or switch a git branch.

## Summary

Store-to-shop sending already posts an ERPNext Material Transfer. This feature tightens the count screen (error beep, available cap, scan-to-top, green border, editable quantity, low-count mark on submit from main), shows barcodes and who counted, and adds a mismatch filter. Shop users can also request a return from their outlet shop warehouse to main. That request does not post. Stores get a reminder, count what arrived, and confirmation posts one Material Transfer for the quantities stores entered.

**Technical approach**: Extend `MaterialTransfer` with direction and two statuses. Reuse `submitMaterialTransfer`, `playScanErrorSound`, `warehouseMatchesOutlet`, and `isMainWarehouseName`. Shop returns are a new create plus a confirm route. The reminder is gated on `store.material_transfer.write`, not a new reminder permission. Details in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20 (Next.js App Router)

**Primary Dependencies**: Next.js, React, Prisma, Zod, Auth0 via `requireMaterialTransferView` / `store.material_transfer.write`, existing `lib/material-transfer/*` (ERP Stock Entry create/submit, `scan_barcode`, VAT check on erp1), `playScanErrorSound`, `fetchTaskReminders`

**Storage**: Extend `MaterialTransfer` and `MaterialTransferLine`. Migration via `npm run db:migrate:create`. Deploy with `npm run db:deploy:all` only when the user asks. The earlier `20261008170000_material_transfer_receipt` migration must be applied on the same databases first; `db:deploy` applies both in order.

**Testing**: Vitest for quantity cap, scan promote, low-count mark, mismatch rule, shop-to-main warehouse pick, and confirm guards. `npm test` and lint on touched files. Manual UAT in [quickstart.md](./quickstart.md). No rider-app change, so no mobile typecheck unless a shared type is touched.

**Target Platform**: Cosmo OS web store screens (`/dashboard/store/material-transfer` and `/dashboard/store/material-transfer/receive`). Vault OS out of scope.

**Project Type**: Single full-stack Next.js web app

**Performance Goals**: A scan beep starts within a second of the rejected scan. History stays the current 300-row cap. The reminder query is one count of open shop-to-main requests for the company.

**Constraints**: Constitution I–V. Store-to-shop still posts on send. Shop-to-main posts only on stores confirm, once, for stores’ quantities. erp1 stays VAT-only. erp2 still needs a company and only main/shop warehouses. Outlet assignment stays the shop gate. No new role. Do not move live stock while writing tests.

**Scale/Scope**: Two directions on one transfer table. One reminder category. Send, receive, history, and shop-return screens already in the store nav.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-research gate

| Principle | Status |
|-----------|--------|
| I. Multi-Database Migration Discipline | **PASS** — one migration created with `npm run db:migrate:create`. Deploy only when the user confirms. No `prisma db push` against vault, cosmo-dev, or cosmo-prod. |
| II. Environment & Credential Isolation | **PASS** — ERP calls use the existing erp1/erp2 instances. The history link uses that instance’s base URL. No new secrets. |
| III. Test & Typecheck Gates | **PASS** — Vitest for the pure rules. Lint on touched files. No mobile change. |
| IV. Production Deployment Safety | **PASS** — planning only. No prod deploy, push, or database deploy in this command. |
| V. Simplicity & Scope Discipline | **PASS** — extend the current transfer table and routes. Reuse Stock Entry submit, scan sound, and outlet matching. No second permission. No reject action. |

### Post-design gate

All gates remain **PASS** after Phase 1:

- [data-model.md](./data-model.md) — direction, two statuses, nullable books name, last counter on the line
- [contracts/material-transfer-counts.md](./contracts/material-transfer-counts.md) — existing routes gain fields; shop-return and confirm are the only new writes
- [quickstart.md](./quickstart.md) — unit checks plus a staff UAT path; no prod deploy step

## Project Structure

### Documentation (this feature)

```text
specs/065-material-transfer-counts/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── material-transfer-counts.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
prisma/schema.prisma
prisma/migrations/<timestamp>_material_transfer_counts/

lib/material-transfer/lines.ts              # cap at available; promote to top
lib/material-transfer/lines.test.ts
lib/material-transfer/submit-review.ts      # lines below main available
lib/material-transfer/submit-review.test.ts
lib/material-transfer/mismatch.ts           # terminal status + qty differs
lib/material-transfer/mismatch.test.ts
lib/material-transfer/shop-return.ts        # outlet shop warehouse → main
lib/material-transfer/shop-return.test.ts
lib/material-transfer/types.ts
lib/material-transfer/receipts.ts           # direction, last counter, confirm claim
lib/material-transfer/erp.ts                # confirm posts stores qty; live bin check
lib/validation/material-transfer.ts

lib/task-reminders.ts                       # open shop-to-main count
lib/task-reminder-links.ts
components/molecules/task-reminder-bubbles.tsx
components/molecules/task-reminder-bubble-icon.tsx

components/organisms/material-transfer-panel.tsx
components/organisms/material-transfer-receive-panel.tsx
components/organisms/material-transfer-history.tsx
components/organisms/material-transfer-return-panel.tsx

app/api/admin/store/material-transfer/history/route.ts
app/api/admin/store/material-transfer/[id]/count/route.ts
app/api/admin/store/material-transfer/[id]/receive/route.ts
app/api/admin/store/material-transfer/shop-return/route.ts
app/api/admin/store/material-transfer/[id]/confirm/route.ts

app/(dashboard)/dashboard/store/material-transfer/page.tsx
app/(dashboard)/dashboard/store/material-transfer/receive/page.tsx
```

**Structure Decision**: Keep store-to-shop on the current material-transfer page and shop receipt on the receive page. Shop-to-main send is a panel on the receive page (outlet users already land there). Stores count and confirm shop returns on the material-transfer page. History stays one table for both directions.

## Complexity Tracking

None. Constitution Check has no violations to justify.

## Agent context

No `.specify/scripts/**/update-agent-context*` script in this repo (same skip as `064-rider-handover-invoice`). Context is this plan plus [research.md](./research.md), [data-model.md](./data-model.md), and [contracts/material-transfer-counts.md](./contracts/material-transfer-counts.md).
