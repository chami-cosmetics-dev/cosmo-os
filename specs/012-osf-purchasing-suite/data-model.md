# Data Model: OSF Purchasing Suite

**Feature**: `012-osf-purchasing-suite`  
**Date**: 2026-07-20

## Entities

### ProductOsfProfile (extend existing)

| Field | Type | Notes |
|-------|------|--------|
| …existing | | shopAvailability, ogfPrice, sku, companyId |
| reorderThresholdPercent | Int? | 1–100; null ⇒ treat as **70** for below-threshold checks |

**Validation**: If set, integer 1–100 inclusive. Cleared with null.

### ProductOsfRop / OsfColumnConfig / ProductItem (existing — unchanged)

Absolute warehouse ROP and stock mapping unchanged. Catalog `price` / `compareAtPrice` supply discounted sell + MRP for calculator prefill.

### Permission records (RBAC seed)

| Key | Purpose |
|-----|---------|
| `purchasing.tools.read` | Calculator, compare, filtered OSF |
| `purchasing.tools.manage` | Edit reorder threshold % |
| `reminders.purchasing_rop_threshold` | Reminder bubble |

Classic: `purchasing.osf.read`, `purchasing.osf.manage` unchanged.

### Derived (not stored)

| Concept | Rule |
|---------|------|
| Signed warehouse order qty | ROP − stock (null if no ROP) |
| TOTAL ORDER QTY (buy) | Sum of warehouse order qtys where qty &gt; 0 |
| Common SKU Reorder (buy) | Sum of positive warehouse order qtys across base-SKU group (or sum of variant TOTAL buys) |
| Below threshold | totalRop &gt; 0 AND (totalStock / totalRop) × 100 &lt; effectiveThreshold |
| Margin % | (selling − purchase) / selling |
| Price change % | (new − last) / last |
| Session new price / edited selling | UI state only — not persisted |

### Supplier allowlist (existing)

Last purchase / cost for calculator follows OSF allowlist (`Supplier` name/code) already used in `fetchLastPurchaseByItem`.

## Relationships

```text
Company
  └── ProductOsfProfile (sku) ── reorderThresholdPercent
  └── ProductOsfRop (sku, columnKey) ── absolute ROP
  └── OsfColumnConfig ── warehouses
  └── Supplier ── allowlist for purchase price
  └── ProductItem ── catalog identity + sell price
```

## Migration notes

- `npm run db:migrate:create` for `reorderThresholdPercent`
- `npm run db:deploy:all` to vault + cosmo-dev + cosmo-prod
- Backfill not required (null ⇒ 70)
