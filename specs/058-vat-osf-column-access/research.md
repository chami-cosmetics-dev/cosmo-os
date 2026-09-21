# Research: VAT OSF Column Access & Shop Columns

**Feature**: `058-vat-osf-column-access` | **Date**: 2026-09-21

## R1 — Per-variant column Access storage

**Decision**: Add `osfVariant` (`main` | `vat` | `non_vat`) to `OsfUserColumnAccess`. Change uniqueness to `(companyId, userId, osfVariant)`. Migrate existing rows to `osfVariant = 'main'`. Do **not** copy Main marks into `vat` / `non_vat` (rows absent or `columnKeys: []`).

**Rationale**: Clarification session chose empty start for VAT Items / Others. Separate rows keep GET/PUT simple and match generate’s existing `OsfVariant` enum. Avoids JSON-blob marks that are harder to sanitize per catalog.

**Alternatives considered**:
- Single row with `marksByVariant` JSON — fewer rows, worse validation/indexability.
- Share Main marks across variants — rejected by clarification.
- Copy Main → VAT on migrate — rejected (Main has other-location keys invalid on VAT).

## R2 — Access API & UI shape

**Decision**: Extend `GET`/`PUT /api/admin/osf/column-access` with required `osfVariant` (query for GET; body field for PUT assignments). Catalog returned is **variant-filtered**. UI: same user list + Access multi-select; add a **variant selector** (Main / VAT Items OSF / Others) above the list; switching variant reloads marks for that profile.

**Rationale**: Minimal change to existing panel; matches FR-001. Variant selector deferred from clarify as plan detail — selector is clearer than three panels.

**Alternatives considered**: Three separate routes — unnecessary duplication. Tabs per variant — heavier UI for same data.

## R3 — Generate applies variant-scoped Access

**Decision**: `resolveEffectiveOsfColumnKeys(context, companyId, osfVariant)` loads marks for that variant only. Full-access (`manage` / `permission`) still returns `"all"` for the **variant’s column set** (VAT Items workbook still omits other locations via workbook filter, not via Access).

**Rationale**: Spec: marks independent per variant; unrestricted users get full *standard set for that variant*.

## R4 — VAT Items location column filter (stock + ROP + order)

**Decision**: Today only ROP columns are VAT-filtered (`selectVatRopColumns`). Extend helpers so **stock** (and thus order qty columns driven by stock cols) use the same Cosmetics.lk + shop classifiers. `Total Stock` / order aggregates for VAT sum only that set. Shared static columns (pricing, margins, sales, …) unchanged.

**Rationale**: Spec FR-006 / clarification Q4: drop other *locations*, keep Main’s non-location columns. Current generate still emits LMJ/LWK stock on VAT — gap to close.

**Alternatives considered**: Filter only Access catalog for VAT but still emit other locations for full-access users — violates SC-004.

## R5 — Rename to VAT Items OSF

**Decision**: Keep internal enum value `vat`. Change user-facing strings: generate selector, toast/filename helpers, Access variant label, Info sheet display if any. Filename pattern e.g. `vat-items-osf-…` (or include `VAT-Items` token).

**Rationale**: Avoids breaking clients/tests that compare `osfVariant === "vat"`. Spec cares about product naming.

## R6 — Auto-create Cosmetics shop OSF columns from ERP1

**Decision**: New `ensureCosmeticsShopOsfColumns(companyId)`:
1. Resolve Cosmetics.lk location’s `erpnextInstanceId` + ERP company (same as `scripts/seed-osf-cosmo-shop-columns.mjs`).
2. List non-group, non-disabled warehouses for that ERP company (reuse/adapt warehouse list pattern from `lib/store-stock-count/erp.ts`).
3. Keep names where `isShopWarehouseName(name)` is true.
4. Upsert `OsfColumnConfig` with `key = cosmo_shop_<slug>`, `label` from cleaned shop name, `companyLocationId = null`, `erpnextInstanceId`, `directWarehouses = [warehouseName]`, `includeInStock = true`, `includeInRop = true`, `active = true`.
5. For previously auto-managed shop columns whose warehouse no longer qualifies / is disabled: set `active = false` (do not delete ROP history).
6. Invoke from OSF generate (before resolve columns) and from columns management GET or explicit “Refresh shops” if UX needs it — generate-time ensure is enough for SC-005.

**Rationale**: Clarifications A/A: Cosmetics + shop-name rules; stock+ROP on; appear on all three OSFs where shops exist (columns are global `OsfColumnConfig`; VAT workbook already includes shop cols).

**Alternatives considered**:
- Manual seed script only — rejected by product ask.
- Admin confirm before create — rejected.
- Any Cosmetics warehouse — rejected (too broad).
- Real-time ERP webhook — overkill; generate/sync ensure sufficient.

## R7 — Access keys for new shops

**Decision**: After upsert, `buildOsfAccessCatalog` naturally includes `stock:` / `rop:` / `order:` keys for the new column. Restricted users remain unmarked (fail closed). No auto-grant to users who have other shop marks.

**Rationale**: Spec FR-011 / SC-006.

## R8 — Agent context script

**Decision**: No `.specify` `update-agent-context` script in this repo; skip (same as 041–057).

**Alternatives considered**: Hand-edit agent markdown — out of scope for this command.
