# Data Model: Register New Users

**Feature**: `061-register-new-users`  
**Date**: 2026-09-24

## ContactMaster (extend)

| Field | Type | Notes |
|-------|------|--------|
| `osRegistrationCreated` | `Boolean` `@default(false)` | `true` only when this feature **created** the row. Admin location filter + dump hold. |
| `osRegLocation` | `String?` | Current badge label (typed location). |
| `osRegBadgeStart` | `DateTime?` | Inclusive badge start (store Colombo date at UTC midnight). |
| `osRegBadgeEnd` | `DateTime?` | Inclusive badge end. |

**Indexes**: `[companyId, osRegistrationCreated, osRegLocation]`.

**Rules**:
- New save: `osRegistrationCreated = true`, `assignedMerchant` empty, badge fields = current header/QR.
- Already-registered save: do **not** flip `osRegistrationCreated` to true; overwrite badge fields with this save’s location/dates.
- Insight badge visible iff today (Colombo) is inclusive between start and end.
- Dump omit iff `osRegistrationCreated` and no purchase (`lastPurchaseAt` null and `purchaseOrderCount = 0`).

## OsRegistrationQr

Staff-created portal token. Immutable stamp.

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | |
| `companyId` | String | |
| `token` | String `@unique` | Unguessable (cuid or 32-byte hex). |
| `location` | String | Typed location at create. |
| `badgeStart` | DateTime | |
| `badgeEnd` | DateTime | |
| `createdByUserId` | String | Staff. |
| `createdAt` | DateTime | |

Relations: `Company`, `User`. Index `[companyId, createdAt]`.

**Validation**: location trimmed 1–`LIMITS.locationName`; `badgeEnd` ≥ `badgeStart`.

## OsRegistrationCapture

Workbook history row. One per successful save.

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | |
| `companyId` | String | |
| `contactId` | String | |
| `qrId` | String? | Set when source is portal. |
| `location` | String | Stamp at save. |
| `badgeStart` | DateTime | |
| `badgeEnd` | DateTime | |
| `captureDate` | DateTime | Colombo calendar day of save. |
| `source` | String | `staff` \| `portal` |
| `outcome` | String | `created` \| `already_registered` \| `updated` |
| `actorUserId` | String? | Staff user; null on portal. |
| `createdAt` | DateTime | |

Relations: `Company`, `ContactMaster`, `OsRegistrationQr?`, `User?`.  
Indexes: `[companyId, captureDate]`, `[companyId, contactId]`.

**Outcome**:
- `created` — new Contact Master row.
- `already_registered` — existing row, name/email/birthday unchanged (after normalize).
- `updated` — existing row, at least one of name/email/birthday changed.

Workbook today = `captureDate = today`. History = other `captureDate`s. Do not delete on allocate.

## Permission

| Key | Description |
|-----|-------------|
| `contacts.register` | Open Register new users workbook; save; create QR. Not Contact Master directory. |

Seed via `DEFAULT_PERMISSIONS` in `lib/rbac.ts`. No auto-assign to merchant templates.

## State

```text
Header (client, today only)
  empty → (set location + dates) → ready
  ready → (change location/dates same day) → ready (next save uses new stamp)
  midnight Colombo → empty (history rows stay)

Contact
  unknown phone + save → created + unallocated + badge + capture(created)
  known phone + save same fields → badge refresh + capture(already_registered)
  known phone + save changed fields → profile + badge + capture(updated)

Badge
  today in [start, end] → show location on Insight search
  else → hide badge (fields remain)

Admin location filter
  osRegistrationCreated && osRegLocation match → include
  else → exclude

Dump
  osRegistrationCreated && no purchase → omit
  else → existing dump rules
```

## Validation (shared)

- Phone: trim, `LIMITS.mobile`, match via existing variants.
- Email: `emailSchema` optional on staff; required on portal (spec lists mail). Empty staff email → null; do not clear existing on portal if customer omits? Portal requires email.
- Birthday: staff only; year/month/day existing CM fields.
- Location: trimmed, max location name limit.
- Name: required, `LIMITS.name`.
