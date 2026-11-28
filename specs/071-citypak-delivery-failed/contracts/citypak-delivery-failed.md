# Contracts: CityPak Delivery Failed Reminders

## 1. Reminder category identity

| Field | Value |
|-------|--------|
| Category | `citypak_delivery_failed` |
| Permission | `reminders.citypak_delivery_failed` |
| UI label | `City Pack Delivery Failed` |
| Reminder id pattern | `citypak_delivery_failed:{waybillId}` |

Wired through:

- `REMINDER_BUBBLE_PERMISSIONS` / labels
- `TaskReminderCategory` union
- `listVisibleTaskReminderCategories` / `canSeeTaskReminderCategory`
- Aggregate fetch in `getTaskReminders` (or equivalent)
- Bubble `CATEGORY_ORDER` + `CATEGORY_LABELS` / node labels

## 2. Reminder list item (existing task-reminders API shape)

Category appears in the existing task-reminders response used by `TaskReminderBubbles` (no new public HTTP resource required unless the route already types categories explicitly — then extend the union).

**Item fields** (same `TaskReminder` contract):

```json
{
  "id": "citypak_delivery_failed:clxxxxxxxx",
  "category": "citypak_delivery_failed",
  "title": "City Pack delivery failed",
  "body": "60021512 · D17232326 — delivery attempt failed (12h).",
  "href": "/dashboard/fulfillment/waybill-lookup?waybillId=clxxxxxxxx&orderId=clyyyyyyyy",
  "waitingHours": 12,
  "orderId": "clyyyyyyyy",
  "invoiceLabel": "60021512"
}
```

**Inclusion rules** (server):

1. Same `companyId` as session.
2. `OrderWaybill.source === "citypak_api"`.
3. `orderId` non-null.
4. `rawPayload.citypakStatus === "attempt_failed"`.
5. Merchant audience: order owned via `merchantOwnsReminderOrder` **or** (DM-only order **and** viewer has a DM coupon code).
6. Admin/company audience with permission: all company rows matching 1–4.
7. List capped; `categoryCounts.citypak_delivery_failed` = full match count.

**Exclusion**: `returned`, delivered, in-transit, unchecked, non-CityPak sources, unmatched rows.

## 3. Deep-link contract (Waybill Details)

### Query params on `/dashboard/fulfillment/waybill-lookup`

| Param | Required | Meaning |
|-------|----------|---------|
| `waybillId` | yes for this flow | `OrderWaybill.id` to open in details dialog |
| `orderId` | optional | Matched OS order id (forward-compatible; details keyed by waybill) |

`taskReminderHref` (or sibling helper) MUST support `waybillId`.

### Client behavior

1. User lands on waybill-lookup with `waybillId`.
2. If user lacks `fulfillment.waybill_lookup.read` (or current page gate), show existing access denial — do not load another merchant’s payload via a side channel.
3. If waybill exists in company scope, open **Waybill Details** dialog for that row (same UI as Pending Waybills → View).
4. If waybill missing / not attempt-failed anymore, show empty/not-found toast or closed dialog without crashing; reminder list will drop it on next refresh.

### Non-goals

- No new REST “get reminder by id” endpoint.
- No email send endpoint in this contract.

## 4. Permission grant

Roles UI lists `reminders.citypak_delivery_failed` like other reminder keys. Merchants who should monitor CityPak failures (including Sandali for DM) need the key ticked; admins follow existing reminder auto-grant behavior already used for other `reminders.*` keys.
