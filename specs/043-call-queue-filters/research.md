# Research: Merchant Call Queue Filters, Assign, Export & Sales Report

**Feature**: `043-call-queue-filters`  
**Date**: 2026-08-24

## R1 — Push Gold / Platinum bands vs live `isPushToGold`

**Decision**: Add **call-queue-only** inclusive helpers; do **not** change `isPushToGold` / `isPushToPlatinum` used elsewhere.

| Filter | Inclusive band |
|--------|----------------|
| Push to Gold | ≥ 75,000 and ≤ 100,000 |
| Push to Platinum | ≥ 200,000 and ≤ 250,000 |
| Both on | Union of the two bands |

UI labels stay **Push to Gold** / **Push to Platinum** with **no** money text.

**Rationale**: Spec closed bands include 100,000 and 250,000. Live `isPushToGold` is ≥75k and **&lt;** 100k; `isPushToPlatinum` is ≥200k and **&lt;** 250k. Changing those would shift insight/loyalty-adjacent helpers. Call-queue assign is a new targeting window.

**Alternatives considered**: Reuse `isPushToGold` as-is — rejected (excludes 100k / 250k). Change global push helpers — rejected (scope leak).

---

## R2 — Loyalty filter on assign load

**Decision**: Loyalty dropdown uses **live** `classifyLoyaltyTierKey` (Gold ≥ 100,000, Platinum ≥ 250,000). Extra option **not yet assigned** = `loyaltyAssignedTier` is null. Do **not** use 033/spec-parenthetical 75k/200k for this filter.

**Rationale**: 039 research already kept production 100k/250k. Assign-panel loyalty filter must match insight cards, not push bands.

**Alternatives considered**: Filter by 75k/200k computed tiers — rejected (conflicts with live badges).

---

## R3 — Assignment history vs `@@unique([companyId, contactId])`

**Decision**: **Drop** unique `(companyId, contactId)` on `ContactInsightCallQueue`. Allow many rows per contact (history). At most **one `pending`** row per contact (enforced in `assignCallQueue`, not a fragile Prisma partial unique unless a raw unique index is added). Re-assign after hide window **inserts** a new pending row; completed rows stay.

Add `lifetimeTotalAtAssign` (snapshot at assign time) for the sales report.

**Rationale**: Spec requires Excel/report to keep old assign rows after Not Responding + 1-week re-assign. Current upsert recycles the only row and destroys history.

**Alternatives considered**: Separate history table — rejected (Principle V; one table with many rows is enough). Keep unique and overwrite — rejected (fails export/history).

---

## R4 — Assign-hide windows

**Decision**: Pure helper `isHiddenFromCallQueueAssign(...)` with unit tests. Inputs: now, allocationAt, currentCategory, lastNonAllocationUpdateAt, lastNonAllocationCategory, hasPendingQueue.

Omit from candidate load if **any**:

1. Current `ContactMaster.category` is **Black List** or **Wrong Number** (permanent).
2. Latest **allocation** event (`ContactAllocationUpdate.category = "allocation"`) is newer than **2 calendar months**.
3. A **pending** queue row exists (already queued).
4. Latest non-allocation category is **Not Responding** and that event is **&lt; 7 calendar days** (eligible again start of day +7; same as spec assumption).
5. Latest non-allocation category is anything else (including **Not Interested**, Interested, Busy) and that event is newer than **2 calendar months**.

Loyalty `not_responded` does **not** drive (4).

**Rationale**: Matches clarify session. Allocation timestamp already exists as allocation-category updates.

**Alternatives considered**: Hide using queue `completedAt` only — rejected (allocation hide is independent of assign). Key 1-week off loyalty outreach — rejected (clarify A).

---

## R5 — Candidate query performance

**Decision**: Keep ranking **oldest / never contacted first**. Pipeline on server:

1. Merchant allocated contacts (existing alias where).
2. SQL: `lastPurchaseAt` range when set.
3. Brand: intersect IDs from existing `findContactsByPurchasedBrandRanked`.
4. Load hide inputs (allocation max, last category update, pending set, `category`, `loyaltyAssignedTier`) in batched queries.
5. Apply hide + loyalty filter in memory.
6. Lifetime totals via existing `lifetimeTotalsByContactId` in chunks on the **remaining** ID set, then apply push-band filter (OR if both chips on, AND with other filters).
7. Sort, paginate (`page` / `pageSize` ≤ 50 default).

**Select count N / Select all eligible IDs**: same ranked eligible list; return `contactIds` for first N (or all eligible, capped). Do **not** send the full list to the client for N-select.

**Assign cap**: keep `CALL_QUEUE_ASSIGN_CAP` (200). UI batches remaining IDs and shows assigned vs remaining — no silent drop.

**Rationale**: Today `listCallQueueCandidates` already loads all allocated contacts for a merchant then slices. Filters + hide reduce work before lifetime batch. Chunked totals avoid one giant query.

**Alternatives considered**: Client-side filter after load-all — rejected (wrong for N-across-pages and hide rules). Raise assign cap to thousands — rejected (timeouts; batch instead).

---

## R6 — Excel export

**Decision**: New GET (or POST) under call-queue, `xlsx` via existing `xlsx` package (same pattern as `app/api/admin/merchant-reviews/export/route.ts`). Default: **all merchants**, **all history rows**. Optional `assignedMerchant` scope. Columns: merchant, name, phone, assigned at, current queue status (`pending` / `completed`), current call-center category, last status time, assigner if available.

**Rationale**: Spec is Excel + full history + current status. Library already in the app.

**Alternatives considered**: CSV-only — rejected. Date-range export — out of scope this feature.

---

## R7 — Sales-impact report

**Decision**: New admin JSON (and same Insight card) listing each **history** queue row:

- Snapshot `lifetimeTotalAtAssign`
- **Sales after assignment** = qualifying lifetime increment with purchase date **&gt; assignedAt** (reuse placed-order / Adapt rules from `lifetime-total`)
- **Sales after contact** = same, cutover = **first** non-allocation `ContactAllocationUpdate.createdAt` **after** `assignedAt` (null if none)

Merchant summary: counts + summed after-assign / after-contact. Optional filters: merchant, assigned date, status, push band (computed from snapshot or current total — use **snapshot** for band membership of the assignment).

Computed on read (no nightly job). Index `(companyId, assignedAt)` already exists.

**Rationale**: Spec wants live update when new sales post. Snapshot avoids rewriting historical “total at assign.”

**Alternatives considered**: Control-group experiment — out of scope. Latest contact as cutover — rejected (spec default = first after assign).

---

## R8 — AuthZ

**Decision**: Same gate as today’s assign panel: `contacts.insight.read` + `hasInsightAdminView` (same as `canExportFilteredCsv` / call-queue candidates). No new permission keys.

**Rationale**: Spec reuses existing admin assign access.

**Alternatives considered**: New `contacts.call_queue.assign` — rejected (Principle V until a third caller needs it).

---

## R9 — Select count / page / all

**Decision**:

- **Page**: client selects IDs on current `items` page (existing pattern).
- **Count N**: `GET eligible-ids?limit=N` after same filters; skip pending/hidden; first N in ranked order (may span pages).
- **Select all**: `GET eligible-ids` without small limit (or `limit` = eligible total, still assign in 200-chunks).

**Rationale**: Clarify: N is full matching set; N is eligible-only.

**Alternatives considered**: Select first N of current page — rejected (clarify A). Count already-queued toward N — rejected (clarify A).
