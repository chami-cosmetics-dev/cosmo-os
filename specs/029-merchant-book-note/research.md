# Research: Merchant Daily Book Note

**Feature**: `029-merchant-book-note`  
**Date**: 2026-08-03

## R1 — “Outlet” scope: CompanyLocation vs Outlet model

**Decision**: Scope every Book Note Day to **`CompanyLocation`** (`companyLocationId`). UI label remains “Outlet”. Do **not** use the review `Outlet` / `OutletUser` models for v1.

**Rationale**: Orders (and POS SI ingest) hang off `Order.companyLocationId`. Intern prototype “company” aligns with `CompanyLocation.erpnextCompany` / location name. Prisma `Outlet` has no FK to locations or orders — using it would invent a mapping layer with no reliable link.

**Alternatives considered**:
- Key by `Outlet` + name-match to `CompanyLocation` — rejected (fragile, no schema link).
- Add `Outlet.companyLocationId` — deferred (extra migration not required for v1; can revisit if product wants one Outlet entity for reviews + book notes).

**Allowed locations for merchants (`book_notes.manage`)**: all `CompanyLocation` rows for the user’s `companyId`. Permission assignment is the access gate; do not invent a second location ACL in v1. Finance (`book_notes.read`) may query any location in the company.

## R2 — Permissions

**Decision**: Add two permissions:
- `book_notes.manage` — enter/save/load own-company locations (merchant write path)
- `book_notes.read` — retrieve any location’s book notes (finance/admin/intern)

Default role wiring (via `DEFAULT_PERMISSIONS` / `DEFAULT_ROLES` in `lib/rbac.ts`):
- `book_notes.manage` → roles that already get merchant-facing tools (e.g. manager + any role used for shop staff; ops can assign to shop users)
- `book_notes.read` → `admin`, `super_admin`, `finance`, `manager`

Finance with only `book_notes.read` cannot PUT/save. Users with only `book_notes.manage` cannot call company-wide retrieve (only load the day for a location they are saving against via the merchant page GET).

**Rationale**: Matches clarification (merchants write; finance retrieve-all; finance does not edit). Mirrors `merchant_reviews.*` / `outlets.read.*` style.

**Alternatives considered**:
- Reuse `orders.read` / `finance.approvals.read` — rejected (too broad / wrong semantics).
- Anonymous API token for intern — rejected by clarification (Cosmo sign-in + finance/admin access).

## R3 — Invoice identity for typeahead + stored value

**Decision**: Suggestion **display** shows the best human label; on select, store **`salesInvoice`** as:
1. `erpnextInvoiceId` when present and not a pending placeholder (`pending`, `pending_approval`)
2. else `name` (POS often stores SI name here)
3. else `orderNumber`
4. else `shopifyOrderId`

Search matches (case-insensitive contains / suffix) against `erpnextInvoiceId`, `name`, `orderNumber`, `shopifyOrderId`, filtered by `companyLocationId` and optionally Colombo calendar day of `createdAt` / order date window for the selected posting date.

Prefer POS-ish sources when ranking: `sourceName` in `erpnext-pos`, `pos`, `erpnext` boosted, but do not exclude Shopify if it matches.

**Rationale**: Spec wants “full invoice number” for intern ERP verify (`frappe.db.exists("Sales Invoice", …)`). `erpnextInvoiceId` / POS `name` are the SI names. Manual typed values remain allowed (FR-020).

**Alternatives considered**:
- Only search `orderNumber` via existing quick-search — rejected (misses SI ids; quick-search does not query `erpnextInvoiceId`).
- Require exact SI regex — rejected by FR-013.

## R4 — Autofill Cash / Card / KOKO / Bank amounts

**Decision**: Build a small mapper `mapOrderPaymentsToBookNoteColumns(order)`:

1. If `Order.rawPayload` has ERP POS `payments[]` with `{ mode_of_payment, amount }`, sum amounts into columns by mop string:
   - **Cash**: cash, manual, COD / cash on delivery
   - **Card**: card, credit card, card on delivery, cc / cc checkout, webxpay, shopify payments, visa/mc/amex
   - **KOKO**: contains `koko`
   - **Bank**: bank, wire, bank transfer, bank draft
2. Else if only gateway **names** exist (`paymentGatewayNames` / primary): put full `totalPrice` into the single column matching primary (FR-022); leave others 0.
3. Else: put `totalPrice` into **Cash** as editable starting point.

Merchant may edit all four fields after fill (FR-021). Unmapped mop amounts: add to Cash (visible starting point) rather than drop.

**Rationale**: OS does not persist split amount columns; POS splits live in webhook `rawPayload` (`lib/validation/erpnext-sales-invoice.ts`). Gateway name → bucket aligns with `lib/payment-method-label.ts` / `lib/erpnext-sync.ts` mop resolution (including KOKO).

**Alternatives considered**:
- Use `DeliveryPayment` / rider lines — rejected (door collection, not shop POS book).
- Always put total in Cash only — weaker when multi-mop payload exists.

## R5 — Persistence model

**Decision**: Two Prisma models:
- `BookNoteDay` — unique `(companyId, companyLocationId, postingDate)` where `postingDate` is a calendar `Date` (date-only, Colombo day)
- `BookNoteRow` — child rows; on save, **delete-all + recreate** rows for that day inside a transaction (full replace)

Optional `orderId` on row when suggestion was picked (nullable); not required for retrieve contract.

**Rationale**: Spec FR-007–009 full replace; simple last-write-wins. Matches intern payload shape (day header + rows).

**Alternatives considered**:
- JSON blob column for all rows — rejected (harder to query/index invoice later).
- Version history — rejected (clarification chose same-day overwrite, not versions).

## R6 — Same-day lock (Asia/Colombo)

**Decision**: On merchant create/update, reject if `postingDate < formatAppIsoDate(now)` using `APP_TIME_ZONE` / `formatAppIsoDate` from `lib/format-datetime.ts`. Allow `postingDate === today`. Disallow future dates in v1 (only today) to keep the habit “enter today’s book”. GET may load past days read-only for merchants; PUT rejected with `DAY_LOCKED`.

**Rationale**: Clarification B + existing Cosmo daily-sales timezone convention.

**Alternatives considered**:
- Allow creating forgotten yesterday — rejected by clarification.
- Soft lock after finance consume — rejected (no consume signal in Cosmo v1).

## R7 — API surface

**Decision**:
| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| GET | `/api/admin/book-notes/page-data` | `book_notes.manage` | locations + optional day load |
| GET | `/api/admin/book-notes/order-suggestions` | `book_notes.manage` | typeahead |
| PUT | `/api/admin/book-notes` | `book_notes.manage` | upsert day (full replace rows) |
| GET | `/api/admin/book-notes` | `book_notes.read` | finance retrieve by location + date or date range |

Retrieve response field names align with intern verify input: `company` (location display / `erpnextCompany`), `posting_date`, `rows[]` with `idx_no`, `sales_invoice`, `cash`, `card`, `koko`, `bank_transfer`.

Also return Cosmo ids (`companyLocationId`, `id`) for OS consumers without breaking intern shape.

**Rationale**: Aggregated page-data pattern (workspace performance rule); clear write vs read permissions; intern-compatible payload.

**Alternatives considered**:
- Merchant-only export JSON as sole path — rejected (FR-016).
- ERP webhook push from Cosmo — out of scope.

## R8 — UI placement

**Decision**: Page at `app/(dashboard)/dashboard/book-notes/page.tsx` (+ client panel). Nav item gated by `book_notes.manage` (merchants) and optionally show a read-only retrieve view later for `book_notes.read` — **v1**: merchant entry page only; finance uses GET API (intern scripts / HTTP). Optional client-side Export JSON button.

**Rationale**: Spec Story 4; finance edit UI out of scope (FR-017). Keep Principle V.

**Alternatives considered**:
- Full finance browser UI in v1 — deferred.
- Embed ERP verify badges — out of scope.
