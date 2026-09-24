# Contracts: Register New Users

**Auth staff**: session + `contacts.register` unless noted.  
**Auth insight filter**: `contacts.insight.read` + `contacts.insight.admin_view` (existing admin filter).  
**Auth dump**: existing dump permissions.  
**Portal**: no session; valid `OsRegistrationQr.token` only.

Company-scope all staff/portal writes. Zod on every mutate. Phone lookup = existing variants.

## Permission

`contacts.register` in `DEFAULT_PERMISSIONS`. Sidebar: Register new users → `/dashboard/register-users`.

## Staff — page data

`GET /api/admin/register-users/page-data`

Query: `day` optional ISO date (default today Colombo).

**200**: `{ headerRequired: true, today: "YYYY-MM-DD", rows: CaptureRow[], historyDays: { date, count }[] }`

`CaptureRow`: `id`, `contactId`, `name`, `phone`, `email`, `location`, `badgeStart`, `badgeEnd`, `source`, `outcome` (`created` | `already_registered` | `updated`), `createdAt`.

## Staff — phone lookup

`GET /api/admin/register-users/lookup?phone=`

**200** unknown: `{ match: null }`  
**200** found: `{ match: { contactId, name, email, birthYear, birthMonth, birthDay } }`  
**400** phone too short / empty.

## Staff — save

`POST /api/admin/register-users`

Body: `{ name, phoneNumber, email?, birthYear?, birthMonth?, birthDay?, location, badgeStart, badgeEnd }`  
Dates ISO `YYYY-MM-DD`. Header must be complete.

**200** `{ outcome, contactId, row: CaptureRow }`  
**400** validation.  
**409** only if two contacts match the same phone (pick required) — v1 return matches list.

## Staff — QR

`POST /api/admin/register-users/qr`

Body: `{ location, badgeStart, badgeEnd }`

**200** `{ token, url, qrDataUrl }`  
`url` = origin + `/register/{token}`.

## Portal — load

`GET /api/register/{token}` (public)

**200** `{ locationLabel }` (optional display; do not require customer to enter location).  
**404** unknown token.

## Portal — save

`POST /api/register/{token}` (public)

Body: `{ name, email, phoneNumber }`

Same create/update/badge/capture rules as staff, stamp from QR (not client header). Birthday unchanged.

**200** `{ ok: true, outcome }` (do not leak other customers).  
**400** validation.  
**404** bad token.

## Insight admin filter

Extend existing `GET /api/admin/customer-insight/filter` and `.../filter/export` and filter-options:

- Query `osRegLocation` optional string.
- `GET filter-options` includes `osRegLocations: { value, label }[]` (distinct created locations).
- Filter AND: `osRegistrationCreated = true` AND `osRegLocation` equals selected (trim, case-insensitive compare).
- Export uses same filter. Already-registered never included.

## Insight search DTO

Contact insight payload adds:

```ts
osRegBadge: { location: string } | null
```

`null` when no stamp or today outside `[osRegBadgeStart, osRegBadgeEnd]` (Colombo). Visible to allocated and non-allocated search (spec).

## Contact dump

`lib/reports/contact-dump` list query: exclude

```text
osRegistrationCreated = true
AND lastPurchaseAt IS NULL
AND purchaseOrderCount = 0
```

All dump parts and full dump.

## ERP customer webhook

`shouldAutoAllocateErpCustomer`: allow `syncStatus` in `created` | `enriched` | `unchanged`. Other gates unchanged. `updateMany` still requires empty `assignedMerchant`.

Email: existing `emailSafeForContact` / `isSharedMerchantEmail` — do not overwrite OS email with merchant mailbox; do not fill empty OS email with merchant mailbox.

## Pages

| Path | Auth |
|------|------|
| `/dashboard/register-users` | `contacts.register` |
| `/register/[token]` | public |
| Customer Insight admin filter | existing admin view |
