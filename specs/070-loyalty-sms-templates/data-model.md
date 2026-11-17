# Data Model: Loyalty SMS Templates

## SmsTemplate (new)

Company-scoped reusable SMS body (EmailTemplate analogue for SMS).

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | PK |
| `companyId` | string | FK → Company, cascade delete |
| `key` | string | Unique per company; `^[a-z][a-z0-9_]{1,63}$` |
| `name` | string | Display name (≤120) |
| `purpose` | enum/string | `gold_wish` \| `platinum_wish` \| `custom` |
| `body` | string | Plain text; `{{placeholders}}` (≤1000 recommended; hard max e.g. 1600) |
| `active` | boolean | Default `true`; inactive excluded from random pool |
| `createdAt` / `updatedAt` | datetime | |

**Constraints**: `@@unique([companyId, key])`; index `(companyId, purpose, active)` for pool queries.

**Builtin keys** (catalog; may exist without a DB row until first save):

| key | purpose | Discount in seed copy |
|-----|---------|------------------------|
| `loyalty_gold_wish_1` | `gold_wish` | 10% |
| `loyalty_gold_wish_2` | `gold_wish` | 10% |
| `loyalty_platinum_wish_1` | `platinum_wish` | 15% |
| `loyalty_platinum_wish_2` | `platinum_wish` | 15% |

Custom templates: any valid key, `purpose` chosen by editor (`gold_wish` / `platinum_wish` / `custom`). Only `gold_wish` / `platinum_wish` enter automated loyalty pools. `custom` is for future manual/other use (no auto-send in v1).

**Validation**:
- Empty `body` → reject save (or force `active=false` and exclude from pool).
- Builtin keys: name/body/active editable; key + purpose locked.
- Custom keys: deletable; builtins are not.

## LoyaltySmsConfig (new)

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | PK |
| `companyId` | string | Unique FK → Company |
| `officeContactPhone` | string | Office number for `{{officePhone}}`; empty allowed |
| `createdAt` / `updatedAt` | datetime | |

## LoyaltyWishSend (new)

Tracks wish attempts for dedupe and ops.

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | PK |
| `companyId` | string | FK → Company |
| `contactId` | string | FK → ContactMaster |
| `tier` | string | `gold` \| `platinum` |
| `templateKey` | string \| null | Selected template key |
| `phoneNumber` | string \| null | Destination used |
| `messageBody` | string \| null | Rendered body (optional truncate for storage) |
| `status` | string | `success` \| `skipped_no_phone` \| `skipped_no_template` \| `skipped_already_sent` \| `failed` \| `skipped_incomplete_contact` |
| `errorMessage` | string \| null | Provider / resolve error |
| `smsLogId` | string \| null | Optional link if useful |
| `sentAt` | datetime | Default now |
| `createdAt` | datetime | |

**Constraints**: Partial uniqueness for successful wishes — enforce “one success per contact+tier” in application (check existing `status=success` before send) **or** `@@unique([companyId, contactId, tier])` only storing the latest attempt and treating prior success as skip. Prefer **unique `(companyId, contactId, tier)`** with upsert of latest attempt, and skip send when existing row has `status=success`.

## ContactMaster (existing — read)

| Field | Use |
|-------|-----|
| `phoneNumber` | Customer SMS destination |
| `name` / known-name fields as available | `{{customerName}}` |
| `assignedMerchant` | Resolve merchant User |
| `loyaltyAssignedTier` | Before/after for upgrade vs retry |

No new ContactMaster columns required if `LoyaltyWishSend` owns dedupe.

## User (existing — read)

| Field | Use |
|-------|-----|
| `knownName` / `name` / `email` / `couponCodes` | Match `assignedMerchant` |
| `mobile` | `{{merchantPhone}}` (Staff Management Mobile) |

## SmsLog / SmsPortalConfig (existing)

Unchanged. `sendSms` continues to write `SmsLog`. Portal must be configured for live sends.

## Company (existing)

Add relations: `smsTemplates`, `loyaltySmsConfig`, `loyaltyWishSends`.

## Placeholders

| Token | Source |
|-------|--------|
| `{{customerName}}` | Contact name (fallback “Customer”) |
| `{{tier}}` | `Gold` / `Platinum` |
| `{{discountPercent}}` | `10` / `15` |
| `{{merchantName}}` | Resolved merchant display name or empty |
| `{{merchantPhone}}` | `User.mobile` or empty |
| `{{officePhone}}` | `LoyaltySmsConfig.officeContactPhone` or empty |

Missing optional values → replace with empty string (templates should read naturally when staff write fallbacks in copy).

## State transitions

```text
loyalty assign/override succeeds with new tier
  → if LoyaltyWishSend success exists for (contact, tier): skip (skipped_already_sent)
  → else pick random active template for purpose
  → if none: record skipped_no_template
  → if no phone: record skipped_no_phone
  → else render → sendSms → success | failed row
```

Gold→Platinum: new Platinum wish; Gold success row remains.

## Permission

Reuse `settings.sms_portal` for template + office config CRUD and page visibility.
