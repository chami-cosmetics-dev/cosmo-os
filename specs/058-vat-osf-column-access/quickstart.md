# Quickstart: VAT OSF Column Access & Shop Columns

**Feature**: `058-vat-osf-column-access`

## Prerequisites

- Cosmo company with OSF configured (Cosmetics.lk column + existing shops).
- User with `purchasing.osf.permission` (Access) and `purchasing.osf.read` / manage (generate).
- ERP1 Cosmetics instance reachable for warehouse list + bin stock.
- After migration: `npm run db:generate` and `npm run db:deploy:<target>` (confirm with user before any deploy).

## Automated checks

```bash
npm test -- lib/osf/column-visibility.test.ts lib/osf/vat-rop-columns.test.ts lib/osf/build-workbook.test.ts
# plus new: shop-column-sync / variant access tests once implemented
```

Expect: VAT stock headers exclude LMJ-style locations; Access resolve uses `osfVariant`; shop ensure upserts `cosmo_shop_*` for shop-named Cosmetics warehouses.

## Manual UAT

### 1. Rename + variant Access empty start

1. Open Purchasing → OSF.
2. Confirm generate option reads **VAT Items OSF**.
3. Open Excel column access; select **VAT Items OSF**.
4. Restricted user with Main marks: VAT Items marks empty; download VAT Items → core identity only.
5. Mark Cosmetics.lk stock + one shop ROP for that user on VAT Items; re-download → only those + identity.
6. Main download still follows Main marks (unchanged).

### 2. VAT Items location set

1. Generate VAT Items as manage/permission user.
2. Headers: Cosmetics.lk + shops present; LMJ/LWK/MNK (or other non–Cosmetics locations) **absent**.
3. Pricing/margin columns still present for full-access user.
4. Total ROP = Cosmetics.lk ROP only (regression).

### 3. Others Access independent

1. Select Others in Access; leave empty; download Others as restricted user → core only.
2. Marks do not affect Main/VAT Items.

### 4. New shop warehouse

1. In ERP1 Cosmetics, create (or use) a warehouse matching shop-name rules (e.g. contains “Shop”).
2. Generate any OSF variant (or refresh columns).
3. Confirm new `cosmo_shop_*` column active with stock+ROP; stock cells match ERP for items in that warehouse.
4. Column appears on Main, VAT Items, and Others generates.
5. Restricted unmarked user does not receive the new shop columns until Access marked.
6. Disable warehouse in ERP / rename to non-shop → next ensure: column inactive; gone from new files.

## Contracts

- [osf-column-access-variants.md](./contracts/osf-column-access-variants.md)
- [osf-shop-column-sync.md](./contracts/osf-shop-column-sync.md)
- [data-model.md](./data-model.md)
