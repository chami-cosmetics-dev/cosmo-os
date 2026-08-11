# GET|POST /api/admin/settings/rider-delivery-charges

Upload / inspect shipping-rule **rider delivery charges** (Excel).

## Auth
- `requirePermission("settings.company")`

## GET
Returns `{ count, sample[] }` as today.

## POST multipart
| Field | Type |
|-------|------|
| `file` | `.xlsx` / `.xls`, max 8MB |

### Sheet columns (row 1)
- Shipping Rule Label (required)
- District (optional)
- Shipping Account (optional)
- Cost Center (optional)
- Shipping Amount (required for imported rows)
- Delivery Charges for riders (required for imported rows; **blank → skip row**)

### Behavior (changed)
1. Parse all data rows
2. **Skip** rows with blank/invalid rider charge (do not upsert 0; count as `skippedBlank`)
3. Skip/invalid shipping amount → warning, skip
4. **Upsert** by `labelKey` (update existing, insert new)
5. **Do not** `deleteMany` missing labels
6. Return import stats

## Response `200`
```json
{
  "imported": 736,
  "updated": 700,
  "created": 36,
  "skippedBlank": 2487,
  "warnings": ["Row 224 (Bopitiya - Ratnapura): skipped blank rider charge"]
}
```
(`updated`/`created` optional if implementation only returns `imported` + `skippedBlank`; prefer explicit counts.)

## Errors
- `400` no valid rows / bad file
- `401` / `403`
