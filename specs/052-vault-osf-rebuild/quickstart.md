# Quickstart: Supplement Vault OSF

Validate the feature end-to-end after implementation. Full contracts:
[generate](./contracts/vault-osf-generate.md),
[sales import](./contracts/vault-osf-sales-import.md),
[workbook](./contracts/vault-osf-workbook.md).
Data model: [data-model.md](./data-model.md).

## Prerequisites

- Vault OS env (`npm run env:use vault`)
- Two `ErpnextInstance` rows for the Vault company (ERP1 + ERP2)
- `OsfColumnConfig` seeded: `sv`, `ori`, `ae` with `erpCompany` + warehouses
  (`node scripts/seed-vault-osf-columns.mjs <companyId>`)
- At least one Vault OS `Supplier` matching a real ERP2 distributor
- User with `purchasing.osf.read` (generate) and `purchasing.osf.manage` (import)

Cosmo tenant is **not** required for these steps, but SC-007 needs a Cosmo
generate smoke after merge.

## Unit checks (no ERP)

```bash
npm test -- lib/vault-osf
```

Must cover:

- April→as-of month window (including Jan–Mar wrapping to previous April)
- Sales reducer: signed qty, returns net, Origins Online company dropped
- Purchase reducer: allowlist skip, `net_amount` sum, blank vs 0
- Pricing: item-code rule applied; transaction/coupon/group rules ignored;
  largest discount on overlap; expired/disabled skipped
- Formulas: max sale ignores blank months; AVE blank when max is 0;
  reorder qty signed (not floored); Total ROP blank when all unset

Fixture: `NW004-2` from the 07.09.2026 sample — stock 19, max sale 46, AVE
≈ 0.413; SV ROP 9.152 − stock 6 → reorder 3.152.

## Generate

1. Open `/dashboard/purchasing/osf` as a Vault user.
2. Set as-of date `2026-09-07` (or today).
3. Generate. File downloads as `OSF-vault-{date}.xlsx`.

Expect:

- One row per ERP1 enabled stock item (no `DELIVERY-CHARGES` / `TEST`)
- Identity from ERP1; Priority Status from OS when SKU matches
- Stock only from the three main warehouses
- Sales groups April through as-of month; April and May **empty** until import
- June+ SV/ORI/AE counts reconcile to submitted Sales Invoices (minus returns)
- MRP = ERP1 Standard Selling; Discounted Price = MRP after item-code rule
  (`NW004-2` → 9500 / 8550 while `PRLE-0015` is valid)
- Latest price/supplier from newest allowlisted Purchase Invoice across both ERPs
- No Cosmo columns listed in the workbook contract's "absent" list

## ERP failure

Stop or misconfigure ERP2 credentials, generate again. Must get `502`
`ERP_UNAVAILABLE` naming Origins/AE — not a file with ORI/AE zeros.

## Sales history import

1. Download template for `2026-04`.
2. Fill three SKUs (SV/ORI/AE counts, including a genuine `0` on one cell).
3. Upload. Toast shows updated cell count.
4. Regenerate: those April cells populate; untouched SKUs stay blank; Max sale
   now considers April totals.

## ROP

Reuse existing ROP template/import. Upload SV/ORI/AE values for a few SKUs.
Regenerate: ROP and signed reorder qty appear; SKUs without upload stay blank
ROP (not 0).

## Cosmo isolation

On Cosmo env, `POST /api/admin/osf/generate` still returns the Cosmo workbook
(identity + Cosmo stock columns + `% of ROP` / OGF / 30d purchase). Vault
routes return `409` if `erpCompany` is unset.

## Purchases vs transfers

Pick a SKU last moved only by an intercompany / non-allowlisted supplier.
Purch Qty/Value for that month and Latest price must stay blank. A distributor
purchase (`SV004` US Beauty, etc.) must appear in qty, net value, and latest
price when it is the newest line.
