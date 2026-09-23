# Research: OSF VAT Variants

**Feature**: `056-osf-vat-variants`  
**Date**: 2026-09-16

## R1 — VAT membership source

**Decision**: A SKU is VAT when synced **ERP1 and/or ERP2 Product Priority** equals `Vat` (exact option already in `ERP_PRODUCT_PRIORITY_OPTIONS` and Cosmetics.lk ERP Item Manufacturing → Product Priority).

**Rationale**: Matches live ERP (`ACN01_1` = Vat). Cosmo already syncs via `syncErpProductPriorities` into `ProductItem.erp1ProductPriority` / `erp2ProductPriority`. Existing OSF generate optional filter already matches those fields (despite the request field name `itemStatusCategories`).

**Alternatives considered**:
- Cosmo `itemStatusCategory = VAT_TOP_PRIORITY_BRAND` — different import path; not what purchasing marks on ERP Item.
- Live ERP fetch at generate time — slower; sync already keeps Cosmo fields current on OSF assist refresh.

## R2 — Three generate variants vs optional priority dropdown

**Decision**: Add explicit `osfVariant`: `main` | `vat` | `non_vat` on generate body + UI. Main = current full catalog. VAT / Non-VAT apply membership filters server-side. Keep optional ERP Product Priority dropdown for Main (and optionally Non-VAT) as today; for `vat` / `non_vat`, variant membership is authoritative (do not also require the Vat dropdown).

**Rationale**: Spec requires three maintained OSFs, not “remember to pick Vat”. Explicit variant also drives ROP column rules (only VAT workbook changes ROP layout).

**Alternatives considered**:
- Reuse only `itemStatusCategories: ["Vat"]` — covers VAT slice but not Non-VAT or VAT ROP rules.
- Three separate API routes — unnecessary; one generate path with variant is enough.

## R3 — Cosmetics.lk vs shop vs other company ROP columns

**Decision**:
- **Cosmetics.lk ROP column**: active `includeInRop` column identified as Cosmetics.lk location / online channel column (`isCosmeticsLkLocationColumn` / location name helpers).
- **Shop-wise ROP**: active `includeInRop` columns that are Cosmetics.lk internal shops (`isCosmeticsLkInternalShopColumn` / `isShopOsfColumn` / `cosmo_shop_*`).
- **Other company-wise ROP**: all other active `includeInRop` columns (LMJ, DRO, trading companies, etc.) — **omitted from VAT workbook ROP headers**; still used on Main / Non-VAT.

**Rationale**: Reuses existing column classifiers; no new column-type DB field for v1.

**Alternatives considered**:
- New `OsfColumnConfig.role` enum — clearer long-term but schema change + migration across three DBs; out of scope per simplicity gate.
- Label string match only — brittle vs existing helpers.

## R4 — VAT Total ROP math

**Decision**: On `osfVariant === "vat"`, `Total ROP` = Cosmetics.lk column ROP only (null/0 if missing). Shop ROPs still written to their columns but **excluded** from the sum. `% of ROP`, `70% OF TOTAL ROP`, availability label, and below-threshold / `maxStockPctOfRop` filters use this Total ROP. Main / Non-VAT keep today’s sum of all `includeInRop` columns.

**Rationale**: Spec FR-005 / FR-008. Generate route currently pre-filters using summed ROP; VAT variant must use the same Cosmetics.lk-only total there.

**Alternatives considered**:
- Sum Cosmetics.lk + shops — rejected by product owner.
- Hide shop ROP columns entirely — rejected; shops stay visible for planning.

## R5 — Stock columns on VAT OSF

**Decision**: Keep all active `includeInStock` columns on VAT OSF (FR-010). Only ROP header set is restricted.

**Rationale**: Spec allows stock unchanged for v1; avoids under-showing warehouse stock while buyers still see shop ROPs.

## R6 — Schema / persistence

**Decision**: **No Prisma schema change.** ROP values continue in `ProductOsfRop` keyed by `OsfColumnConfig.key`. Cosmetics.lk + shop ROPs already editable via product editor / ROP import for columns with `includeInRop`.

**Rationale**: Constitution migration discipline; shops already exist as columns.

## R7 — Filename / identity

**Decision**: Download filenames:
- Main: `OSF-{asOfDate}.xlsx` (unchanged)
- VAT: `OSF-vat-{asOfDate}.xlsx`
- Non-VAT: `OSF-non-vat-{asOfDate}.xlsx`
- Reorder + variant: `OSF-reorder-vat-{asOfDate}.xlsx` / `OSF-reorder-non-vat-{asOfDate}.xlsx` / existing reorder name for main

Optional response header `X-OSF-Variant: main|vat|non_vat`.

## R8 — Case / spelling of Vat

**Decision**: Match priority with trim + case-insensitive equality to `vat` for membership, but treat stored ERP option as `Vat`. Document that sync should keep ERP select value.

**Rationale**: Avoid missing rows if one ERP stores `VAT` / `vat`; canonical option list uses `Vat`.
