# Contract: SKU Supplier Compare API

**Feature**: `014-sku-supplier-compare`  
**Date**: 2026-07-21

## Auth

| Permission | Capability |
|------------|------------|
| `purchasing.tools.read` | View supplier compare list (with margin calculator) |
| `purchasing.tools.manage` | Same read access |

No new permission keys in v1.

Margin calculator `latestCost` remains on `GET /api/admin/purchasing/sku-pricing` (unchanged).

---

## `GET /api/admin/purchasing/sku-pricing/suppliers`

**Auth**: `purchasing.tools.read`

**Query**

| Param | Required | Description |
|-------|----------|-------------|
| `sku` | yes | Exact ERP item code / catalog SKU (trimmed, max `LIMITS.sku`) |

**Response 200**

```json
{
  "sku": "CAN07_1",
  "suppliers": [
    {
      "supplierKey": "acme distributors",
      "displayName": "Acme Distributors",
      "bestEverRate": 75.0,
      "bestEverDate": "2025-11-12",
      "lastRate": 90.0,
      "lastDate": "2026-07-06",
      "lastQty": 12,
      "optionRank": 1,
      "optionLabel": "Best Option 1",
      "recently": true,
      "lastPurchasedFrom": true
    },
    {
      "supplierKey": "beta trading",
      "displayName": "Beta Trading",
      "bestEverRate": 80.0,
      "bestEverDate": "2026-01-20",
      "lastRate": 80.0,
      "lastDate": "2026-03-15",
      "lastQty": 6,
      "optionRank": 2,
      "optionLabel": "Option 2",
      "recently": false,
      "lastPurchasedFrom": false
    }
  ],
  "erpAvailable": true
}
```

**Ordering**: `suppliers` array pre-sorted by `optionRank` ascending.

**Empty history**: `{ "sku": "…", "suppliers": [], "erpAvailable": true }`

**ERP failure**: `{ "sku": "…", "suppliers": [], "erpAvailable": false, "error": "…" }` with **503** or **200** + `erpAvailable: false` (implementation: prefer 200 with flag so UI can show inline error without breaking calculator — match sku-pricing ERP soft-fail pattern).

**Errors**

| Status | When |
|--------|------|
| 401 | Not authenticated |
| 403 | Missing `purchasing.tools.read` |
| 400 | Missing/invalid `sku` |
| 404 | No company on user |

**Server rules**

- Allowlisted suppliers only when company has Supplier rows configured
- Never invent `bestEverRate`, `lastRate`, or dates
- `recently` = `lastDate` within 30 calendar days of server date (inclusive)
- Exactly one `lastPurchasedFrom: true` when multiple suppliers and at least one dated last purchase (newest wins; tie → first in stable sort)

---

## UI contract (purchasing calculator)

When user selects a SKU from search:

1. Existing flow: load item from search results → show global `latestCost`, margin fields
2. **New**: `GET …/suppliers?sku=` → render supplier table/cards
3. Row click **does not** mutate margin calculator cost (FR-012)
4. Badges: `optionLabel`, `Recently` (if `recently`), `Last purchased from` (if `lastPurchasedFrom`)
5. Columns: supplier name, best-ever price + date, last price + date, badges

Loading: skeleton or spinner in supplier section only.  
Error: “Supplier history unavailable” when `erpAvailable: false`.  
Empty: “No purchase history for this SKU.”

---

## Unchanged endpoints

- `GET /api/admin/purchasing/sku-pricing?q=` — search only; **no** `suppliers` array added
