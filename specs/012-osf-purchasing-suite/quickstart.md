# Quickstart: OSF Purchasing Suite

**Feature**: `012-osf-purchasing-suite`  
**Date**: 2026-07-20

## Prerequisites

- Cosmo company with ERP instance + OSF columns mapped
- Catalog SKUs with `ProductOsfRop` values on ≥2 warehouses
- Roles UI: grant `purchasing.tools.read`, `purchasing.tools.manage`, `reminders.purchasing_rop_threshold` as needed (plus existing OSF perms for full generate)
- Migrate: `npm run db:migrate:create` (threshold column) then `npm run db:deploy:all` (with user confirmation for prod)

## Validation scenarios

### 1. Sidebar group

1. User with `purchasing.osf.read` only → sees Purchasing group + OSF; **no** Calculator.
2. User with `purchasing.tools.read` → sees Calculator (and filtered reorder entry).
3. User with neither → no purchasing tool links.

### 2. Signed order qty + TOTAL

1. Set warehouse ROPs 10 / 8 / 15 and arrange ERP stock 0 / 5 / 30 for one SKU (or fixture unit test).
2. Generate full OSF (`purchasing.osf.read`).
3. Expect order qtys **+10, +3, −15** and **TOTAL ORDER QTY = 13**.

Unit: `npm test` covering `orderQty` signed + positive-only total helper.

### 3. Margin calculator

1. Open `/dashboard/purchasing/calculator` with tools.read.
2. Search SKU with known cost and catalog sell price.
3. Confirm sell prefills; margin = (sell − cost) / sell.
4. Edit sell; margin updates. Clear cost path: blank margin message.

### 4. Price compare (session-only)

1. Same page: enter new price 20% above last cost → +20% shown.
2. Navigate away and back → typed new price **not** restored.

### 5. Reorder threshold + filtered OSF

1. Set SKU threshold 70% (or leave null ⇒ 70).
2. Create stock/ROP so stock/ROP &lt; 70% for SKU A and ≥ 70% for SKU B.
3. Generate with `belowThresholdOnly: true` (`purchasing.tools.read`).
4. Workbook contains A, not B. All-above case → empty/notice + toast.

### 6. Reminder bubble

1. Grant `reminders.purchasing_rop_threshold` only (no tools).
2. With ≥1 below-threshold SKU, open reminders → see purchasing ROP category.
3. User without that permission → no bubble.
4. Link opens actionable purchasing screen.

## Commands

```bash
npm test
npm run lint
# migrate + deploy only with explicit confirmation for shared DBs
```

## Contract / model refs

- [contracts/purchasing-suite.md](./contracts/purchasing-suite.md)
- [data-model.md](./data-model.md)
- [research.md](./research.md)
