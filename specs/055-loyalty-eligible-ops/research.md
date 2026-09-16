# Research: Loyalty Eligible Ops & Call Queue Enhancements

**Feature**: `055-loyalty-eligible-ops`  
**Date**: 2026-09-16

## R1 — Pending vs MTD updated vs newly eligible

**Decision**:
- **Pending (open)**: Same rule as merchant Loyalty eligible cards — allocated contact with `pendingLoyaltySuggestion(...)` and outreach status in open queue set (`null`/`eligible`/`contacted`/`responded`/`not_responded` for upgrades as today in `fetchMerchantLoyaltyOutreach`).
- **Updated (worked)**: Contact counted once per merchant when `loyaltyOutreachUpdatedAt` falls in the Colombo window **and** status at event time advanced into worked states (`contacted` | `responded` | `not_responded` | `assigned`) **or** `loyaltyAssignedAt` falls in the window.
- **Newly eligible**: Contact counted once when first marked `eligible` in the window — use new nullable `loyaltyEligibleAt` set once on first transition to eligible (also set `loyaltyOutreachUpdatedAt`).

**Rationale**: Today only `loyaltyOutreachStatus` + `loyaltyAssignedAt` exist; status flips do not stamp a date, so MTD/week “updated” and “newly eligible” cannot be audited. `ContactMaster.updatedAt` is too noisy (profile edits).

**Alternatives considered**:
- Derive from audit logs only — incomplete coverage, heavier queries.
- Use call-center `ContactAllocationUpdate` — wrong domain (allocation updates ≠ loyalty outreach).

## R2 — Schema migration

**Decision**: Add to `ContactMaster`:
- `loyaltyOutreachUpdatedAt DateTime?`
- `loyaltyEligibleAt DateTime?`

Set both in existing write paths (`merchant-dashboard/loyalty-outreach`, loyalty assign / respond flows, auto-mark eligible in `fetchMerchantLoyaltyOutreach`). Backfill not required for v1 (historical MTD may undercount until data accumulates); document in quickstart.

**Rationale**: Constitution I — one migration via `db:migrate:create` / `db:deploy:all`.

**Alternatives considered**: Separate event table — more accurate history, overkill for count showdown (Principle V).

## R3 — Merchant Dashboard count

**Decision**: Extend `fetchMerchantLoyaltyOutreach` (or sibling) to return `{ items, totalCount }` where `items` remain capped (`take`) for the card grid and `totalCount` is the full pending eligible count. UI shows **count** prominently on the Loyalty eligible card header (e.g. badge / title suffix). Keep existing cards.

**Rationale**: Spec asks for visible count; current UI uses `loyaltyOutreach.length` which undercounts when `take: 25`.

**Alternatives considered**: Drop card list and show count only — rejected; user said count is required, cards may remain.

## R4 — Admin company list + merchant-wise table

**Decision**: New module `lib/customer-insight/loyalty-eligible-summary.ts` + APIs:
- `GET .../loyalty-eligible/summary` → company totals + per-merchant `{ pending, mtdUpdated, mtdNewlyEligible }` (week fields optional for UI; required for email builder).
- `GET .../loyalty-eligible/list` → paginated company-wide pending eligible contacts (admin Insight).

Reuse `listMerchantRoleUsers` / allocation labels like monitoring (046) and merchant dashboard cohort helpers. Auth: Insight admin view (`hasInsightAdminView`).

**Rationale**: Spec US1 + US3; keep separate from 046 monitoring PDF (out of scope).

**Alternatives considered**: Fold into allocation-summary — different metrics and eligibility definition; keep focused module.

## R5 — Weekly email recipients + schedule

**Decision**:
- Recipients: import `CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS` (Asitha, chami@, careers@, Teshani, Chamodi) — single source of truth.
- Cron: `GET /api/cron/loyalty-eligible-weekly-email` with `CRON_SECRET`, schedule **`30 3 * * 1`** UTC (Monday ~09:00 Asia/Colombo), aligned with call-center daily cron minute.
- Week window: previous 7 Colombo calendar days ending **Sunday** before the Monday send (or ending “yesterday” if send Monday — document as Sun-ending week in quickstart).
- MTD: 1st of current Colombo month through end of yesterday (or through Sunday of week).
- HTML via Maileroo multi-to (same pattern as `sendCallCenterWeeklyReportEmail` / ERP failure).
- Preview: admin POST or GET with `?preview=1` / script mirror of `scripts/send-call-center-weekly-email.ts`.

**Rationale**: Spec confirmed admin-only + careers@; reuse list avoids drift.

**Alternatives considered**: Per-merchant mails — rejected by product. Configurable settings UI — defer; hardcode shared constant matches call-center.

## R6 — Assign panel: assigned date + not contacted

**Decision**: When `assignedFrom` / `assignedTo` and/or `notContacted=true` are set on candidates / eligible-ids:
- Switch source to **`ContactInsightCallQueue`** rows for `merchantLabel` with `assignedAt` in range (inclusive Colombo).
- `notContacted=true` → only rows with no post-assign contact (reuse report’s first-contact logic) / effectively pending-or-never-contacted assignments.
- Still apply push / loyalty / last-purchase / brand filters on the underlying contacts.
- When those queue filters are **absent**, keep today’s allocated-candidate load (hide windows unchanged).

**Rationale**: Spec US5–US6 target assigned-but-never-contacted follow-up; `allocatedFrom` already covers allocation date — do not overload it.

**Alternatives considered**: Only add filters on sales report — insufficient; user asked on Assign merchant call queue. New separate page — unnecessary.

## R7 — Multi-brand on call queue

**Decision**: Replace single `brand` query param with repeated `brand` / `brands` list (Zod preprocess like Insight filter `brands[]`). Match = union of `findContactsByPurchasedBrandRanked` ID sets (OR). UI: multi-select like main Insight brand filter.

**Rationale**: Insight filter already implements multi-brand OR in `filters.ts`; call-queue still single string — align them.

**Alternatives considered**: AND across brands — rejected by spec (any selected brand).

## R8 — Sales report Assigned date + export

**Decision**:
- API already returns `rows[].assignedAt` — UI today only renders `byMerchant` summary. Add **detail table** with Assigned date column (and key sales columns) **or** ensure export is the primary deliverable plus a compact detail view.
- New `GET .../call-queue/report/export` → Excel (`xlsx`) one row per assignment; include assigned date, merchant, contact, status, lifetime at assign, sales after assign/contact.
- Optional `notContacted` on report query for parity.

**Rationale**: Spec US8; avoid inventing a second report.

**Alternatives considered**: CSV only — reject; assignment export already Excel.

## R9 — Agent context script

**Decision**: No `.specify` agent-context updater found in repo; skip Phase 1 agent-context script. Plan + research + contracts are source of truth.

**Alternatives considered**: Hand-edit CLAUDE.md — out of scope for this command.
