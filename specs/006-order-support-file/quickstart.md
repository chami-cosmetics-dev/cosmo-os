# Quickstart: Order Support File (OSF) Generator

**Feature**: `006-order-support-file`  
**Date**: 2026-07-16

Validate the feature end-to-end after implementation (see [plan.md](./plan.md), [contracts/osf-generator.md](./contracts/osf-generator.md)).

## Prerequisites

- Cosmo env with DB + ERP credentials for Cosmetics locations (`npm run env:use cosmo-dev` or local equivalent)
- **Deploy gate (ask before prod):** After the OSF migration exists, apply with `npm run db:deploy:all` (or target env) — **only after explicit user confirmation**. Do not use `db:push` on shared DBs.
- User with `purchasing.osf.manage` (edit) and `purchasing.osf.read` (generate)
- At least one `OsfColumnConfig` row mapped to a real `CompanyLocation` with ERP warehouse (optional seed: `node scripts/seed-osf-columns.mjs <companyId>`)
- Sample catalog SKUs present as `ProductItem` rows

## Setup checklist

1. Open **OSF column settings** — create columns matching Main sheet labels (e.g. Cosmetics.lk, LMJ, …) and map to locations.
2. Open **OSF product editor** — pick a known SKU (e.g. from reference workbook), set Shop Availability = Allowed, set ROP for 2+ columns, Save.
3. Confirm ERP Bin has on-hand qty for that item at the mapped warehouse(s).

## Generate

1. Open OSF Generate panel.
2. Choose `salesMonth` = a month with known delivered/invoiced orders for that SKU.
3. Click Generate — browser downloads `OSF-*.xlsx`.

## Expected outcomes

| Check | Expect |
|-------|--------|
| Identity | SKU, title, brand, item status, image match Cosmo catalog |
| Shop Availability | Matches UI value |
| Stock cells | Match ERP Bin `actual_qty` for mapped warehouses (±0) |
| ROP cells | Match UI-saved ROP; unset → No ROP / blank calc |
| Common SKU | Variants sharing base SKU (e.g. `CAN07_1`/`CAN07_2`) share summed Common stock/ROP |
| OGF Price / Margin | Independent OGF Price (UI or blank); margin = (OGF − cost) / OGF — **not** tied to LWK |
| Latest Cost / Supplier | Populated from ERP when available; else blank |
| Monthly sales | Units match manual count of non-voided delivery_complete/invoice_complete lines for that month |
| Missing ERP | Blank stock/cost — no invented numbers |
| Permission | User without `purchasing.osf.read` cannot generate (403) |

## Automated checks

```bash
npm test -- lib/osf
```

Cover at least: `baseSku` grouping, 70% availability labels, order-qty sign, monthly sales month bucketing (Asia/Colombo).

## Out of scope for this quickstart

- Excel import of ROP / availability
- Randil/Inoka filtered sheets
- Vault OS
- OGF price: independent UI field (not LWK); margin like Excel
