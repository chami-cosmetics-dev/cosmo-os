# Quickstart: CityPak Delivery Failed Reminders

Validation guide after implementation. See [contracts/citypak-delivery-failed.md](./contracts/citypak-delivery-failed.md) and [data-model.md](./data-model.md).

## Prerequisites

- Cosmo OS desk access with Roles UI
- At least two merchant users (A, B) with distinct MER coupon codes
- Sandali (or test user) with DM coupon codes (MER115 / DM-General family) + `reminders.citypak_delivery_failed`
- Merchant A/B also granted `reminders.citypak_delivery_failed` for scoped tests
- `fulfillment.waybill_lookup.read` for click-through
- Matched CityPak waybills with stored status (Pending Waybills → refresh status as needed)

## Automated checks

```bash
npm test -- lib/task-reminders.test.ts lib/task-reminder-access.test.ts lib/task-reminder-links.test.ts
npm run lint
```

Expect new/updated cases for: eligibility (`attempt_failed` only), merchant isolation, DM-only → DM-coupon holder, href `waybillId`, permission visibility.

## Manual UAT

### 1. Merchant A sees own failure only

1. Ensure waybill for merchant A order has CityPak status **Delivery attempt failed** / NOT DELIVERED.
2. Log in as merchant A → open reminder bubble → **City Pack Delivery Failed**.
3. Confirm invoice/waybill listed; count ≥ 1.
4. Log in as merchant B → same tab → that row absent.

### 2. Non-failed statuses stay out

1. For a CityPak waybill In transit / Out for delivery / Delivered / Returned, confirm it does **not** appear in the tab after reminder refresh.

### 3. DM General → Sandali

1. Matched CityPak waybill on a **DM-only** order (DM_General / MER115 tracking, no personal MER), status attempt failed.
2. Log in as Sandali (DM coupon holder) → row present.
3. Log in as merchant without DM coupons → row absent from their merchant list.

### 4. Click opens Waybill Details

1. From the tab, click the reminder.
2. Land on `/dashboard/fulfillment/waybill-lookup?waybillId=…`.
3. **Waybill Details** opens for that waybill (invoice, CityPak timeline, attempt-failed badge).
4. Close; click another row → correct second waybill.

### 5. Status clear removes reminder

1. Refresh CityPak status until Delivered (or Returned).
2. Reload reminders → item gone; badge count down.

### 6. Permission gate

1. Remove `reminders.citypak_delivery_failed` from a merchant role.
2. Confirm tab/category hidden and count does not leak via HUD.

### 7. Email (negative)

1. Confirm no send-email control on this tab in v1.

## Expected outcomes

| Scenario | Pass |
|----------|------|
| SC-001 ownership visibility | Merchant / Sandali see their failures |
| SC-002 isolation | No cross-MER leaks |
| SC-003 navigation | Details open for correct waybill |
| SC-004 status clear | Leaves list on refresh |
| SC-005 DM | Sandali finds DM failures without Pending Waybills search |
