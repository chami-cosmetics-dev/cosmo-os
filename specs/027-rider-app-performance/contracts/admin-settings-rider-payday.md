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
- `paydayDayOfMonth`: integer 1–28, or `null` to clear configuration
- Reject 29–31 (month-length safety)

### Behavior
- Upsert singleton `RiderPayPeriodConfig` (`singletonKey = "default"`)
- Optional: set `updatedById` from current user
- Does not vary by caller’s `companyId`

### Response `200`
Same shape as GET after save.

## Errors
- `400` validation (out of range, wrong type)
- `401` / `403` auth
