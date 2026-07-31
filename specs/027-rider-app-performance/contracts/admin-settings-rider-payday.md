# GET|PUT /api/admin/settings/rider-payday

Company-agnostic rider payday day-of-month (one value for all companies in this database).

## Auth
- `requirePermission("settings.company")`

## GET
### Response `200`
```json
{
  "paydayDayOfMonth": 25
}
```
or
```json
{
  "paydayDayOfMonth": null
}
```

## PUT
### Body
```json
{
  "paydayDayOfMonth": 25
}
```
- `paydayDayOfMonth`: integer 1–31, or `null` to clear configuration
- Reject outside 1–31
- Months shorter than D use that month’s last day when computing pay windows

### Behavior
- Upsert singleton `RiderPayPeriodConfig` (`singletonKey = "default"`)
- Optional: set `updatedById` from current user
- Does not vary by caller’s `companyId`

### Response `200`
Same shape as GET after save.

## Errors
- `400` validation (out of range, wrong type)
- `401` / `403` auth
