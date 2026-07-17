# Quickstart: Copy Review Contacts for Follow-up

**Feature**: `007-copy-review-contacts`  
**Date**: 2026-07-15

Validation after implementation. See [contracts/copy-review-contacts.md](./contracts/copy-review-contacts.md) and [data-model.md](./data-model.md).

## Prerequisites

- Feature branch implemented (panel button + `POST .../mark-follow-up` + eligibility helper)
- Env: `npm run env:use cosmo-dev` (or local) — **no migration** required
- User with `merchant_reviews.manage` (and a read-only user with only `.read` for negative check)
- Merchant Reviews page with a merchant filter that yields several **Pending** orders with phones (plus ideally one without phone, one already Reviewed if available)

## 1. Unit tests

```bash
npx vitest run lib/merchant-review-copy-contacts.test.ts
npm test
```

**Expected**: Clipboard text one-per-line; pending+phone eligible; missing phone / reviewed / no_response skipped; count helpers match contract fields.

## 2. Happy path — copy + Follow up

1. Open `/dashboard/contacts/reviews`.
2. Select merchant / dates so Assigned Review Queue shows multiple Pending orders with phones.
3. Click **Copy all contact numbers**.
4. Paste into a text editor.

**Expected**:
- Toast shows copied / updated / skipped counts.
- Clipboard has one phone per eligible order (same count as “copied”).
- Queue badges for those Pending orders switch to **Follow Up** without full page reload.
- Refresh page: statuses remain Follow up.

## 3. Continue calling workflow

1. With status filter **Follow Up** (or All), open one marked order.
2. Complete Review Capture Form → **Reviewed** (or No Response) + remarks → Save.

**Expected**: That order updates as today; siblings remain Follow up.

## 4. Empty / no-phone cases

1. Filter so queue is empty → run Copy all.

**Expected**: Message that there is nothing to copy; no toast success for status updates; no API-driven status changes.

2. Filter to orders that all lack phone (or mix).

**Expected**: Only rows with phones copied/updated; toast reports skipped missing numbers; no status change for phoneless rows.

## 5. Terminal status protection

1. Include at least one **Reviewed** order in a wide filter (All statuses) that also has Pending.
2. Run Copy all.

**Expected**: Reviewed order not set to Follow up; its phone not on the clipboard.

## 6. Clipboard failure gate (manual)

1. If browser blocks clipboard (or temporarily deny permission), trigger Copy all.

**Expected**: Error toast; Pending orders remain Pending.

## 7. Permission gate

1. As read-only (`merchant_reviews.read` only), open Merchant Reviews.

**Expected**: Copy-all control not available (hidden/disabled); cannot call bulk API successfully (403).

## 8. Scale smoke (optional)

1. Merchant filter with ~50–300 Pending rows with phones.
2. Copy all once.

**Expected**: Completes in well under 15s; counts match updated badges; no browser hang from per-order PUTs.
