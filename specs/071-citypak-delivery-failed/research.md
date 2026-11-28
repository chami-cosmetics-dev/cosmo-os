# Research: CityPak Delivery Failed Reminders

## 1. Eligibility status

**Decision**: Include only `OrderWaybill` rows where `source = citypak_api` and stored `rawPayload.citypakStatus === "attempt_failed"` (CityPak “NOT DELIVERED” / failed attempt). Exclude `delivered`, `returned`, `in_transit`, `out_for_delivery`, `booked`, `unknown`, and unchecked (null status).

**Rationale**: Spec and existing `classifyCitypakScan` / `citypakStatusLabel` already normalize NOT DELIVERED → `attempt_failed`. Returned is a separate ops path. Reminder must not invent live API calls — use last stamp from status sync / push / manual refresh.

**Alternatives considered**:
- Include `returned` in the same tab — rejected (spec edge case).
- Live CityPak track on every reminder poll — rejected (latency, rate limits, constitution simplicity).

## 2. Data source / no migration

**Decision**: Query existing `OrderWaybill` + linked `Order`. Filter with Prisma JSON path on `rawPayload.citypakStatus` equals `attempt_failed`, require non-null `orderId` (matched). No new models, columns, or migrations.

**Rationale**: Status already stamped by `lib/citypak-waybill-status.ts`. Constitution I satisfied with zero migrate/deploy-all for this feature.

**Alternatives considered**:
- Denormalized `citypakStatus` column + index — faster at scale but extra migration; defer until proven slow.
- Separate reminder persistence table — overkill; list is derived state.

## 3. Reminder category + permission

**Decision**: New category key `citypak_delivery_failed`; RBAC key `reminders.citypak_delivery_failed`; UI label **City Pack Delivery Failed**. Register in `REMINDER_BUBBLE_PERMISSIONS`, `TaskReminderCategory`, `task-reminder-access` lists, and bubble `CATEGORY_ORDER` / labels. Cap list with existing `REMINDER_LIMIT_PER_CATEGORY`; badge uses full count.

**Rationale**: Matches every other reminder bubble category. Explicit tick in Roles UI (admins/super_admin auto-pattern already spreads reminder keys).

**Alternatives considered**:
- Reuse `delivery_pending` — wrong semantics (OS delivery-complete vs CityPak attempt failed).
- Special-case access like `shop_to_main` — unnecessary; standard reminder permission fits FR-007.

## 4. Merchant scoping

**Decision**: For merchant-audience users, reuse `merchantOwnsReminderOrder` / coupon + `assignedMerchantId` fallback (same as `merchant_dispatch_pending` / payment approvals). Unmatched waybills (`orderId` null) never appear.

**Rationale**: Spec FR-003; existing helpers already encode MER-wins ownership.

**Alternatives considered**:
- Scope only by `assignedMerchantId` — misses MER-coded orders without assignment.
- Show all company failures to every merchant — fails isolation (SC-002).

## 5. DM General → Sandali

**Decision**: Treat **DM-only** orders (`isDmOnlyMerchantTracking` on order coupons) as owned for this category by any company user whose `couponCodes` / `wholesaleCouponCodes` include a **DM coupon** (`isDmCouponCode` — MER115 / DM-General family). Operationally Sandali holds those codes; do **not** hardcode user id or display name.

**Rationale**: Spec names Sandali as DM General controller; codebase already keys DM via MER115/DM-General coupons. Coupon-based ownership survives staff rename/id changes and matches sales/dashboard DM bucketing.

**Alternatives considered**:
- Hardcode Sandali user id/email — brittle, fails if account rebuilt.
- Company setting “DM controller userId” — flexible but extra schema/UI; defer unless multi-controller needed.
- Put DM failures only in admin bubble — fails FR-004.

## 6. Admin / company-wide audience

**Decision**: Users with admin (or non-merchant-scoped) reminder audience who hold `reminders.citypak_delivery_failed` see **company-wide** matched attempt-failed CityPak waybills (same spirit as `delivery_pending`). Merchant-only audience stays merchant-scoped (+ DM rule above).

**Rationale**: Spec edge case for company/admin; mirrors existing `shouldScopeSampleRemindersToMerchant` / audience patterns.

**Alternatives considered**: Admins always merchant-empty — worse for ops oversight.

## 7. Multiple waybills per order

**Decision**: Emit one reminder per **attempt_failed** matched CityPak waybill (id `citypak_delivery_failed:{waybillId}`). Click targets that waybill. If several failed for one order, multiple list rows (still under cap). Prefer no silent merge.

**Rationale**: Spec says open the not-delivered waybill; latest-only merge would hide parallel failures.

**Alternatives considered**: One row per order picking latest failed — simpler UI but hides secondary waybills.

## 8. Deep-link to Waybill Details

**Decision**: Extend `taskReminderHref` / reminder links with `waybillId` (and keep `orderId` optional for consistency). Href: `/dashboard/fulfillment/waybill-lookup?waybillId={id}`. On mount, waybill-lookup loads that waybill into the existing details dialog (`selectedDetails`) if the user can access the page; otherwise existing fulfillment permission denial applies.

**Rationale**: Spec FR-006; details UI already is a dialog on that page (`setSelectedDetails`). No dedicated details route today.

**Alternatives considered**:
- Navigate to order fulfillment only — misses CityPak timeline surface.
- New standalone details page — unnecessary duplication.

## 9. Waiting / overdue clock

**Decision**: `waitingHours` from `rawPayload.citypakStatusCheckedAt` when parseable; else `OrderWaybill.updatedAt` / `uploadedAt`. Overdue uses existing `TASK_REMINDER_SLA_MS` like other categories.

**Rationale**: No “first failed at” field; last check time is what Pending Waybills already shows.

**Alternatives considered**: Parse checkpoint timestamps for first NOT DELIVERED — nicer but fragile; defer.

## 10. Email

**Decision**: Out of scope (FR-009). No Maileroo/Hutch hooks in this feature.

**Rationale**: Spec defers send-email explicitly.

## 11. Agent context script

**Decision**: Skip. Repo has no `.specify/scripts/**/update-agent-context*` (same as 041–067). Plan + research + data-model + contracts are the context.
