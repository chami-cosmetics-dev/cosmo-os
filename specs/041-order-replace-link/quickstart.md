# Quickstart: 041-order-replace-link

Validate cancel→replace link end-to-end on **Cosmo** non-prod (`cosmo-dev` or local with Cosmo branding).

## Prerequisites
- Cosmo deployment (`NEXT_PUBLIC_APP_NAME` includes Cosmo, not Vault)
- User with `orders.read` + `orders.cancel`
- Migration applied: `replacedByOrderId` present (`npm run db:generate` after migrate)
- One **cancelled** Cosmo order (Shopify-originated OK) — call it **A**
- One **existing** ERP-originated (or any) Cosmo order to act as replacement — call it **B** (know its visible order number / SI `name`)

## Setup
```bash
npm run env:use cosmo-dev   # or local Cosmo env
npm run db:generate
# after migration created/applied for this feature:
# npm run db:deploy:cosmo-dev
```

## Scenarios

### 1. Set link on cancelled order
1. Open order **A** detail (orders panel / invoice modal).
2. Confirm cancel UI has **no** replacement field.
3. On cancelled detail, enter **B**’s order number → save.
4. Expect: A shows replaced-by **B**; open **B** and see A listed as superseded (read-only).

### 2. Search both ways
1. Dashboard quick-search (or orders list search) for **A**’s number → see link/metadata for **B** (and/or **B** in results).
2. Search for **B** → see **A** as cancelled predecessor.
3. Unrelated order search → no replace badges.

### 3. Validation failures
1. Non-cancelled order → no editable field; API PATCH → 400.
2. Unknown number → 400, no persist.
3. A’s own number → 400.
4. Clear field on A → reverse display on B gone; search unpaired.

### 4. Vault gate (if Vault env available)
1. Same PATCH on Vault deployment → 403; UI field absent.

## Expected outcomes
- Link stored only on cancelled order FK (`replacedByOrderId`)
- No new Shopify/ERP documents created by this feature
- `npm test` + lint/typecheck clean for touched files before PR

## References
- [data-model.md](data-model.md)
- [contracts/admin-orders-replaced-by.md](contracts/admin-orders-replaced-by.md)
- [contracts/admin-orders-detail-replace-link.md](contracts/admin-orders-detail-replace-link.md)
- [contracts/admin-orders-search-replace-link.md](contracts/admin-orders-search-replace-link.md)
