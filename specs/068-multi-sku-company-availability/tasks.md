---
description: "Task list for Multi-SKU Company Availability & Order Placement Suggestion"
---

# Tasks: Multi-SKU Company Availability & Order Placement Suggestion

**Input**: Design documents from `specs/068-multi-sku-company-availability/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/order-availability-api.md](contracts/order-availability-api.md), [quickstart.md](quickstart.md)

**Tests**: Included. The plan and quickstart require Vitest coverage of the pure logic in `lib/order-availability/rank.ts` (Constitution III).

**Organization**: Tasks are grouped by user story. The spec's User Story 4 was resolved as out of scope (no transfer creation), so there are three story phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 = basket availability, US2 = cap-aware Options A/B/C, US3 = missing-item sources
- Paths are relative to the repo root (single Next.js app: `app/`, `components/`, `lib/`)

## Reference: code to reuse (do not reimplement)

- `resolveTransferSlots(companyId)` → `{ erp1, erp2 }` instances: `lib/material-transfer/erp.ts`
- `listTransferWarehouses(cfg)` → `{ name, company }[]` (non-group, enabled): `lib/material-transfer/erp.ts`
- `isMainWarehouseName(name)`: `lib/material-transfer/warehouses.ts`
- `skuKey(value)` (trim + upper-case): `lib/vat-status/types.ts`
- `OsfErpError`, `OsfErpCredentials`, `stockForColumn` pattern, Bin batching of 80: `lib/osf/erp-stock.ts`
- Sales Invoice paging pattern (200 per page, max 50 pages, `docstatus = 1`, `net_total`): `listSubmittedSalesInvoicesForRange` in `lib/daily-sales-sms-erp.ts`
- Colombo dates: `formatAppIsoDate(now)` in `lib/format-datetime.ts`, `monthStartYmd(ymd)` in `lib/daily-sales-sms.ts`
- Route and auth pattern: `app/api/admin/products/vat-status/route.ts` (`requirePermission`, `auth.context.user?.companyId`)
- Validation helpers `LIMITS`, `trimmedString`: `lib/validation`, as used in `lib/validation/vat-status.ts`
- Panel UI conventions (Card, Button, Input, `notify`, Loader2): `components/organisms/vat-status-panel.tsx`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Register the permission and create the empty module skeleton.

- [X] T001 Add the permission `{ key: "products.order_availability.read", description: "Check live ERP2 main-warehouse availability for multiple SKUs and see suggested companies within the monthly cap" }` directly after the `products.vat_status.read` entry in `lib/rbac.ts`. This is runtime-upserted, so no migration is needed. Confirm admin/super_admin linking picks it up the same way as the other `products.*` keys.
- [X] T002 [P] Create `lib/order-availability/types.ts` with:
  - `ORDER_AVAILABILITY_PERMISSION = "products.order_availability.read"`
  - `MAX_DISTINCT_SKUS = 50`, `MAX_RAW_LINES = 200`, `MAX_LINE_QTY = 100000`
  - `DEFAULT_CAP_LKR = 5_000_000`, `DEFAULT_OPTION_COUNT = 3`, `NEAR_CAP_RATIO = 0.1`
  - the DTO types from [data-model.md](data-model.md) and the contract: `RequestLine`, `SkuLine`, `WarehouseStock`, `LineStatus = "covered" | "short" | "missing"`, `CompanyLine`, `CapStatus = "ok" | "near" | "would_exceed" | "reached" | "unknown"`, `CompanyCap`, `CompanyResult`, `OptionLabel = "A" | "B" | "C" | …` (string), `NoOptionReason`, `OrderAvailabilityResponse`

  No `server-only` import.
- [X] T003 [P] Create `lib/order-availability/config.ts` exporting `readOrderAvailabilityConfig(env = process.env)`. It returns `{ capLkr, optionCount }`, parsed from `ORDER_AVAILABILITY_CAP_LKR` (finite number > 0) and `ORDER_AVAILABILITY_OPTION_COUNT` (integer 1..5). Invalid or missing values fall back to `DEFAULT_CAP_LKR` and `DEFAULT_OPTION_COUNT` from `lib/order-availability/types.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Request validation and the tab/page wiring every story renders into.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Create `lib/validation/order-availability.ts` with `orderAvailabilityRequestSchema = z.object({ lines: z.array(z.object({ sku: trimmedString(1, LIMITS.sku.max), qty: z.number().int().min(1).max(MAX_LINE_QTY).optional() })).min(1).max(MAX_RAW_LINES) })`, mirroring `lib/validation/vat-status.ts`.
- [X] T005 Update `app/(dashboard)/dashboard/products/vat-status/page.tsx`:
  - Compute `canViewOrderAvailability = hasPermission(context, ORDER_AVAILABILITY_PERMISSION)`.
  - Include it in the "no access" gate, and extend the PermissionDeniedCard message to name `products.order_availability.read`.
  - Add `<TabsTrigger value="order-availability">Order Availability</TabsTrigger>` after Gift Vouchers.
  - Add a matching `<TabsContent>` rendering `<OrderAvailabilityPanel />`.
  - Rework `defaultTab` so that `?tab=order-availability` selects it when permitted, and so it falls back to the first permitted tab (vat-status → gift-vouchers → order-availability).

  Depends on T002 and on T006 existing as a stub.
- [X] T006 [P] Create the stub `components/organisms/order-availability-panel.tsx` (`"use client"`, exports `OrderAvailabilityPanel`) with the header "Order availability" and the description "Live stock in ERP2 main warehouses for multiple SKUs. Suggests which company to place the order under, within the monthly cap.", in the same heading style as `components/organisms/vat-status-panel.tsx`.
- [X] T007 [P] Add `hasSidebarPermission("products.order_availability.read")` to the `canViewVatStatus` OR-chain in `components/organisms/app-sidebar.tsx`, so users with only this permission still see the page link.

**Checkpoint**: The tab is visible for permitted users and shows an empty panel.

---

## Phase 3: User Story 1 - Check availability of a basket of SKUs across companies (Priority: P1) 🎯 MVP

**Goal**: The merchant pastes several SKUs and quantities and sees every ERP2 company's covered, short and missing SKUs, ranked by coverage.

**Independent Test**: Paste 5 SKUs held in different companies and click Check. Each company row shows the correct "x of 5" and names the covered, short and missing SKUs. Rows are ordered by coverage, then by quantity. Unknown SKUs are listed as not found (quickstart manual rows 1, 5, 6, 7, 9).

### Tests for User Story 1

- [X] T008 [P] [US1] Write the US1 tests in `lib/order-availability/rank.test.ts`:
  - `normalizeRequestLines`:
    - merges duplicates case-insensitively and adds their quantities
    - keeps the first-seen spelling
    - drops blanks
    - defaults qty to 1
    - returns an error when there are more than 50 distinct SKUs
  - `parseSkuPaste`:
    - one SKU per line
    - `SKU, 3` / `SKU\t3` / `SKU 3`
    - comma- or space-separated SKUs with no quantity
  - `classifyLine` boundaries: available = qty → covered, qty−1 → short, 0 → missing, negative → missing
  - `rankCompanies`:
    - coveredCount desc
    - then totalAvailable desc (each SKU's contribution capped at the requested qty)
    - then shortCount desc
    - then company name asc

  The tests should fail first.

### Implementation for User Story 1

- [X] T009 [US1] Create `lib/order-availability/rank.ts` (pure, no `server-only`) with:
  - `parseSkuPaste(text)` → `RequestLine[]`
  - `normalizeRequestLines(lines)` → `{ ok: true, lines } | { ok: false, error }`, using `skuKey` from `lib/vat-status/types.ts`
  - `classifyLine(available, qty)` → `LineStatus`
  - `buildCompanyResults({ skuLines, warehousesByCompany, binAvailable })` → `CompanyResult[]` without cap/option. It fills `lines[key].byWarehouse` sorted by available desc, plus the counts, `totalAvailable` and `fullCoverage`, for found SKUs only.
  - `rankCompanies(results)`

  This makes T008 pass.
- [X] T010 [US1] Create `lib/order-availability/lookup.ts` (`import "server-only"`) with `checkOrderAvailability(companyId, lines)`:
  1. Normalise the lines (T009). On failure, throw a validation error.
  2. `resolveTransferSlots(companyId).erp2`. If it is missing, throw `OsfErpError("ERP2 is not configured")`.
  3. `listTransferWarehouses(cfg)` filtered by `isMainWarehouseName`, grouped by `company` into `Map<company, warehouse[]>`.
  4. Resolve item codes: match typed SKUs to local `prisma.productItem` (`companyId`, `sku` equals insensitive; select `sku`, `price`), then a batched ERP2 `Item` list `[["item_code","in",batch]]` with fields `item_code, item_name` (batch 80, auth header `token key:secret`, `cache: "no-store"`). Match with `skuKey`. Unmatched SKUs go to `notFound`.
  5. A local `fetchBinAvailable(cfg, warehouses, itemCodes)` makes a batched `Bin` read with fields `item_code, warehouse, actual_qty, reserved_qty` and returns a `Map<"wh::item", max(0, actual − reserved)>` (research R2). Do not modify `lib/osf/erp-stock.ts`.
  6. `buildCompanyResults` + `rankCompanies`.

  Return `{ checkedAt, lines, notFound, companies }`. Cap and options are added in US2, so for now use `cap: null`, `option: null`, `options: []`.
- [X] T011 [US1] Create `app/api/admin/products/order-availability/route.ts`: `export const dynamic = "force-dynamic"`, and `POST`:
  1. `requirePermission(ORDER_AVAILABILITY_PERMISSION)`, then the companyId check, giving 400 "Company not found".
  2. `orderAvailabilityRequestSchema.safeParse(await request.json())`, giving 400 with `details`.
  3. Call `checkOrderAvailability`.
  4. Map the normalisation error (>50 SKUs) to 400, and map `OsfErpError` or other ERP failures to 502 with `"Could not read ERP2 stock: " + message.slice(0, 300)`, per [contracts/order-availability-api.md](contracts/order-availability-api.md).
- [X] T012 [US1] Replace the stub in `components/organisms/order-availability-panel.tsx` with:
  - A `Textarea` paste box. "Add" parses it with `parseSkuPaste` into an editable table of SKU + qty `Input` rows, with remove buttons and a "Clear all" button.
  - A client-side `normalizeRequestLines` that shows the >50 error inline before any request.
  - A "Check" `Button` with Loader2 that POSTs `{ lines }`; errors go through `notify`.
  - Results: "Checked at" uses `formatAppTime(checkedAt)`. A not-found notice lists `notFound`. Then one Card per company in response order, showing the company name, a "x of N" badge, its main warehouse names, and three labelled SKU lists: Covered; Short with "y of z available"; Missing.

  The layout must work at phone width with no horizontal scroll.

**Checkpoint**: US1 works end to end on dev. `npm test -- lib/order-availability` passes.

---

## Phase 4: User Story 2 - Suggest ranked company options that respect the 5 million cap (Priority: P1)

**Goal**: Each company shows month-to-date cap usage, this order's value and headroom. Up to three companies within the cap are labelled Option A/B/C. The merchant selects one.

**Independent Test**: Set `ORDER_AVAILABILITY_CAP_LKR` low on dev so the best-coverage company would exceed it. That company moves to "Other companies" marked "Would exceed cap", and Option A goes to the next company. With every company over the cap, there are no options and a warning shows (quickstart manual rows 2, 3, 4).

### Tests for User Story 2

- [X] T013 [P] [US2] Add the US2 tests to `lib/order-availability/rank.test.ts`:
  - `computeOrderValue`: unpriced SKUs set `isLowerBound`, and not-found SKUs are excluded
  - `capStatus` (rules in order):
    - usedMtd null → unknown
    - usedMtd ≥ limit → reached
    - used + order > limit → would_exceed
    - used + order === limit → near
    - headroomAfter < 10% of limit → near
    - otherwise → ok
  - `pickOptions`:
    - labels the first N eligible (ok or near, coveredCount > 0) A, B, C in ranked order
    - skips reached, would_exceed and unknown companies
    - fewer than N eligible → only those
    - `noOptionReason` covers all_over_cap, cap_unavailable, no_coverage and no_found_skus
  - `readOrderAvailabilityConfig` defaults and invalid fallbacks

### Implementation for User Story 2

- [X] T014 [US2] Add the pure functions to `lib/order-availability/rank.ts`:
  - `computeOrderValue(skuLines)` → `{ value, isLowerBound, unpricedSkus }`
  - `capStatus({ limit, usedMtd, orderValue })` → `CompanyCap`, including `headroomAfter`
  - `pickOptions(rankedResults, optionCount, { foundCount, capError })` → `{ companies (with option labels), options: string[], noOptionReason }`

  Labels are `String.fromCharCode(65 + i)`. This makes T013 pass.
- [X] T015 [US2] In `lib/order-availability/lookup.ts`, add a local `fetchMtdSalesByCompany(cfg, companies, fromYmd, toYmd)`. It pages the ERP2 `Sales Invoice` list with filters `[["company","in",companies],["posting_date",">=",from],["posting_date","<=",to],["docstatus","=",1]]` and fields `company, net_total`, 200 per page, max 50 pages, `cache: "no-store"`. It sums `net_total` per company (returns are negative, so the sum is net) and rounds to 2 decimals.
- [X] T016 [US2] Extend `checkOrderAvailability` in `lib/order-availability/lookup.ts`:
  - Compute `toYmd = formatAppIsoDate(new Date())` and `fromYmd = monthStartYmd(toYmd)`, and set `capMonth = toYmd.slice(0, 7)`.
  - Run the Item/Bin reads and the MTD sales read in parallel with `Promise.allSettled`. A rejected stock read rethrows (502). A rejected sales read sets `cap.error`, and every company's cap status becomes `unknown`.
  - Read `readOrderAvailabilityConfig()`.
  - Compute `orderValue` with `computeOrderValue`, the per-company `capStatus`, then `pickOptions`.
  - Return the full contract shape: `capMonth`, `orderValue`, `orderValueIsLowerBound`, `unpricedSkus`, `cap: { limit, nearThreshold, error }`, `companies[].cap`, `companies[].option`, `options`, `noOptionReason`.
- [X] T017 [US2] Update `components/organisms/order-availability-panel.tsx`:
  1. A summary line: order value (LKR, with a "≥" prefix and a note listing unpriced SKUs when `orderValueIsLowerBound`) and the cap month.
  2. An **Options** section with one Card per `options` entry. Each has an "Option A/B/C" badge, the company name, coverage "x of N" (a "Full coverage" badge when `fullCoverage`), MTD used / cap, order value, headroom after, a simple progress bar of (used + order) / limit, and a warning badge "Near cap" when status is `near`.
  3. A `noOptionReason` alert with plain-language copy for each reason (e.g. all_over_cap: "Every company would go over its LKR 5,000,000 monthly cap with this order.").
  4. An **Other companies** section listing the remaining companies with a status badge: "Cap reached", "Would exceed cap", "Cap unknown", or none.
  5. A `selectedCompany` state. Clicking an option card or an other-company row selects it with a visible ring and a "Selected" badge, and clicking another switches the selection.

  Selection is not persisted.

**Checkpoint**: US1 + US2 work together. The cap boundaries are covered by tests.

---

## Phase 5: User Story 3 - See where the missing items are so they can be moved (Priority: P2)

**Goal**: Selecting a company shows its covered SKUs with its own warehouse stock. For each short or missing SKU, it lists every other company/warehouse holding it, largest first, or "Not available anywhere".

**Independent Test**: Select a company missing 2 SKUs. Each missing SKU lists every other main warehouse holding it with the correct quantities, sorted descending. A SKU held nowhere shows "Not available anywhere" (quickstart manual row 4).

### Tests for User Story 3

- [X] T018 [P] [US3] Add the `buildDetail` tests to `lib/order-availability/rank.test.ts`:
  - covered SKUs return the selected company's own `byWarehouse`
  - short/missing SKUs return `{ company, warehouse, available }` from other companies only, available > 0, sorted desc
  - a SKU with no source anywhere → `sources: []` and `availableAnywhere: false`
  - not-found SKUs are excluded

### Implementation for User Story 3

- [X] T019 [US3] Add `buildDetail(response, selectedCompany)` to `lib/order-availability/rank.ts`. It returns `{ company, covered: Array<{ sku, qty, byWarehouse }>, toMove: Array<{ sku, qty, status, ownAvailable, sources, availableAnywhere }> }` and makes T018 pass. It stays pure so the client panel can import it.
- [X] T020 [US3] In `components/organisms/order-availability-panel.tsx`, render a detail Card below the results when `selectedCompany` is set (use `useMemo(() => buildDetail(result, selectedCompany))`):
  - Section "Already in {company}": each SKU with qty and its own warehouse quantities.
  - Section "Move to {company}": each short/missing SKU with requested qty, the company's own available quantity, and a list of source rows "{company} · {warehouse} · {available}" (largest first), or a destructive "Not available anywhere" badge.
  - A footer note: "Raise transfers through Material Transfer. This tab does not move stock." (spec: transfer creation is out of scope).
  - On mobile, scroll to the detail Card when the selection changes.

**Checkpoint**: All three stories work independently and together.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Confirm the read-only guarantee (FR-020). `lib/order-availability/lookup.ts` must only issue GET requests to ERP2 and must not import any submit/save helpers from `lib/material-transfer/erp.ts` beyond `resolveTransferSlots` and `listTransferWarehouses`.
- [ ] T022 [P] Measure the check time on dev with 20 SKUs (SC-002 ≤ 5 s). If the MTD Sales Invoice paging alone exceeds about 2 s, replace `fetchMtdSalesByCompany` in `lib/order-availability/lookup.ts` with a single `frappe.client.get_list` call using `group_by: "company"` and the field `sum(net_total) as total`, keeping the same return type (research R4).
- [X] T023 Run `npm test -- lib/order-availability`, `npx tsc --noEmit` and `npm run lint` on the changed files (`lib/order-availability/*`, `lib/validation/order-availability.ts`, `app/api/admin/products/order-availability/route.ts`, `components/organisms/order-availability-panel.tsx`, `app/(dashboard)/dashboard/products/vat-status/page.tsx`, `lib/rbac.ts`, `components/organisms/app-sidebar.tsx`), and fix any issues.
- [ ] T024 Walk through all 10 manual rows in `specs/068-multi-sku-company-availability/quickstart.md` on `cosmo-dev`, and record any deviations in that file's table.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none. T002 and T003 run in parallel; T001 is independent.
- **Foundational (Phase 2)**: depends on T002 (types/permission constant). T004, T006 and T007 run in parallel, and T005 follows T006.
- **US1 (Phase 3)**: depends on Phase 2. This is the MVP.
- **US2 (Phase 4)**: depends on US1. It extends `rank.ts`, `lookup.ts` and the panel built there.
- **US3 (Phase 5)**: depends on US1 for the response matrix, and can start alongside US2. It only touches the `buildDetail` part of `rank.ts` and a new section of the panel. If US2 isn't done, selection must be added here (move the `selectedCompany` state from T017 into T020).
- **Polish (Phase 6)**: after the desired stories are done.

### Within Each Story

Tests (T008/T013/T018) come first and fail first. Then the pure `rank.ts` functions, then the server `lookup.ts`, then the route, then the panel.

### Parallel Opportunities

- Phase 1: T002 ∥ T003
- Phase 2: T004 ∥ T006 ∥ T007
- Each story's test task [P] can be written while the previous story's UI task is in progress (different file).
- US3 (T018–T020) can run in parallel with US2's server tasks (T015–T016), since they touch different functions and files until the panel.
- Phase 6: T021 ∥ T022

## Parallel Example: User Story 1

```text
# After Phase 2:
Task: "T008 [US1] Write US1 tests in lib/order-availability/rank.test.ts"
# then sequential (same files / dependent):
Task: "T009 rank.ts" → "T010 lookup.ts" → "T011 route.ts" → "T012 panel"
```

## Parallel Example: User Story 2 + 3

```text
Task: "T013 [US2] cap/option tests in rank.test.ts"
Task: "T015 [US2] fetchMtdSalesByCompany in lookup.ts"
Task: "T018 [US3] buildDetail tests in rank.test.ts"   # coordinate edits to the same test file
```

## Implementation Strategy

### MVP first (US1 only)

1. Phases 1–2 (T001–T007)
2. Phase 3 (T008–T012)
3. **Stop and validate**: quickstart rows 1, 5, 6, 7, 9. Merchants can already see which company holds most of a basket.

### Incremental delivery

1. Add US2 (T013–T017), which makes the suggestions safe against the cap. **Ship US1 and US2 together** if the merchants would otherwise use coverage alone to pick a company, because the cap is a hard business rule (SC-003).
2. Add US3 (T019–T020), which completes the "move the missing items, place everything in one company" workflow.
3. Polish (T021–T024).

## Notes

- No Prisma schema change and no migration (Constitution I). Do not run `db:push`.
- Never invent stock. An ERP stock read failure is a 502, not zeros.
- Commit after each phase. Do not push to `main` without explicit confirmation (Constitution IV).
