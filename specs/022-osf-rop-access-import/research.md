# Research: OSF Full Column Access, Shop ROPs & ROP Import

**Feature**: `022-osf-rop-access-import`  
**Date**: 2026-07-23

## R1 — Per-column Access storage (replace groups)

**Decision**: Persist assignable marks as **`columnKeys: string[]`** on `OsfUserColumnAccess` (replace `columnGroups`). Each key is a **stable access id**, not a coarse group. GET returns `{ id, label }[]` for the Access multi-select; PUT accepts `columnKeys`. On generate, filter workbook column defs by effective key set. Holders of `purchasing.osf.manage` or `purchasing.osf.permission` still receive **all** columns.

**Always-included (no mark required)**: `identityHeaders()` only (Variant SKU variants, barcode, description, brand, etc.).

**Assignable**: every other Main-sheet column, including:
- Per active OSF column: `{label}` stock, `{label} ROP`, `{label} ORDER QTY`
- Aggregates: Total Stock, Common SKU Stock, Common ROP, % of ROP, 70% fields, TOTAL ORDER QTY, Common SKU Reorder
- Pricing / cost / margins / sales headers previously under groups

**Stable ids**:
| Kind | `id` | `label` (UI / Excel header) |
|------|------|------------------------------|
| Static | Exact workbook header string (e.g. `Cosmetics MRP`) | Same |
| Location/shop stock | `stock:{OsfColumnConfig.key}` | `{column.label}` |
| Location/shop ROP | `rop:{OsfColumnConfig.key}` | `{column.label} ROP` |
| Location/shop order | `order:{OsfColumnConfig.key}` | `{column.label} ORDER QTY` |

**Migration**: Map legacy `columnGroups` → union of static keys that belonged to that group (`pricing`/`cost`/`margins`/`sales`). Do **not** auto-grant location stock/ROP/order keys (those were previously always-on via `core`); after migrate, assigners must mark them explicitly for restricted users (fail closed / matches new product intent).

**Rationale**: Spec clarification — searchable Access dropdown of all column names; group matrix insufficient. Stable ids survive label renames for location columns.

**Alternatives considered**:
- Keep groups + add location toggles — rejected (user asked for full column list)
- Store Excel header strings only for dynamics — rejected (label rename breaks marks)
- Always include all stock/ROP as core — rejected (spec wants location/shop columns assignable)

## R2 — Access UI: user list + searchable multi-select

**Decision**: Keep purchasing-user list. Replace group checkbox columns with one **Access** control per user (searchable multi-select / combobox pattern already used elsewhere, e.g. Command + multi mark). Save still batch-PUT assignments. Show selected count or chips for marked columns.

**Rationale**: Matches stakeholder screenshot + clarification (users → Access dropdown → search → mark).

**Alternatives considered**: Wide per-column checkbox matrix — rejected (unusable with dozens of columns).

## R3 — Cosmetics.lk shop ROPs

**Decision**: Shop warehouses are already modeled as `OsfColumnConfig` rows via `scripts/seed-osf-cosmo-shop-columns.mjs` (`directWarehouses` + Cosmetics.lk ERP instance). Today seed sets **`includeInRop: false`**, so they appear in stock but not in “ROP by column”. For this feature:
1. Treat shop columns with `includeInRop: true` as first-class ROP targets (product editor + generate already filter on that flag).
2. Update seed defaults to `includeInRop: true` for shop keys; provide a one-time upsert/fix path or document toggling in OSF Columns settings.
3. No new Prisma model for shop ROP — reuse `ProductOsfRop` with `columnKey` = shop config `key`.

**Rationale**: Schema comment and seed already intended Cosmo shops as OSF columns; gap is ROP flag + surfacing in Access/template.

**Alternatives considered**:
- Separate ShopRop table — rejected (duplicates ProductOsfRop)
- Hard-code shop list in UI — rejected (columns settings / seed remain source of truth)

## R4 — ROP template download + upload

**Decision**:
- **GET** `/api/admin/osf/rop-template` → `.xlsx` with all OSF-scope SKUs; columns: `SKU`, `Barcode`, then one ROP column per active `includeInRop` OSF column (header = column **label**, stable match also by config key in a hidden mapping sheet **or** match upload headers to labels case-insensitively with exact label preferred). Prefill current `ProductOsfRop.ropQty` where set.
- **POST** `/api/admin/osf/rop-import` → multipart file; parse with `xlsx` (same approach as `lib/product-item-status-import.ts`); upsert `ProductOsfRop` for non-blank valid cells; blank = skip; unknown SKU / bad header / negative / non-integer → cell/row error in summary; duplicate SKU rows → reject that SKU’s changes.
- Auth: `purchasing.osf.manage` only.
- Sync processing in-request for v1 (no queue); return `{ updatedCells, skippedBlank, errors[] }`.

**Rationale**: Spec US3; `xlsx` already used for OSF generate and other imports; manage gate matches ROP editing.

**Alternatives considered**:
- CSV only — rejected (many ROP columns; xlsx better for buyers)
- Async job queue — deferred until catalog size proves timeout risk
- Blank clears ROP — rejected (spec: blank = no change)

## R5 — TOTAL ORDER QTY signed sum floored at 0

**Decision**: Replace positives-only aggregate with:

```text
sum = Σ (finite per-column order qtys, including negatives)
TOTAL = max(0, sum)
```

Same helper for **Common SKU Reorder** buy totals that currently chain off positive-only TOTAL. Per-column ORDER QTY cells stay signed (`orderQty` unchanged).

**Rationale**: Spec US4 explicitly reverses 012 clarification R2 (+10,+3,−15 → 0 not 13).

**Alternatives considered**:
- Keep positives-only — rejected by stakeholder
- Show negative TOTAL — rejected (spec: show 0 when net negative)

## R6 — Workbook filter mechanics

**Decision**: Attach `accessKey` on each `ColDef` (identity defs omit or use reserved `identity:*` always allowed). `buildOsfWorkbook` filters `defs` where `accessKey` is null/identity OR in effective key set. Buyer sheets that already omit pricing continue to respect the same filtered Main defs / existing buyer-sheet rules without reintroducing group-only visibility.

**Rationale**: Minimal change to sheet writer; keys align Access UI ↔ Excel.

**Alternatives considered**: Post-filter Excel columns after write — rejected (harder with 3-row header band).
