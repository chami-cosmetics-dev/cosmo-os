# Research: Customer Insight Allocation & Loyalty

**Feature**: `033-insight-allocation-loyalty`  
**Date**: 2026-08-07

## R1 — Loyalty thresholds (75k / 200k inclusive Platinum)

**Decision**: Update `lib/customer-insight/loyalty-tier.ts`:
- `LOYALTY_GOLD_MIN = 75_000`
- `LOYALTY_PLATINUM_MIN = 200_000` (rename from “above”; classify platinum when `total >= 200_000`)
- Gold: `>= 75_000 && < 200_000`
- Push to Gold filter: same Gold band; Push to Platinum: `>= 200_000`

**Rationale**: Matches clarified spec FR-005 / FR-007. Current code uses 100k and *strictly above* 250k — must change and update unit tests.

**Alternatives considered**: Keep 250k “above” semantics — rejected (spec inclusive at 200k).

## R2 — Allocated merchant identity matching

**Decision**: Treat `ContactMaster.assignedMerchant` as the **display label** string already used by Contact Allocation (`knownName ?? name ?? email`). Owner check: viewer’s candidate labels `{knownName, name, email}` (non-empty) include case-insensitive trim equality with `assignedMerchant`. Admins/super_admins bypass via role/permission short-circuit already used elsewhere.

**Rationale**: Allocation UI stores labels, not User IDs. Order `assignedMerchantId` is a User FK — do not store IDs on ContactMaster without a migration + backfill.

**Alternatives considered**: Migrate `assignedMerchant` to `assignedMerchantUserId` — deferred (large data migration; Principle V).

## R3 — Visibility DTO (owner vs limited)

**Decision**: Single GET insight endpoint returns a `visibility: "owner" | "limited"` flag. Limited payload omits: profile PII beyond what’s needed for allocated-merchant label, progress bar, topItems, series, invoice `lineItems`, contacted/lastContacted, edit affordances. Limited invoices = headers only. Server strips fields — never rely on UI alone.

**Rationale**: Spec clarifications; defense in depth.

**Alternatives considered**: Separate endpoints — rejected (more surface area).

## R4 — Brand for filter

**Decision**: Brand = `ProductItem.vendor.name` (Shopify vendor → Vendor) for Cosmo order lines. For Adapt JSON lines, use item brand/vendor fields if present in stored JSON; otherwise exclude from brand match. Filter: allocated contacts who have ≥1 loyalty-eligible line with matching brand (case-insensitive). Optionally also allow DashboardBrandConfig-style title contains as fallback — **v1 prefer Vendor.name only** for predictability.

**Rationale**: No ProductItem.brand column; OSF already treats vendor name as brand. Dashboard brand configs match titles — weaker for “real brand”.

**Alternatives considered**: New brand column + backfill — deferred until Vendor coverage proves insufficient.

## R5 — Auto-allocate on purchase

**Decision**: When order is assigned a merchant user and the matched ContactMaster has empty `assignedMerchant`, set `assignedMerchant` to `getMerchantDisplayName(user)` (knownName || name || email). Never overwrite non-empty assignment. Hook near existing contact sync / order-assignment completion (same places that set `recentMerchant`).

**Rationale**: Spec FR-011; align label with allocation UI so ownership checks work.

**Alternatives considered**: Always copy `recentMerchant` (name/email only) — rejected (breaks knownName matching used by allocation assignees).

## R6 — Manual + bulk transfer permissions

**Decision**: Reuse `contacts.allocation.manage` for single assign and bulk “move all from merchant A label → merchant B label”. Provide/extend UI path under Contact Allocation or a Customer Insight admin subsection gated by that permission. Admins already pass all checks.

**Rationale**: Allocation API already supports `individual` | `multiple` | `bulk` modes writing `assignedMerchant`.

**Alternatives considered**: New `contacts.insight.allocate` — redundant.

## R7 — Mark contacted + dashboard

**Decision**: `POST /api/admin/customer-insight/[contactId]/contacted` requiring `contacts.insight.read` **and** owner (or admin). Implementation: write audit `contact_follow_up_contacted` (same as follow-up route) **and** insert `ContactAllocationUpdate` with `category: "Contacted"` (or `"contacted"`) so Call Center Performance chart gains a series without new tables. Last contacted = latest audit or latest ContactAllocationUpdate of that category for the contact. Allow repeat marks.

**Rationale**: Spec wants dashboard update; performance chart aggregates ContactAllocationUpdate by category. Follow-up alone only hits audit/queue.

**Alternatives considered**: Only audit — weaker for call-center chart empty state; only ContactAllocationUpdate — loses follow-up queue consistency.

## R8 — Profile edit

**Decision**: `PATCH /api/admin/customer-insight/[contactId]` with Zod for name, email, phone, birthYear/Month/Day. Owner or admin only. Reuse contact identifier helpers for phone/email secondary tables as needed (minimal: primary fields on ContactMaster).

**Rationale**: Spec FR-004; keep under insight permission + ownership, not Contact Master manage.

## R9 — Allocated filter list performance

**Decision**: `GET /api/admin/customer-insight/filter` with query: loyalty | pushGold | pushPlatinum | birthMonthCurrent | brand | minTotal | maxTotal | page | pageSize. Scope: `assignedMerchant` in viewer labels (or all for admin). Compute lifetime totals for candidates — start with SQL filter on assignedMerchant + birthMonth, then compute totals in batches / subquery; sort by total desc; paginate. Cap pageSize ≤ 50.

**Rationale**: Spec requires highest totals first; full scan of all contacts is unacceptable — allocation scope reduces set.

**Alternatives considered**: Materialized lifetime total column — deferred until slow in production.
