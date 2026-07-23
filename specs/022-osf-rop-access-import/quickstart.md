# Quickstart: OSF Full Column Access, Shop ROPs & ROP Import

Validate `022-osf-rop-access-import` after implementation. Contracts: [osf-column-access.md](./contracts/osf-column-access.md), [osf-rop-import.md](./contracts/osf-rop-import.md). Data model: [data-model.md](./data-model.md).

## Prerequisites

1. Feature branch / code for this spec merged locally.
2. After migration exists: `npm run db:generate` then `npm run db:deploy:<your-target>` (never `db:push` on shared DBs). Production/`db:deploy:all` only with explicit user confirmation.
3. Cosmetics.lk shop `OsfColumnConfig` rows present with `includeInRop: true` (seed or Columns settings).
4. Test users:
   - **Assigner**: `purchasing.osf.permission`
   - **Manager**: `purchasing.osf.manage`
   - **Restricted A / B**: `purchasing.osf.read` only (no manage/permission)

## 1. Unit checks

```bash
npm test -- lib/osf
```

Expect coverage for:

- Effective column keys (full-access vs marked vs identity-only)
- `sumSignedOrderQtysFlooredAtZero`: `[10,3,-15] → 0`, `[10,3,-5] → 8`
- ROP import: blank skip, duplicate SKU reject, unknown SKU error

## 2. Access dropdown (US1)

1. As Assigner, open Purchasing → OSF → Excel column access.
2. Confirm user list; open **Access** for Restricted A; search a column name; mark e.g. cost header + one shop ROP column; leave Restricted B empty; Save.
3. Download full OSF (and reorder-only if available) as A vs B.
4. **Expect**: A’s file has marked columns; B’s has identity only (no marked columns); Assigner/Manager downloads still full set.

## 3. Shop ROP (US2)

1. As Manager, open item OSF editor for a known SKU.
2. **Expect**: Cosmetics.lk shop labels appear under ROP by column.
3. Set a shop ROP, save, generate OSF.
4. **Expect**: That shop’s ROP / order columns reflect the value.

## 4. ROP template import (US3)

1. As Manager, download ROP template.
2. **Expect**: All SKUs; SKU + Barcode + location/shop ROP headers; current values prefilled.
3. Change ≥3 cells (mix location + shop); leave others blank; upload.
4. **Expect**: Toast/summary with updated cell count; editor + next generate show new ROPs; blank cells unchanged.
5. As Restricted user, hit template/import URLs → **403**.

## 5. TOTAL ORDER QTY (US4)

1. Use fixture or known SKU where signed order qtys are +10, +3, −15 (or construct via ROP/stock).
2. Generate OSF.
3. **Expect**: Per-column signed qtys unchanged; **TOTAL ORDER QTY = 0**; a net-positive case (e.g. +10,+3,−5) shows **8**.

## Done when

- [ ] Access marks enforce per-column download filter
- [ ] Shop ROPs editable and present on generate
- [ ] Template round-trip updates ROPs correctly
- [ ] TOTAL / Common aggregates use signed-sum floor-at-zero
- [ ] `npm test` OSF libs green
