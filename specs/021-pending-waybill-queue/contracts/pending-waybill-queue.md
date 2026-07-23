# Contract: Pending Waybill Queue

**Feature**: `021-pending-waybill-queue`  
**Date**: 2026-07-23

## UI contract

**Surface**: `/dashboard/fulfillment/waybill-lookup` — `WaybillLookupFulfillmentPage`

**Permissions**: Existing `fulfillment.waybill_lookup.read` / `.import` (no new keys).

**Layout (top → bottom)**:

1. **Waybill File Upload** (import permission only) — existing file picker + summary cards.
2. **Upload History** — table of past imports (newest first).
3. **Pending Waybills** — working queue (default list).
4. **Search** — existing invoice/waybill search (includes delivery-complete rows).

### Upload history columns

| Column | Source |
|--------|--------|
| File name | `fileName` |
| Uploaded at | `createdAt` |
| Uploaded by | user name/email |
| Total / Imported / Invalid / Unmatched | counts |
| Status | `status` |

### Pending waybills columns (minimum)

| Column | Notes |
|--------|-------|
| Waybill no | |
| Invoice / reference | |
| Courier | when present |
| Match status | Matched / Unmatched |
| OS order | Primary fulfillment display id when matched; empty when unmatched |
| Upload | file name and/or upload time |
| Actions | Open details |

### Pending row details

Reuse search details dialog pattern: non-empty `rawPayload` fields + OS order summary when matched (including whether delivery is complete — should be false for pending rows) + clear “no OS order match” when unmatched.

### Behaviors

- After successful import: refresh pending list + upload history (page-data refetch); toast import summary.
- Optional control: **Re-check matches** (calls rematch) if not solely automatic on page-data load.
- Empty pending state: clear message that there are no pending waybills.
- Pagination on pending list.

---

## Admin API

### `GET /api/admin/waybills/page-data`

**Auth**: `requireAnyPermission(["fulfillment.waybill_lookup.read", "fulfillment.waybill_lookup.import"])`

**Query**:

| Param | Type | Notes |
|-------|------|-------|
| page | number | Default 1 |
| limit | number | Default 50; max bounded |
| rematch | `"1"` \| omit | If set, rematch capped unmatched batch before listing |

**Behavior**:

1. Resolve `companyId`.
2. Optionally rematch unmatched waybills (capped).
3. Return pending waybills (see data-model pending rule), upload history (e.g. last 20–50), pagination for pending, `canImport`.

**Response 200**:

```json
{
  "pending": [
    {
      "id": "clxxx",
      "waybillNo": "CPK123",
      "invoiceNumber": "12345",
      "courierName": "Citypak",
      "matchStatus": "matched",
      "order": {
        "id": "clord",
        "displayId": "#12345",
        "deliveryCompleteAt": null
      },
      "uploadFileName": "citypak-22jul.xlsx",
      "uploadedAt": "2026-07-22T10:00:00.000Z",
      "rawPayload": { "Your Reference": "12345", "Citypak Tracking": "CPK123" },
      "source": "xlsx_upload"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 120 },
  "uploads": [
    {
      "id": "clup",
      "fileName": "citypak-22jul.xlsx",
      "fileType": "xlsx",
      "totalRows": 100,
      "importedRows": 98,
      "invalidRows": 2,
      "unmatchedRows": 5,
      "status": "completed",
      "createdAt": "2026-07-22T10:00:00.000Z",
      "uploadedBy": { "id": "clusr", "name": "Alex", "email": "alex@example.com" }
    }
  ],
  "rematch": { "attempted": 5, "matched": 2 },
  "canImport": true
}
```

**Errors**: 401/403 as existing RBAC; 400 on invalid pagination.

---

### `POST /api/admin/waybills/import` (behavior delta)

**Auth**: `fulfillment.waybill_lookup.import` (unchanged)

**Must**:

- Continue creating a new `WaybillUpload` per file (history).
- **Not** delete prior `OrderWaybill` rows for the company.
- Resolve `orderId` per valid row via shared invoice-ref matcher before save.
- Upsert on `(companyId, waybillNo)` with latest courier fields + `uploadId`.
- Set `unmatchedRows` to count of imported rows that still have no order after resolve.
- Return summary including `unmatched` (or rely on existing fields + `unmatchedRows`).

**Response 200** (compatible extension):

```json
{
  "message": "Waybill import completed.",
  "summary": {
    "totalRows": 100,
    "imported": 98,
    "invalidRows": 2,
    "unmatchedRows": 5
  },
  "latest": []
}
```

---

### `GET|POST /api/admin/waybills/search` (unchanged contract)

Must continue to return waybills for delivery-complete orders when searched by invoice/waybill (FR-011).

---

### `POST /api/admin/waybills/rematch` (optional)

**Auth**: same as page-data read

**Body** (Zod): empty object or `{ "limit": number }` with max cap.

**Response 200**:

```json
{
  "attempted": 100,
  "matched": 12
}
```

---

## Auth matrix

| Action | Permission |
|--------|------------|
| View pending + history + search | `fulfillment.waybill_lookup.read` **or** `.import` |
| Upload file | `fulfillment.waybill_lookup.import` |
| Rematch | read or import (same as page-data) |

Unauthorized → 401/403; no client-only gating.
