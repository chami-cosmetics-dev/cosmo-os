# Quickstart: Loyalty SMS Templates

Validation guide after implementation. Details: [data-model.md](./data-model.md), [contracts/loyalty-sms-templates.md](./contracts/loyalty-sms-templates.md).

## Prerequisites

- Cosmo OS env with Hutch `SmsPortalConfig` for the test company (or accept logged failures).
- User with `settings.sms_portal` and ability to loyalty-assign / override on Customer Insight.
- Staff user for an allocated merchant with **Mobile** set (Staff Management).
- Contact with phone, `assignedMerchant` matching that staff, not yet Gold/Platinum (or Gold for Platinum upgrade test).
- Migration applied on your target: `npm run db:generate` then `npm run db:deploy:<target>` (create with `npm run db:migrate:create` during impl).

## 1. Seeded templates visible

1. Open `/dashboard/settings/sms-templates`.
2. Confirm four builtins: two Gold wish, two Platinum wish.
3. Open one; preview shows sample `{{…}}` values.

**Expect**: List + editor + preview; no order-stage SMS triggers on this page.

## 2. Edit, save, office number

1. Edit Gold wish body (keep `{{discountPercent}}` or literal `10%`).
2. Save; reload — text persists (`saved: true`).
3. Set office contact phone; save; reload — value persists.

**Expect**: Under 2 minutes for edit→confirm (SC-004).

## 3. Add custom Gold variant

1. **+ New** → key `loyalty_gold_wish_3`, purpose `gold_wish`, body with placeholders, active on.
2. Save; appears in list.

**Expect**: Eligible for Gold random pool (SC-005).

## 4. Gold wish send

1. Assign eligible (or override) contact → **Gold**.
2. Check Hutch delivery / `SmsLog` / `LoyaltyWishSend`: one success, Gold/10%, merchant name + mobile + office when configured.
3. Re-run assign/retry same Gold → **no** second success wish.

**Expect**: SC-001 / FR-010.

## 5. Platinum upgrade

1. Same contact → **Platinum**.
2. New Platinum wish sent; Gold wish not re-sent.

**Expect**: FR-011; 15% in body (SC-003).

## 6. Random pool

1. Ensure two active Gold templates.
2. Run ~20 Gold assigns on distinct contacts (or unit-test select helper with fixed RNG mock + multi-run).
3. Confirm both template keys appear at least once (SC-002).

## 7. Miss paths (loyalty still OK)

| Setup | Expect |
|-------|--------|
| Contact phone empty | Assign OK; `skipped_no_phone` |
| No active Gold templates | Assign OK; `skipped_no_template` |
| Merchant mobile empty | SMS may still send; merchant phone blank; assign OK |
| Hutch down | Assign OK; `failed` wish + SmsLog failure |

## 8. Permission

User without `settings.sms_portal`: settings page/API → 403 / redirect.  
Loyalty assign permission alone does **not** grant template edit.

## 9. Automated checks

```bash
npm test -- lib/sms-templates
npm run lint
```

Cover: catalog merge, placeholder render, pool filter by purpose/active, skip-if-already-success, merchant match → mobile.

## Done when

- [ ] SC-001–SC-007 spot-checked or covered by tests above  
- [ ] Constitution: migration via `db:migrate:create`; no prod deploy without user OK  
- [ ] Order SMS Notifications page unchanged  
