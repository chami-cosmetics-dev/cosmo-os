# GET /api/admin/settings/page-data (extension)

## Change
Include rider payday in the existing aggregated settings page-data payload so the Settings UI can render without an extra fetch.

## Auth
Unchanged (`settings.company` / existing page-data gate).

## Added field (example)
```json
{
  "riderPayday": {
    "paydayDayOfMonth": 25
  }
}
```
`paydayDayOfMonth` may be `null` when unset.

## Notes
- PUT still goes to `/api/admin/settings/rider-payday` (or a nested settings mutation if the page already batches — prefer dedicated PUT for clarity).
- Keep page-data read-only aggregation pattern (one auth, parallel queries).
