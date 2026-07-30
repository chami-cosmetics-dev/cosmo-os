# Quickstart: 027-rider-app-performance

## Prerequisites
- DB migrated (`npm run db:generate` then `npm run db:deploy:<target>` / `db:deploy:all` after migration exists)
- Ops user with `settings.company`
- Rider user with mobile login on at least one tenant
- Sample deliveries: completable + fail-able orders with known `totalShipping`

## 1. Unit tests (period + incentive)
```bash
npm test -- lib/rider-pay-period lib/rider-incentive
```
**Expect:** Pay windows for D=25 cross month correctly; voided orders excluded from incentive; shipping null → 0.

## 2. Configure payday (admin)
1. Open Cosmo OS → Settings (company settings).
2. Set **Rider payday** day-of-month (e.g. `25`), save.
3. Confirm GET `/api/admin/settings/rider-payday` returns `{ "paydayDayOfMonth": 25 }`.

**Expect:** One value for the whole database (not per company). Repeat on Vault deployment if riders use that tenant.

## 3. Mobile — My performance tab
1. Log in as rider; open new **Performance** (or Pay) tab.
2. With payday set, confirm current period dates = last D → day before next D.
3. Complete 2 deliveries (shipping 200 and 350); fail 1 delivery.
4. Refresh performance: completed 2, failed 1, incentive `550.00`; lines show 200 and 350.
5. Switch to **Previous** period: totals for previous window only.

**Expect:** No other rider’s data; empty state when zero activity.

## 4. Home cue + Completed lines
1. On Route (deliveries) tab, see today’s completed count + today’s incentive cue.
2. Tap cue → Performance tab (current period).
3. On Done (completed) list, each completed row shows that delivery’s incentive.

## 5. Unconfigured payday
1. Clear payday (PUT `null`).
2. Open Performance tab.

**Expect:** Clear message that payday must be configured; no invented pay month. Today cue may still show today’s numbers.

## 6. Align with ops dashboard
1. Note rider’s current period `from`/`to`.
2. Open `/dashboard/riders/performance` with the same date range for that rider.

**Expect:** Completed count and incentive match mobile for the same eligible completions (failures appear only on mobile personal summary).

## 7. Gates before PR
```bash
npm test
npm run mobile:typecheck
```
