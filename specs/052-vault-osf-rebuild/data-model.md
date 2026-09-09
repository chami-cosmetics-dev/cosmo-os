# Phase 1 Data Model: Supplement Vault OSF

Two persisted changes and a set of in-memory shapes. Everything else is read
live from the ERPs at generation time and never stored.

## Persisted changes

### 1. `OsfColumnConfig.erpCompany` (new nullable column)

```prisma
model OsfColumnConfig {
  // ...existing fields unchanged...

  /// ERP company name that scopes sales and purchase documents for this column
  /// (e.g. "SupplementVault.lk", "Origins (PVT) LTD", "AE (PVT) LTD").
  /// Stock is scoped by warehouse; sales/purchases are scoped by company.
  /// Null for Cosmo columns, which do not read per-company invoice data.
  erpCompany String?
}
```

**Why**: `directWarehouses` + `erpnextInstanceId` already scope stock, but ERP
sales and purchase documents are scoped by company, which the schema cannot
express today. See research R-009.

**Validation**

- Optional. Null means "this column does not participate in ERP invoice
  aggregation" — the Vault generator skips sales and purchase figures for it.
- When set, must exactly match an ERPNext `Company.name` in the instance named
  by `erpnextInstanceId`. Mismatches produce no rows rather than an error, so
  the seed script must verify the value against the live ERP.

**Migration safety**: Additive and nullable. Every existing Cosmo and Vault row
gets `NULL` and behaves exactly as before.

---

### 2. `OsfMonthlySalesHistory` (new model)

```prisma
model OsfMonthlySalesHistory {
  id        String   @id @default(cuid())
  companyId String
  sku       String
  /// Matches OsfColumnConfig.key — the business unit this figure belongs to.
  columnKey String
  /// Calendar month in Asia/Colombo, "YYYY-MM".
  month     String
  /// Units sold. May be 0, meaning a genuine zero-sale month.
  qty       Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@unique([companyId, sku, columnKey, month])
  @@index([companyId, month])
  @@index([companyId, sku])
}
```

**Why**: April and May predate every invoice in both ERPs, so those months have
no readable source and must be imported. See research R-010.

**Validation**

- `month` must match `^\d{4}-(0[1-9]|1[0-2])$`.
- `qty` must be a non-negative integer.
- `columnKey` must resolve to an existing `OsfColumnConfig` row for the same
  company; unknown keys are rejected at import rather than stored.
- Upsert on the unique tuple, so re-uploading a corrected file overwrites
  cleanly rather than duplicating.

**Absence is meaningful**: no row means "not loaded", which renders blank. A row
with `qty = 0` means "loaded, sold nothing", which renders `0`. The generator
must not conflate these.

---

## Reused without change

| Model | Role here |
|---|---|
| `ErpnextInstance` | ERP1/ERP2 credentials, resolved by `getAllOsfErpInstances(companyId)` |
| `ProductOsfRop` | Reorder point per `(sku, columnKey)`. Absence renders blank, never 0 |
| `Supplier` | Allowlist that excludes internal transfers from purchase figures |
| `ProductItem` | Priority Status only, joined on SKU |
| `OsfUserColumnAccess` | Per-user column visibility, applied as it is today |

`ProductOsfProfile` is **not** used — `ogfPrice`, `shopAvailability` and
`reorderThresholdPercent` are all Cosmo-only concepts dropped by FR-005.

---

## In-memory shapes

These are the contracts between the fetch layer and the workbook builder. None
are persisted.

### `VaultBusinessUnit`

Resolved once per generation from `OsfColumnConfig` rows.

| Field | Type | Notes |
|---|---|---|
| `key` | `string` | `sv`, `ori`, `ae` |
| `label` | `string` | `SV`, `ORI`, `AE` — the workbook header |
| `erpInstanceId` | `string` | Which ERP to query |
| `erpCompany` | `string` | Scopes sales and purchase documents |
| `warehouses` | `string[]` | Scopes the stock column |
| `sortOrder` | `number` | Left-to-right order in every column group |

### `VaultCatalogRow`

One per ERP1 stock item (research R-008).

| Field | Source |
|---|---|
| `sku` | ERP1 `Item.item_code` |
| `variantSku` | ERP1 `Item.name` |
| `barcode` | ERP1 `Item Barcode`, falling back to `ProductItem.barcode` |
| `itemName` | ERP1 `Item.item_name` |
| `brand` | ERP1 `Item.brand` |
| `category` | ERP1 `Item.item_group` |
| `country` | ERP1 `Item.country_of_origin` |
| `priorityStatus` | Vault OS `ProductItem.erp1ProductPriority`, blank if unmatched |

### `MonthKey` and the reporting window

`YYYY-MM` in Asia/Colombo. The window runs from `{reportingYear}-04` through the
month containing the as-of date, inclusive. The final month is truncated at the
as-of date rather than covering the full calendar month (FR-013).

Reporting year: the April that starts the window is the most recent 1 April that
is on or before the as-of date. An as-of date in January–March therefore covers
the previous calendar year's April through the current month.

### `SalesCell` and `PurchaseCell`

| Shape | Fields | Blank when |
|---|---|---|
| `SalesCell` | `qty: number \| null`, `source: "erp" \| "import"` | no ERP data and no imported row |
| `PurchaseCell` | `qty: number \| null`, `netValue: number \| null` | no allowlisted purchase line that month |

`null` is the blank marker throughout; `0` always means a real zero.

### `PriceInfo`

| Field | Notes |
|---|---|
| `mrp` | ERP1 `Standard Selling` rate, null if unpriced |
| `discountPercent` | From the winning item-code pricing rule, null if none applies |
| `discountedPrice` | `mrp × (1 − discountPercent/100)`, null when either input is null |

### `LatestPurchase`

| Field | Notes |
|---|---|
| `rate` | Unit rate on the newest allowlisted purchase invoice line, across both ERPs |
| `supplier` | `supplier_name`, falling back to `supplier` |
| `date` | Posting date used to pick the winner |

---

## Derived values

All pure functions in `lib/vault-osf/formulas.ts`, unit-tested against the
buyer's manual workbook.

| Value | Rule | Blank when |
|---|---|---|
| Total stock | Sum of the three business-unit stock figures | never (0 is valid) |
| Total ROP | Sum of set reorder points | all three unset |
| Month total | Sum of the three business-unit sale counts for that month | all three blank |
| Max sale | Largest month total across months that have data | no month has data |
| AVE (months of cover) | `totalStock / maxSale` | max sale is null or 0 |
| Reorder qty (per unit) | `rop − stock` for that unit | that unit's ROP is unset |
| Total reorder qty | Sum of the three reorder quantities | all three blank |

Verified against the manual sheet: `NW004-2` total stock 19, max sale 46 → AVE
`0.413`; `RE001-1` total stock 150, max sale 25 → AVE `6`; `NW004-2` SV ROP
`9.152` − SV stock `6` → SV reorder qty `3.152`.

Note that reorder quantity is deliberately **not** floored at zero — the manual
sheet carries negative values (`RE001-1` total `−50`) and the buyer reads them
as overstock signal. This differs from `TOTAL ORDER QTY` in the Cosmo workbook,
which floors at 0.

---

## Seeded Vault columns

`scripts/seed-vault-osf-columns.mjs` upserts three `OsfColumnConfig` rows for
the Vault company. Cosmo seed scripts are not touched.

| key | label | erpCompany | warehouse | ERP instance |
|---|---|---|---|---|
| `sv` | SV | `SupplementVault.lk` | `Main Warehouse - SV-1` | ERP1 |
| `ori` | ORI | `Origins (PVT) LTD` | `Main Warehouse - Origins` | ERP2 |
| `ae` | AE | `AE (PVT) LTD` | `Main Warehouse - AE` | ERP2 |

`includeInStock` and `includeInRop` are both true. Origins Online is never
seeded.

---

## State transitions

### Reorder point

```text
unset (no ProductOsfRop row)
  -- upload template / in-OS edit --> set (ropQty >= 0)
  -- blank cell on re-upload      --> unchanged (blank = no change)
```

### Monthly sales history

```text
not loaded (no OsfMonthlySalesHistory row)  --> blank cell
  -- import with qty N --> loaded (qty N, including 0)
  -- re-import same (sku, columnKey, month) --> overwrite
```

Live ERP months never write this table. Import exists only as fallback for
months the ERPs cannot supply.
