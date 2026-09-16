# Quickstart: OSF VAT Variants

**Feature**: `056-osf-vat-variants`  
**Date**: 2026-09-16

## Prerequisites

- Cosmo OS (not Vault) with `purchasing.osf.read`
- ERP Product Priority synced (Assist refresh or existing sync) so some SKUs have `Vat`
- OSF columns: Cosmetics.lk location column + at least one `cosmo_shop_*` / shop column with `includeInRop`
- Known VAT SKU (e.g. ERP Item Product Priority = Vat) with Cosmetics.lk ROP and one shop ROP set

## Unit checks

```bash
npm test -- lib/osf
```

Focus after implement:

- Catalog / membership helpers: Vat vs non-Vat partition
- Workbook build: VAT ROP headers omit other companies; Total ROP = Cosmetics.lk only
- Generate validation accepts `osfVariant`

## Manual UAT

### 1. Main still works

1. Open Purchasing → OSF → Generate.
2. Select **Main OSF**, leave priority All.
3. Generate.
4. Expect filename `OSF-{date}.xlsx` and both Vat and non-Vat SKUs (subject to other filters).
5. Confirm Total ROP still sums all company/shop ROP columns as today.

### 2. VAT OSF membership + ROP rules

1. Select **VAT OSF**.
2. Generate.
3. Expect `OSF-vat-{date}.xlsx`.
4. Every Item Status / priority row should be Vat on ERP1 and/or ERP2; no non-Vat SKUs.
5. ROP headers: Cosmetics.lk ROP + shop ROP columns only — no LMJ/DRO/other company ROP headers.
6. Pick a SKU with Cosmetics.lk ROP = 100 and shop ROPs totaling 60 → **Total ROP = 100**.
7. Confirm % of ROP / 70% columns use 100 as denominator base.

### 3. Non-VAT OSF

1. Select **Non-VAT OSF**, generate → `OSF-non-vat-{date}.xlsx`.
2. No SKU with Erp priority Vat.
3. ROP layout matches Main (all company ROP columns; Total ROP summed).

### 4. ROP maintain then regenerate

1. Edit Cosmetics.lk ROP and one shop ROP for a Vat SKU (editor or ROP import).
2. Regenerate VAT OSF.
3. New values appear; Total ROP tracks Cosmetics.lk only.

### 5. Empty edge

1. If no Vat SKUs in company catalog, VAT generate should not crash (empty workbook or clear empty outcome).

## Contract reference

See [contracts/osf-generate-variants.md](./contracts/osf-generate-variants.md).
