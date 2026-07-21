# Quickstart: SKU Supplier Compare

## Prerequisites

- Cosmo env with purchasing tools and ERP connected (same as OSF calculator).
- User with `purchasing.tools.read`.
- Company **Supplier** allowlist configured if intercompany receipts should be excluded.
- At least one SKU purchased from **two allowlisted suppliers** at different rates (for ranking UAT).

No database migration for this feature.

## Validation scenarios

### 1. Access

1. Log in with `purchasing.tools.read`.
2. Open purchasing calculator (Purchasing / OSF sidebar).
3. User without tools permission → no calculator / API 403 on `/suppliers`.

### 2. Multi-supplier list

1. Search and select a SKU with history from suppliers A and B.
2. Confirm supplier section lists both with display names.
3. Confirm each row shows: best-ever price + date, last price + date.

### 3. Best Option ranking

1. Use a SKU where A’s best-ever &lt; B’s best-ever.
2. Confirm A = **Best Option 1**, B = **Option 2**.
3. If best-ever ties, confirm newer **last purchase date** ranks higher.

### 4. Recently tag (30 days)

1. Pick a SKU where one supplier’s **last purchase** is within 30 days.
2. Confirm **Recently** badge on that row only.
3. Supplier with last purchase &gt; 30 days ago → no Recently tag.

### 5. Last purchased from

1. With multiple suppliers, confirm exactly one row has **Last purchased from** (newest last purchase date).

### 6. Margin calculator isolation

1. Note margin calculator purchase/cost value.
2. Click different supplier rows (if rows are interactive for highlight only).
3. Confirm cost **unchanged**; margin recalculates from same global latest cost.

### 7. Empty / ERP error

1. SKU with no purchase history → “No purchase history” empty state.
2. Simulate ERP down → inline error; no fabricated suppliers.

### 8. Allowlist

1. With allowlist configured, confirm disallowed ERP suppliers do not appear.

## Commands

```bash
npm test -- lib/osf/supplier-compare.test.ts lib/osf/erp-purchases.test.ts
npm run lint
```

## API smoke test

```bash
# Replace SKU and session cookie as appropriate
curl -s "http://localhost:3000/api/admin/purchasing/sku-pricing/suppliers?sku=CAN07_1" \
  -H "Cookie: …" | jq .
```

## Refs

- [contracts/sku-supplier-compare.md](./contracts/sku-supplier-compare.md)
- [data-model.md](./data-model.md)
- [research.md](./research.md)
