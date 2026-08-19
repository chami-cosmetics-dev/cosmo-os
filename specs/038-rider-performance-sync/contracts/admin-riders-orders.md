# GET /api/admin/riders/[riderId]/orders

Rider operations payload for one rider (tasks + status summary + location payment totals).

## Auth
- `requirePermission("staff.read")`
- Rider must belong to caller’s company / be an active rider profile as today

## Path
| Param | Type |
|-------|------|
| `riderId` | cuid |

## Query (optional; may also be applied client-side if API returns full task list)
| Param | Type | Rules |
|-------|------|--------|
| `from` | `YYYY-MM-DD` | optional Colombo day start for **completed/failed** scope |
| `to` | `YYYY-MM-DD` | optional Colombo day end |

If `from`/`to` omitted, server may return all tasks for the rider (current behavior) and let the client apply FR-003 filtering—or apply FR-003 server-side when dates provided. Prefer **server-side FR-003** when dates are sent to avoid large payloads.

## Behavior (FR-003)
- **Open** (`assigned`, `accepted`, `arrived`): include regardless of `assignedAt` day
- **Completed / failed**: include only when `completedAt` / `failedAt` falls in selected Colombo range (default today)
- Location payment aggregates: from **completed** tasks in the completed date scope (and their `DeliveryPayment` lines)

## Response `200`
Existing shape plus `statusSummary` consistent with the rules above:

```json
{
  "rider": { "id": "cuid", "name": "Yohan", "email": "…", "status": "active" },
  "statusSummary": {
    "total": 30,
    "assigned": 20,
    "inProgress": 2,
    "completed": 8,
    "failed": 0
  },
  "orders": [ ],
  "locationTotals": [ ]
}
```

## Errors
- `400` invalid id/dates
- `401` / `403` / `404`
