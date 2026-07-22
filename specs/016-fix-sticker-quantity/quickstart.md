# Quickstart: Fix Sticker Batch Quantity Print

Manual validation for [spec.md](./spec.md). See [contracts/sticker-quantity-print.md](./contracts/sticker-quantity-print.md) for behavior rules.

## Prerequisites

- Local app running with sticker batch + print permissions
- Ability to create/edit a sticker batch and open `/dashboard/sticker-print`

## Automated checks

```bash
npm test -- lib/sticker-print-quantity.test.ts
```

Expect: expand/sum helpers cover qty 1, qty N, mixed lines, and total count.

## Manual scenarios

### 1. Single item, quantity 5

1. Sticker Batch → add one item, set **Quantity** to `5`, save.
2. Open **Sticker Print**, select that batch.
3. **Preview**: one sticker card; quantity shown as **5**; Sticker Count = **5**.
4. Click **Print Stickers** → print dialog / print preview shows **5** labels for that item (same content each).

### 2. Mixed quantities

1. Batch with items qty `5`, `2`, and `1`.
2. Preview: **3** cards; numbers 5, 2, 1 visible; Sticker Count = **8**.
3. Print: **8** labels (5 + 2 + 1).

### 3. Quantity 1 regression

1. Item with Quantity `1`.
2. Preview: one card showing `1`; count `1`.
3. Print: one label.

### 4. Edit quantity then reprint

1. Change an item from `2` → `4`, save.
2. Reload batch on Sticker Print: preview number **4**, count updated.
3. Print: **4** labels.

### 5. Cosmo vs Vault

Repeat scenario 1 on both app modes if available (`NEXT_PUBLIC_APP_NAME`). Preview badge + print expansion must work for both card layouts; printed faces must not include the quantity badge.

## Pass criteria

- [ ] Preview never shows N duplicate cards for quantity N
- [ ] Per-item quantity number visible on screen
- [ ] Sticker Count = sum of quantities
- [ ] Print output label count = sum of quantities
- [ ] Printed sticker content unchanged aside from copy count
