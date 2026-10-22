# Data Model: Multi-SKU Company Availability

No database tables or migrations. All entities are computed per request from live ERP2 data plus `ProductItem.price`. They are TypeScript types in `lib/order-availability/types.ts`.

## RequestLine (input)

| Field | Type | Rules |
|-------|------|-------|
| sku | string | trimmed, 1..`LIMITS.sku.max` chars |
| qty | integer | ≥ 1, default 1, ≤ 100000 |

Normalisation (pure `normalizeRequestLines`):
- Blank SKUs are dropped.
- SKUs are de-duplicated by `skuKey()` (trim + upper-case), and their quantities are added together. The first-seen spelling is kept for display.
- More than **50** distinct SKUs after de-duplication returns a validation error.

## SkuLine (resolved)

| Field | Type | Notes |
|-------|------|-------|
| sku | string | display spelling |
| itemCode | string \| null | ERP2 item_code. null when not found |
| itemName | string \| null | |
| qty | number | requested |
| unitPrice | number \| null | `ProductItem.price`. null = unpriced |
| found | boolean | |

## WarehouseStock

| Field | Type | Notes |
|-------|------|-------|
| warehouse | string | ERP2 warehouse name |
| available | number | `max(0, actual_qty − reserved_qty)` |

## CompanyResult

| Field | Type | Notes |
|-------|------|-------|
| company | string | ERP2 company name |
| warehouses | string[] | its main warehouses |
| lines | `Record<skuKey, { status: "covered" \| "short" \| "missing"; available: number; byWarehouse: WarehouseStock[] }>` | for found SKUs only |
| coveredCount | number | |
| shortCount | number | |
| missingCount | number | |
| totalAvailable | number | Σ available, capped at requested qty per SKU (so one huge SKU can't dominate the tie-break) |
| fullCoverage | boolean | coveredCount === found SKU count |
| cap | CapPosition | |
| option | `"A" \| "B" \| "C" \| null` | label when it is a suggested option |

Classification (per company, per found SKU):
- `available ≥ qty` → **covered**
- `0 < available < qty` → **short**
- `available ≤ 0` → **missing**

## CapPosition

| Field | Type | Notes |
|-------|------|-------|
| limit | number | `ORDER_AVAILABILITY_CAP_LKR`, default 5,000,000 |
| usedMtd | number \| null | Σ net_total of submitted ERP2 SIs this month. null if the cap read failed |
| orderValue | number | Σ qty × unitPrice over priced, found SKUs |
| orderValueIsLowerBound | boolean | some found SKU is unpriced |
| headroomAfter | number \| null | limit − usedMtd − orderValue |
| status | `"ok" \| "near" \| "would_exceed" \| "reached" \| "unknown"` | see below |

Status rules (evaluated in order):
1. `usedMtd == null` → **unknown**
2. `usedMtd ≥ limit` → **reached**
3. `usedMtd + orderValue > limit` → **would_exceed**
4. `headroomAfter < limit × 0.10` → **near** (eligible, with a warning)
5. otherwise → **ok**

## Ranking and options (pure `rankCompanies` / `pickOptions`)

Sort order: `coveredCount` desc → `totalAvailable` desc → `shortCount` desc → `company` asc (a stable, deterministic last resort).

Options: walk the sorted list and label the first N companies (N = `ORDER_AVAILABILITY_OPTION_COUNT`, default 3) with status `ok` or `near` as A, B, C in order. Companies that are `reached`, `would_exceed` or `unknown` are never labelled. A company with `coveredCount === 0` is never labelled either, because it could not supply anything.

## Selection (client state only)

`selectedCompany: string | null`. It is set by clicking an option or any company row and drives the detail view. It is not persisted.

## Detail view (derived client-side)

For the selected company C, for each found SKU:
- covered → show C's own `byWarehouse`
- short/missing → list `{ company, warehouse, available }` from **all other companies** where available > 0, sorted by available desc. If there are none, show "not available anywhere".
