# Contract: Cosmetics Shop OSF Column Sync

## Purpose

When a Cosmetics ERP1 warehouse qualifies as a shop floor, Cosmo MUST have a matching active `OsfColumnConfig` shop column with stock + ROP enabled so Main, VAT Items, and Others generates can show ERP warehouse stock/item figures without manual seed scripts.

## Qualification

A warehouse qualifies when **all** are true:

1. Listed under the Cosmetics ERP company on the ERP instance mapped to Cosmetics.lk.
2. Not a group warehouse; not disabled.
3. `isShopWarehouseName(name)` — name contains `shop`; excludes website, transit, WIP, finished goods, “all warehouses” (existing helper).

Non-Cosmetics companies and failing names MUST NOT create columns.

## Column shape

| Attribute | Rule |
|-----------|------|
| key | `cosmo_shop_<slug>` derived stably from warehouse name |
| label | Display shop name |
| companyLocationId | null |
| erpnextInstanceId | Cosmetics.lk’s instance |
| directWarehouses | Exact ERP warehouse name |
| includeInStock / includeInRop | true |
| active | true while qualified |

## Invocation

| Trigger | Behavior |
|---------|----------|
| OSF generate (any variant) | Ensure before resolving columns / fetching bins |
| Optional: columns admin GET/refresh | Same ensure for operators without generating |

Idempotent: safe to run every generate.

## Deactivation

If a previously synced shop warehouse no longer qualifies or is disabled → set `active = false`. Do not delete `ProductOsfRop` rows. Access marks for inactive keys sanitize out of catalogs.

## Data on generate

Stock (and related item/warehouse fields already used for shop columns) come from existing bin/stock fetch for `directWarehouses`. SKU row membership still follows `osfVariant` (Main / VAT / Non-VAT). New shop columns appear on all three variants’ workbooks wherever shop location columns are included (VAT Items already includes shops; Main/Others include full location set including shops).

## Access

New `stock:` / `rop:` / `order:` catalog ids appear for all variants that list shop columns. Restricted users unmarked → omitted from download until assigned.
