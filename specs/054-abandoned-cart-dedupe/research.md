# Research: Abandoned Cart Deduplication & Abandonment Reason

**Feature**: `054-abandoned-cart-dedupe`  
**Date**: 2026-09-14

## R1 — Cart identity / fingerprint

**Decision**: Build a deterministic `cartFingerprint` string from a sorted multiset of line keys `variantOrProductId|normalizedTitle|qty`. Prefer Shopify variant GID/id when present; else product id; else normalized title (trim + lowercase collapse whitespace). Quantities are part of the key (exact-match includes qty). Persist fingerprint on each `ShopifyAbandonedCheckout` row.

**Rationale**: Spec requires exact match on product/variant + quantity. Current GraphQL sync only stores `title` + `quantity` in `lineItemsJson` — title+qty works for backfill of existing rows; enriching the GraphQL/REST ingest with variant/product ids improves future stability without blocking v1.

**Alternatives considered**:
- Title-only ignore qty — rejected (clarification Q1).
- Live recompute only, no persisted fingerprint — rejected; slows list/dedupe and complicates indexing.
- Separate line-item child table — rejected (YAGNI; JSON already stored).

## R2 — Exact-duplicate linking storage

**Decision**: Add nullable `exactDuplicateGroupId` (cuid). When two+ non-superseded rows share `companyId` + `phoneNormalized` + `cartFingerprint`, assign/reuse one group id. On follow-up save, `updateMany` all rows in that group with the same follow-up fields (status, customerResponse, remark, abandonmentReason, lastFollowUp*).

**Rationale**: Explicit group id makes PATCH propagation O(1) query and survives fingerprint recomputes. Matches FR-002.

**Alternatives considered**:
- Re-query by fingerprint on every save without group id — workable but more brittle if fingerprint rules change mid-flight.
- Join table `AbandonedCheckoutLink` — unnecessary for single group type.

## R3 — Subset supersession (soft-hide)

**Decision**: After ingest/backfill, for each phone cohort ordered by `abandonedAt` ascending, if older cart’s line multiset is a **proper subset** of a newer cart (every older line key present with qty ≤ newer qty, and newer has extra product or higher qty), set `supersededByCheckoutId` + `supersededAt` on the older row. Default list/export filter: `supersededByCheckoutId IS NULL`.

**Rationale**: Soft-hide retains follow-up history (FR-011) without a hard delete. Proper-subset (not equal) avoids hiding exact duplicates (those link instead).

**Alternatives considered**:
- Hard delete — rejected (audit / reopen risk).
- Hide equals as well — rejected; equals are exact-duplicate group.
- Replace older when newer is smaller — rejected (clarification Q3: keep both).

## R4 — Same-day siblings

**Decision**: Compute at list/read time using `APP_TIME_ZONE` (`Asia/Colombo` from `lib/format-datetime.ts`). Group visible rows by `phoneNormalized` + calendar day of `abandonedAt`. Most recent row gets `sameDaySiblingCount` and `sameDaySiblingIds` (exclude self, exclude other members of same exact-duplicate group, exclude superseded). No status sync.

**Rationale**: Spec Q4 — all rows visible; badge only on newest. No extra tables. Matches existing business timezone.

**Alternatives considered**:
- Persist sibling set ids — rejected until a performance need appears.
- Collapse siblings into one list row — rejected (spec keeps separate rows).

## R5 — Phone normalization

**Decision**: Persist `phoneNormalized` using `canonicalPhoneForErpCustomerId` from `lib/phone-lookup.ts` (Sri Lanka-aware). Rows with null/unusable phone skip linking, supersession, and same-day badges.

**Rationale**: Aligns abandoned-orders linking with contact/order phone identity already used in Cosmo. Raw `customerPhone` stays for display.

**Alternatives considered**: Digits-only without SL rules — worse match rate for 07… / 94… / +94….

## R6 — When dedupe runs

**Decision**:
1. After each successful upsert in `syncAbandonedCheckoutsForCompany` and abandoned-checkout webhook handler — run dedupe for that company scoped to affected phone(s), or full company window if cheaper for small sets.
2. One-shot `backfillAbandonedCheckoutDedupe(companyId)` callable from sync when new columns are null / migration flag, or explicit admin/cron once after deploy.

**Rationale**: Spec FR-010. Sync already owns ingest; webhook path must not leave orphans.

**Alternatives considered**: Nightly-only dedupe — leaves wrong list until night. UI-only heuristics — rejected (status sync must be server-side).

## R7 — Abandonment reason

**Decision**: New optional string column `abandonmentReason` with constants: `koko_payment_issue`, `city_not_available`, `no_need_of_products`. Zod on PATCH allows null/omit; not required for Closed. CSV + list DTO include the field. Exact-duplicate propagate includes this field.

**Rationale**: Spec US4 / FR-008–009; separate from `remark` and `customerResponse`.

**Alternatives considered**: Reuse `remark` templates — rejected (different meaning). Free-text reason — out of scope v1.

## R8 — Line item GraphQL enrichment

**Decision**: Extend abandoned checkout GraphQL `lineItems.nodes` selection with `variant { id }` and `product { id }` when the Admin API schema allows on `AbandonedCheckoutLineItem`; REST webhook path map `variant_id` / `product_id` when present. Fingerprint builder reads both shapes.

**Rationale**: Improves match quality going forward; title+qty remains fallback for historical JSON.

**Alternatives considered**: Skip enrichment — acceptable fallback-only but weaker exactness across title renames.

## R9 — Precedence exact-dupe vs same-day

**Decision**: Exact-duplicate group membership drives status propagation. Same-day badge counts only other *intents*: distinct `exactDuplicateGroupId` (or distinct fingerprint if ungrouped) that day for the phone — not every identical copy.

**Rationale**: Spec FR-012 + Assumptions (count unique sibling intents).
