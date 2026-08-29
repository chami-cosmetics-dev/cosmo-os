# Quickstart: 045-merchant-channel-sales-board

Validate GM view channel sales extension on Cosmo non-prod (`cosmo-dev` or local).

## Prerequisites

- Admin user with `hasMerchantDashboardAdminView` (GM view tab visible)
- User with `dashboard.merchant_targets.manage` for target tests
- Staff edit permission for shop-merchant flag
- Company with:
  - At least 2 merchant-role users with attributed sales
  - Cosmetics.lk `CompanyLocation`
  - At least one physical shop location (non–Cosmetics.lk)
  - Sample orders: merchant A with shop-only, merchant B with online (Cosmetics.lk), merchant C with both

## Setup

```bash
npm run env:use cosmo-dev
npm run db:migrate:create
# name migration e.g. add_merchant_channel_targets_and_shop_merchant
npm run db:generate
npm run db:deploy:cosmo-dev
npm run dev
```

After schema merge to shared branch: `npm run db:deploy:all`.

## Scenarios

### 1. GM view regression (no override)

1. Open `/dashboard/merchant` as admin → **GM view** tab.
2. Confirm existing sections still render:
   - Team pulse (today, MTD, calls, on-target, alerts count)
   - Alerts list (if any merchants flagged)
   - Merchant scorecard (health, calls, pace)
   - MTD bar chart + merchant cards
   - Assign monthly target card
3. Row click → switches to **Merchant view** for that merchant.

**Pass**: Nothing removed; channel columns are additive on scorecard.

### 2. Channel columns + footer

1. GM view, MTD period.
2. Scorecard shows per merchant: shop count/amount, online count/amount, total.
3. Footer shows company shop total, online total, grand total.
4. Manually sum merchant shop amounts → equals footer shop amount.
5. Grand total amount = `gmPulse` team MTD sales.

**Pass**: Footer reconciles; shop + online = grand total.

### 3. Today and custom range

1. Switch date range to Today (or set `fromDate`/`toDate` to today).
2. Channel actuals update; footer label reflects period.
3. Set custom From–To (7 days) → channel actuals and footer update; GM alerts still load.

**Pass**: Period changes channel numbers without errors.

### 4. Legacy target only

1. Merchant with only `targetAmount` (no channel targets).
2. Scorecard total % matches pre-feature behavior.
3. Shop/online target columns show —.

**Pass**: SC-003 no regression.

### 5. Channel targets

1. GM view → select merchant → assign Shop target 400,000 + Online target 600,000 + save.
2. Reload GM view → shop % and online % show independently; total target 1,000,000.
3. Target history row includes channel amounts.
4. Open that merchant’s **Merchant view** → combined target progress still sensible.

**Pass**: One form; audit trail; personal dashboard not broken.

### 6. Shop merchant on staff

1. Staff → edit merchant user → enable **Shop merchant** without outlet → save blocked.
2. Select outlet (e.g. DTD) → save succeeds.
3. GM scorecard shows shop-merchant badge + DTD for that user.
4. Book note access for that outlet unchanged (spec 029 smoke).

**Pass**: Validation + display.

### 7. Personal dashboard chips (P3)

1. Merchant with shop + online MTD opens personal dashboard.
2. Optional Shop MTD / Online MTD chips visible near Today/MTD.
3. Peer board and target card unchanged.

**Pass**: Additive only.

## Automated checks

```bash
npm test -- lib/merchant-dashboard/channel-sales
npm test -- lib/merchant-dashboard/gm-score
npm run lint
```

## Expected outcomes

- No new sidebar route required
- `GET /api/admin/merchant-dashboard/page-data` shape backward-compatible for non-admin merchants (no channel fields)
- Constitution I: migration deployed to all DBs before prod merge

## References

- [spec.md](spec.md)
- [data-model.md](data-model.md)
- [contracts/merchant-dashboard-channel-sales.md](contracts/merchant-dashboard-channel-sales.md)
- [research.md](research.md)
