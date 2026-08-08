# Contract: OSF Supplier Orders — Zip Clear & Priority Cascade

**Feature**: `034-osf-zip-clear-cascade`  
**Extends**: `031-osf-supplier-orders` contracts  
**Base path**: `/api/admin/osf/supplier-orders`  
**Auth**: Unchanged — same permission class as existing supplier-orders routes.

---

## GET `/page-data` (enhanced)

Bootstrap filters; brands may be scoped by priority.

### Query

| Param | Required | Description |
|-------|----------|-------------|
| priority | no | Exact ERP priority string; omit/empty = all brands (current behavior) |

Validate with Zod (`trimmedString` max 80, optional). Invalid → `400`.

### Response `200`

```json
{
  "brands": [{ "id": "cuid", "name": "Vendor Name" }],
  "priorities": ["…"],
  "companyId": "cuid",
  "userId": "cuid"
}
```

**Semantics**:
- No / empty `priority`: `brands` = all company vendors (ordered by name), same as today.
- Non-empty `priority`: `brands` = vendors that have ≥1 non-archived ProductItem with non-null SKU matching `erp1ProductPriority` **or** `erp2ProductPriority` equal to that priority (same OR rule as `/items`).
- `priorities`, `companyId`, `userId` unchanged.

### Errors

- `400` invalid query
- `401` / `403` / `404` unchanged

---

## GET `/items` (unchanged contract)

Already accepts `priority` + `vendorId`. Must continue to return only items matching both when set. No response shape change for this feature.

---

## POST `/generate` (unchanged server contract)

Server still returns zip bytes on success. **Client UX contract** (panel):

| Outcome | Working table | localStorage draft |
|---------|---------------|--------------------|
| HTTP OK + blob received | Cleared (`rows = []`) | `clearDraft(companyId, userId)` |
| Validation fail / HTTP error / throw | Unchanged | Unchanged |
| Manual Clear table | Cleared | Cleared |

Generate request/response body unchanged from 031.

---

## UI behavior contract

1. On **priority** change: refetch `page-data?priority=…` (or without param for All); replace brand options; if current brand id missing from new list, set brand to All.
2. On **priority** or **brand** change: if item search is open, refetch `/items` with new filters (existing). Working table is **not** cleared by filter changes.
3. After successful generate download path: clear table + draft (see table above).
