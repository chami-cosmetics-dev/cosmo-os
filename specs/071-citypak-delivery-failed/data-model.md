# Data Model: CityPak Delivery Failed Reminders

No new Prisma models. This feature is a **derived reminder view** over existing waybill + order data.

## Entities (logical)

### OrderWaybill (existing)

| Field | Role for this feature |
|-------|------------------------|
| `id` | Reminder identity + deep-link `waybillId` |
| `companyId` | Tenant scope |
| `orderId` | Must be non-null (matched) to appear |
| `invoiceNumber` | Display / body |
| `waybillNo` | Display / body |
| `source` | Must be `citypak_api` |
| `rawPayload.citypakStatus` | Must equal `attempt_failed` |
| `rawPayload.citypakStatusLabel` | Optional display |
| `rawPayload.citypakStatusCheckedAt` | Waiting clock preferred |
| `rawPayload.citypakStatusCheckpoints` | Shown in Waybill Details only |
| `uploadedAt` / `updatedAt` | Fallback waiting clock |
| `courierName` | Informational (CityPak) |

**Eligibility rule**: `source = citypak_api` AND `orderId IS NOT NULL` AND `rawPayload.citypakStatus = attempt_failed`.

### Order (existing, via `orderId`)

| Field | Role |
|-------|------|
| `id` | Optional `orderId` on reminder / links |
| `name` / `orderNumber` / `shopifyOrderId` | Invoice label |
| `discountCodes` / `rawPayload` / `sourceName` | Merchant coupon extraction |
| `assignedMerchantId` | Ownership fallback when no MER tracking code |

### User (merchant audience)

| Field | Role |
|-------|------|
| `id` | Merchant user |
| `couponCodes` / `wholesaleCouponCodes` | Personal MER ownership + DM-controller detection (`isDmCouponCode`) |

## Ownership rules

1. **Unmatched waybill** → not in reminders.
2. **Personal MER / tracking codes** on order → merchant whose saved codes match (`merchantOwnsReminderOrder`).
3. **DM-only tracking** (`isDmOnlyMerchantTracking`) → visible to users who hold any DM coupon code (Sandali / MER115 family).
4. **Admin company audience** with category permission → all eligible company waybills (not merchant-filtered).

## Reminder item (ephemeral DTO)

| Field | Value |
|-------|--------|
| `id` | `citypak_delivery_failed:{waybillId}` |
| `category` | `citypak_delivery_failed` |
| `title` | e.g. `City Pack delivery failed` |
| `body` | Invoice + waybill no + waiting hours |
| `href` | `/dashboard/fulfillment/waybill-lookup?waybillId={waybillId}` (+ `orderId` optional) |
| `waitingHours` | From checked-at / fallback timestamps |
| `orderId` | Matched order id when present |
| `invoiceLabel` | Order invoice label |

## State transitions (membership)

```text
[not in list]
    → status sync/push/manual refresh sets citypakStatus = attempt_failed
      AND matched orderId → appear on next reminder fetch

[in list]
    → citypakStatus becomes delivered | returned | other non-attempt_failed
      → leave list on next reminder fetch

[in list]
    → order unmatched (orderId cleared) → leave list
```

No dismiss table; membership is purely status-derived (FR-008).

## Permissions

| Key | Purpose |
|-----|---------|
| `reminders.citypak_delivery_failed` | See category in reminder bubble HUD |

Waybill Details open still requires existing fulfillment waybill-lookup access on the target page.

## Out of scope persistence

- No email outbox / send log for this tab
- No “acknowledged failed delivery” flag
