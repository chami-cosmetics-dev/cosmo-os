# Quickstart: Contact Email Cleanup & Insight Display

**Feature**: `040-contact-email-cleanup`  
**Date**: 2026-08-12

## Prerequisites

- Cosmo OS dashboard running against a non-prod company DB with contact seed data.
- User with `contacts.manage` or `contacts.master.manage`.
- Insight access for a contact with email and one without.

No migration deploy required for this feature.

## Setup (dev)

```bash
npm run env:use cosmo-dev   # or local target
npm run db:generate
npm run dev
```

Optional seed (via UI or SQL/admin):

1. Contact A — valid personal email.
2. Contact B — malformed primary email (e.g. `not-an-email`) **or** valid primary + malformed secondary alias.
3. Contact C — `cosmetics@example.com` or `user@cosmatics.example` (optionally paired with valid personal email to test selective clear).
4. Contact D — no email.

## Validation scenarios

### 1. Cosmetics list + clear

1. Open `/dashboard/contacts/email-cleanup` (or Contacts → Email cleanup).
2. Select reason **Cosmetics pattern**.
3. Confirm Contact C appears with `matchedEmail` showing the cosmetics address.
4. Select Contact C → **Remove email** → confirm dialog.
5. Expect success toast; re-list → cosmetics match gone; if contact had valid personal email, insight still shows that address.
6. Open contact / insight → `-` only when no email remains; contact still exists.

### 2. Invalid format list + clear

1. Switch to **Invalid format**.
2. Confirm Contact B listed (primary or secondary failure); Contact A not listed for format alone.
3. Clear Contact B; verify only invalid address removed; if valid secondary remains, it becomes primary; audit entry `contact_email_cleared`.

### 3. Insight display

1. Open Customer Insight for Contact A → email row visible with Mail icon + address.
2. Open Contact D (or cleared B/C) → email row still visible with `-`.
3. Confirm phone / other fields unchanged.

### 4. AuthZ

1. User without contacts manage permissions → API 403; page gated like other Contacts tools.

### 5. Cancel path

1. Multi-select → open confirm → cancel → no emails changed.

## Automated checks

```bash
npm test -- email-cleanup
# or targeted unit file once added, e.g.:
# npm test -- lib/contacts/email-cleanup
```

Cover pure helpers: format invalid detection, cosmetics substring match, clear-promote secondary logic (unit).

## Expected outcomes

- Bad / cosmetics emails removable in batches without deleting contacts; unrelated valid emails on same contact are kept.
- Insight always shows email field (icon + address or `-`).
- Audit trail lists who cleared which email and when.
