# Research: Loyalty SMS Templates

## 1. Template storage pattern

**Decision**: Company-scoped `SmsTemplate` rows + in-code builtin catalog, merged on read like `EmailTemplate` / `lib/email-templates/catalog.ts`.

**Rationale**: Email Templates already prove merge-of-builtins + DB overrides, custom keys, and settings CRUD. Ops can edit without deploys; four seeds ship in catalog.

**Alternatives considered**:
- Only `SmsNotificationConfig`-style fixed triggers — cannot add arbitrary future templates or multiple Gold variants.
- Hardcoded birthday-style arrays only — no edit/save UI (fails FR-007/008).

## 2. UI placement

**Decision**: New settings page `/dashboard/settings/sms-templates` modeled on Email Templates (list + editor + preview). Keep existing `/dashboard/settings/sms-notifications` for order-stage SMS unchanged.

**Rationale**: Spec asks for Email Templates parity; order SMS configs are trigger-bound and not a multi-template catalog. Sidebar already has SMS Notifications; add SMS Templates beside Email Templates under General Settings.

**Alternatives considered**:
- Fold into SMS Notifications form — crowded UX, wrong mental model.
- Reuse Email Templates page with a mode switch — mixes channels; harder permissions/copy.

## 3. Permission

**Decision**: Gate with existing `settings.sms_portal` (same as SMS Notifications / SMS Portal).

**Rationale**: Spec wants “same class” as email/SMS settings; avoids a new permission for v1 (constitution simplicity). Admins already hold `settings.sms_portal`.

**Alternatives considered**:
- New `settings.sms_templates` mirroring `settings.email_templates` — cleaner long-term, extra RBAC seed work; defer unless ops ask to split.
- Reuse `settings.email_templates` — wrong domain.

## 4. Send trigger points

**Decision**: After a **new** Gold/Platinum tier write succeeds in:
- `loyalty-assign/route.ts` (eligible / upgrade path, when `!isRetrySameTier`)
- `loyalty-override/route.ts` (manual override when tier actually changes)

Fire wish send asynchronously relative to response: await send helper but **never** fail the HTTP loyalty response on SMS errors (catch + log).

**Rationale**: Spec covers potential-customer and other upgrade paths; both routes set `loyaltyAssignedTier`. Retry-same-tier must not re-wish (FR-010). Gold→Platinum still wishes Platinum (FR-011).

**Alternatives considered**:
- Only merchant-dashboard potential flow — misses Insight assign/override.
- Prisma middleware on `ContactMaster` — too broad, hard to test, violates simplicity.

## 5. SMS delivery

**Decision**: `sendSms(companyId, phone, message, sentById?)` from `lib/hutch-sms.ts`; rely on existing `SmsLog` success/failure rows.

**Rationale**: Birthday wish, daily sales, order SMS already use Hutch; portal credentials stay on `SmsPortalConfig`.

**Alternatives considered**: New provider — out of scope.

## 6. Merchant phone resolution

**Decision**: Resolve `ContactMaster.assignedMerchant` (string label/MER) to a company `User` via existing ownership match helpers (`matchesMerchantAllocation` / merchant match keys), then read `User.mobile` and display name via `getMerchantDisplayName`.

**Rationale**: Staff Management “Mobile” is `User.mobile` (birthday wish already uses it for the sending merchant). Allocation is string-based, not a User FK.

**Alternatives considered**:
- Always use the assigning user’s mobile — wrong when admin assigns for another merchant’s book.
- Require new `assignedMerchantUserId` FK — larger schema change than needed for v1.

## 7. Office contact number

**Decision**: `LoyaltySmsConfig` per company with `officeContactPhone` string; editable from SMS Templates settings (or small sibling control on that page).

**Rationale**: Company has no phone field today; a tiny config model matches DailySalesSmsConfig pattern and FR-015.

**Alternatives considered**:
- Hardcode office number — fails editable requirement.
- Stuff into `SmsPortalConfig` — mixes provider credentials with marketing copy settings.

## 8. Random template selection

**Decision**: Uniform `Math.floor(Math.random() * pool.length)` over active templates whose `purpose` is `gold_wish` or `platinum_wish` for the target tier (same idea as `BIRTHDAY_GREETINGS` random pick).

**Rationale**: Spec explicitly rejects “same for all”; no anti-repeat requirement in v1.

**Alternatives considered**: Round-robin / avoid last — extra state, not requested.

## 9. Dedupe / wish history

**Decision**: `LoyaltyWishSend` unique on `(companyId, contactId, tier)`; insert after successful provider accept (or mark failed attempts for ops). Skip send if successful row already exists for that tier.

**Rationale**: FR-010 must survive SmsLog retention and message-text edits; string markers in SmsLog (birthday pattern) are brittle for loyalty tiers.

**Alternatives considered**: SmsLog message contains `[LOYALTYWISH:gold]` — fragile; no structured miss reasons.

## 10. Placeholder syntax

**Decision**: `{{customerName}}`, `{{tier}}`, `{{discountPercent}}`, `{{merchantName}}`, `{{merchantPhone}}`, `{{officePhone}}` — Email Templates style.

**Rationale**: SMS Templates UI mirrors Email Templates; order SMS `{orderNumber}` stays on that feature only.

## 11. Discount values

**Decision**: Defaults Gold `10`, Platinum `15` when rendering `{{discountPercent}}`; seeded bodies also state the percent in plain text.

**Rationale**: Spec fixed rates; editors may still hardcode text.

## 12. Scope: Cosmo only

**Decision**: Feature ships for Cosmo OS settings and Cosmo loyalty routes; no Vault dual-write of templates.

**Rationale**: Spec assumption; shared Prisma migration still applies to all three DBs so schema stays aligned.
