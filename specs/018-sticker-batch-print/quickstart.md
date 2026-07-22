# Quickstart: Unified Sticker Batch & Print

Manual + automated validation for [spec.md](./spec.md). See [contracts/sticker-batch-print.md](./contracts/sticker-batch-print.md).

## Prerequisites

- Cosmo OS (and Vault if available) with sticker batch/print permissions
- Product with `(Default Title)` variant name, compare-at ≠ sell price, and an OSF `ogfPrice`
- Location with `locationReference` = `LWK`

## Automated checks

```bash
npm test -- lib/sticker-item-name.test.ts lib/sticker-dates.test.ts lib/sticker-unit-price.test.ts lib/sticker-print-quantity.test.ts
```

Expect: name clean, compact MFD/EPD+3y, price resolve (incl. LWK), quantity helpers still green.

## Manual scenarios

### 1. One page workflow

1. Open sidebar Stickers → **Batch & Print** (single entry).
2. Confirm `/dashboard/sticker-print` redirects to batch workspace (with `batchId` if provided).
3. Create/edit batch, preview, print without leaving the page.

### 2. Clean item name

1. Add SKU whose catalog name includes Default Title.
2. Batch row and Cosmo preview/print show name **without** `(Default Title)`.

### 3. Cosmo address

1. On Cosmo, preview sticker → address is **company** Cosmetics.lk address, not location address.
2. On Vault, confirm no address regression.

### 4. MFD / EPD

1. Enter MFD `20260703` → becomes `03/07/2026`; EPD auto `03/07/2029`.
2. Enter MFD `03072026` → same normalize; EPD = +3 years.
3. Edit EPD manually → kept; change MFD again → EPD resets to new MFD + 3 years.

### 5. Original price

1. Item with compare-at higher than sell price, non-LWK location.
2. Unit price = compare-at (original), not sell/discount.

### 6. LWK price

1. Set line location to LWK → unit price = OGF/LWK price.
2. Switch to non-LWK → unit price returns to original/list rule.
3. LWK with missing OGF price → price not silently set to discount sell price.

### 7. Quantity (016 preserved)

1. Quantity 5 → one preview card + badge 5; print yields 5 labels.

## Pass criteria

- [ ] Single nav + redirect from old print URL
- [ ] Default Title stripped
- [ ] Cosmo company address on sticker
- [ ] Compact MFD + auto EPD +3y editable
- [ ] Original price non-LWK; OGF price on LWK
- [ ] Quantity print behavior unchanged
