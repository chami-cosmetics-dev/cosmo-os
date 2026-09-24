# Quickstart: Register New Users

**Feature**: `061-register-new-users`  
**Date**: 2026-09-24

Validate against [spec.md](./spec.md), [data-model.md](./data-model.md), [contracts/register-new-users.md](./contracts/register-new-users.md). No full implementation here.

## Prerequisites

- Cosmo OS web, company user with `contacts.register` (and a second user with `contacts.insight.admin_view` for filter/export).
- After schema lands: `npm run db:migrate:create` (agent/dev) then deploy to the target DB the user names. Do not `db push` on vault / cosmo-dev / cosmo-prod.
- `npm test` + lint on touched files.

## 1. Workbook header today

1. Open **Register new users**. Header empty until location + date range set.
2. Set location `Kandy`, dates today → 2026-09-27. Add new phone A (name, email, birthday).
3. Expect: one Contact Master, unallocated, workbook row `created`.
4. Change header to `Galle`, today → 2026-09-30. Add new phone B.
5. Expect: A still Kandy / ends 27; B Galle / ends 30.

## 2. Already registered on the workbook

1. Enter a phone already on Contact Master. Expect alert + name, email, birthday loaded.
2. Save unchanged. Expect workbook: **already registered** (not updated). Insight search shows badge. Admin location filter does **not** list them.
3. Change email, save. Expect **already registered** + **updated**. Still off admin filter.

## 3. Header dies tomorrow

1. After a Colombo date change (or test clock), reopen the page.
2. Expect: location/dates empty. Must set again. Yesterday’s rows still in history.

## 4. QR portal

1. Set header, create QR. Open `/register/{token}` logged out.
2. Submit new name/email/phone C. Expect C on today’s workbook as `created`.
3. Submit an existing OS phone with same details. Expect workbook already registered; badge on Insight; not in admin filter.
4. Submit that phone with a new email. Expect **updated** on workbook.

## 5. Admin filter + export

1. As insight admin, open location filter. Options include Kandy and Galle.
2. Filter Kandy → only **new** creates for Kandy (A), including after 27. Not already-registered.
3. Export matches the on-screen new-only list.

## 6. Dumps

1. New OS-only C with no purchase: absent from contact dump.
2. After a purchase lands on C: present on a later dump.
3. Already dump-eligible contact only updated here: still in dump.

## 7. ERP later

1. OS-created unallocated phone X with a real email.
2. Merchant creates ERP customer same phone + merchant mailbox.
3. Expect: one Contact Master; OS email unchanged; allocated to that merchant.
4. If X was already allocated: stay allocated; still no duplicate.

## 8. Permission

1. User without `contacts.register`: no page, APIs 403.
2. That user still has no Contact Master import/export from this feature.
