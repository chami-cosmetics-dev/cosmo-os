# Feature Specification: SKU Supplier Compare

**Feature Branch**: `014-sku-supplier-compare`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "Some items we buy from different suppliers — can we get that data? When a SKU is selected, show all suppliers we bought that item from. Label them as best option 1, 2, 3 by price (lower price = option 1). Colored labels showing last time we bought from each supplier and at what price."

## Clarifications

### Session 2026-07-21

- Q: For Best Option 1/2/3 ranking, which price should be compared across suppliers? → A: **Best-ever price** — rank by the lowest unit price ever paid to each supplier for this SKU; last purchase date and last purchase price are still shown separately on each row.
- Q: How far back should purchase history be considered for supplier list and best-ever ranking? → A: **All available history** — every allowlisted purchase receipt in ERP counts; no artificial date cutoff.
- Q: Should clicking a supplier row update the margin calculator purchase/cost? → A: **No (display only)** — supplier list does not override margin calculator cost; calculator continues to use the SKU’s global latest purchase cost, which updates automatically after the next purchase from any supplier.
- Q: When best-ever price is from an older receipt, show the date of that best price? → A: **Yes** — show best-ever price **and** the date of that purchase on each row; also show a **Recently** tag on suppliers whose **last purchase** was within the recent window (see FR-013).
- Q: How recent must last purchase be for the **Recently** tag? → A: **30 days** — tag shown when last purchase was within the last 30 calendar days (inclusive).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See all suppliers for a selected SKU (Priority: P1)

A purchasing user searches and selects a SKU in the purchasing calculator. The screen lists every supplier the company has purchased that SKU from (according to purchasing records), not only the single “latest supplier” shown today.

**Why this priority**: Multi-source SKUs are common; buyers need supplier choice at selection time before quoting or ordering.

**Independent Test**: Select a SKU with purchase history from at least two known suppliers; verify both appear with supplier name, last purchase unit price, and last purchase date.

**Acceptance Scenarios**:

1. **Given** a SKU purchased from suppliers A and B, **When** the user selects that SKU, **Then** both suppliers appear in a supplier list for that SKU.
2. **Given** a SKU purchased from only one supplier, **When** the user selects it, **Then** one supplier row is shown (not an error).
3. **Given** a SKU with no purchase history, **When** the user selects it, **Then** the supplier list is empty with a clear “no purchase history” message (no invented suppliers or prices).
4. **Given** company supplier allowlisting is configured, **When** purchase history includes disallowed suppliers, **Then** only allowlisted suppliers appear (consistent with existing OSF purchasing rules).

---

### User Story 2 - Rank suppliers as Best Option 1, 2, 3 by price (Priority: P1)

For each supplier on the list, the system ranks options by **lowest unit price ever paid** to that supplier for this SKU — lowest best-ever price is **Best Option 1**, next lowest **Option 2**, and so on. Each row still shows **last purchase date** and **last purchase unit price** separately so buyers can see whether the best deal is recent or stale.

**Why this priority**: Price ranking is the core decision aid the user asked for; without ranking, a flat list is harder to act on.

**Independent Test**: Use a SKU where Supplier A’s best-ever price was 75 (last paid 90), Supplier B’s best-ever was 80 (last paid 80), Supplier C’s best-ever was 110; verify labels Best Option 1 → A, Option 2 → B, Option 3 → C, with last prices shown on each row.

**Acceptance Scenarios**:

1. **Given** multiple suppliers with different best-ever unit prices, **When** the list is shown, **Then** suppliers are ordered by lowest best-ever price first and labeled Best Option 1, Option 2, Option 3 (up to the number of suppliers).
2. **Given** two suppliers with the same best-ever unit price, **When** ranked, **Then** both receive adjacent option numbers and ties are broken by most recent purchase date (newer first).
3. **Given** a supplier row has no usable unit price in purchase history, **When** the list is built, **Then** that supplier is listed after priced suppliers with price shown as unavailable (not treated as zero).
4. **Given** only one supplier, **When** shown, **Then** it is labeled Best Option 1.
5. **Given** a supplier’s best-ever price differs from their last purchase price, **When** displayed, **Then** the row shows best-ever price **and date of that best purchase**, plus last purchase price and last purchase date.

---

### User Story 3 - Visual recency cues per supplier (Priority: P2)

Each supplier row shows **when** the company last bought that SKU from them and **at what unit price**, plus **best-ever price and best-ever date** when they differ from last purchase. Visual tags make recency obvious: a **Recently** tag when last purchase falls within the recent window, and a distinct **Last purchased from** highlight on the supplier with the most recent purchase across all suppliers.

**Why this priority**: Price alone is not enough — buyers also care which supplier was used last and whether a cheap option is stale.

**Independent Test**: Select a SKU where Supplier A was bought 2 days ago and Supplier B 90 days ago; verify Supplier A shows a **Recently** tag, Supplier B does not, and the most recent supplier is visually distinguished.

**Acceptance Scenarios**:

1. **Given** a supplier with a last purchase on a known date, **When** displayed, **Then** the row shows supplier name, best-ever price and date, last unit price, and last purchase date in human-readable form.
2. **Given** multiple suppliers, **When** displayed, **Then** the supplier with the most recent purchase date is visually highlighted as **Last purchased from** (distinct from Best Option rank and **Recently** tag).
3. **Given** a supplier’s last purchase was within the **recent window** (30 days), **When** displayed, **Then** the row shows a visible **Recently** tag (colored label/badge).
4. **Given** last purchase is older than the recent window, **When** displayed, **Then** the **Recently** tag is not shown (row may still show last date and recency styling).
5. **Given** purchase date is missing but price exists, **When** displayed, **Then** price is shown and date is blank (not fabricated); **Recently** tag is not shown without a date.

---

### User Story 4 - Supplier list independent of margin calculator (Priority: P2)

The supplier compare list is for **comparison and sourcing decisions only**. Selecting or reviewing a supplier row does **not** change the purchase/cost value used in the margin calculator on the same screen — that value remains the SKU’s global latest purchase cost (same as today), which updates automatically after the next purchase from any supplier.

**Why this priority**: Avoids stale manual overrides; when the team switches supplier and buys, ERP latest cost becomes the new truth without the user re-selecting a row.

**Independent Test**: Select a SKU with two suppliers; note margin calculator cost; click the non-latest supplier row; verify margin calculator cost is unchanged; verify supplier list still shows both suppliers ranked correctly.

**Acceptance Scenarios**:

1. **Given** a SKU with multiple suppliers, **When** the user clicks a supplier row, **Then** the margin calculator purchase/cost field is **not** replaced by that supplier’s price.
2. **Given** the user is viewing supplier compare, **When** margin is calculated, **Then** it uses the same global latest purchase cost as before this feature (blank if unknown).
3. **Given** the user buys from a different supplier in ERP, **When** they re-open or refresh the SKU, **Then** margin calculator cost reflects the new global latest purchase; supplier list ranks and last-purchase fields update accordingly.

---

### Edge Cases

- SKU exists in catalog but was never purchased → empty supplier list; margin/calculator still works.
- Supplier’s best-ever price is older than last purchase → rank uses best-ever; row shows best-ever price/date **and** last purchase price/date; **Recently** tag follows last purchase date only.
- ERP temporarily unavailable → supplier list unavailable with clear error; do not show stale or guessed data.
- Same supplier name with different ERP ids that normalize to the same display name → show one row per distinct supplier identity used in purchasing records.
- More than three suppliers → continue Option 4, Option 5, etc. (not capped at three).
- Intercompany or internal transfer receipts → follow same allowlist rules as OSF; excluded when not on allowlist.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST load per-SKU purchase history grouped by supplier when a user selects a SKU in the purchasing calculator (or equivalent purchasing-tools SKU detail view).
- **FR-002**: System MUST show, for each supplier: display name, **best-ever unit price** and **date of that best purchase**, **last unit purchase price**, and **date of last purchase**.
- **FR-003**: System MUST rank suppliers by ascending **best-ever unit price** and label them Best Option 1, Option 2, Option 3, … (lowest best-ever price = Best Option 1).
- **FR-004**: System MUST break price ties by most recent purchase date (newer purchase ranks higher among equals).
- **FR-005**: System MUST visually distinguish the most recently used supplier (by last purchase date across all suppliers for that SKU) from other rows.
- **FR-006**: System MUST show a **Recently** tag on supplier rows whose **last purchase** falls within the recent window (see FR-013), and visually distinguish **Last purchased from** on the supplier with the most recent last-purchase date across all suppliers.
- **FR-007**: System MUST respect existing company supplier allowlisting — disallowed suppliers MUST NOT appear.
- **FR-008**: System MUST NOT invent prices, suppliers, or dates when purchasing data is missing.
- **FR-009**: Supplier compare MUST be available only to users with purchasing-tools permission (same family as the SKU margin calculator).
- **FR-010**: Ranking and display MUST be read-only in v1 — no saving a “preferred supplier” or changing ERP data from this view.
- **FR-011**: System MUST consider **all available allowlisted purchase receipt history** in ERP when computing per-supplier best-ever price, last purchase, and supplier list — no artificial date cutoff in v1.
- **FR-012**: Selecting a supplier row MUST **not** change the margin calculator’s purchase/cost baseline; margin calculator MUST continue to use the SKU’s global latest purchase cost (unchanged behavior from pre-feature calculator).
- **FR-013**: **Recently** tag MUST apply when last purchase date is within **30 calendar days** of today (inclusive); older last purchases MUST NOT show the tag.

### Key Entities

- **SKU purchase by supplier**: One supplier’s purchasing relationship to a SKU — supplier identity, best-ever unit price and date, last unit price, last purchase date, optional quantity on last receipt.
- **Supplier option rank**: Derived label (Best Option 1, 2, 3…) from **best-ever price** ordering for a SKU at display time; not persisted.
- **Last-used supplier**: The supplier with the most recent purchase date for the SKU among listed suppliers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For SKUs with purchase history from two or more suppliers, buyers can identify the supplier with the lowest best-ever price in under 10 seconds without leaving the SKU detail view.
- **SC-002**: In verification samples, ranked option order matches manual sort by best-ever unit price for 100% of SKUs with complete price data.
- **SC-003**: Buyers can identify which supplier was used most recently for a SKU in under 5 seconds via visual recency cues.
- **SC-004**: Zero fabricated supplier rows in UAT when ERP has no purchase history for a SKU.
- **SC-005**: At least 90% of pilot users report the supplier list is useful for multi-source buying decisions (qualitative pilot feedback).

## Assumptions

- Purchase history comes from the same ERP purchase-receipt source already used for OSF “Latest supplier / Latest Cost” (company allowlist rules unchanged).
- **Best-ever unit price** is the lowest allowlisted purchase-receipt unit rate ever recorded for that SKU from that supplier.
- **Last unit price** is the unit rate on the most recent allowlisted purchase receipt line for that SKU from that supplier.
- “Best Option” refers to **best price option** (lowest best-ever purchase price), not sales volume or sell-through.
- v1 scope is the purchasing SKU calculator context; OSF Excel export columns for multi-supplier breakdown are out of scope unless added in a follow-up.
- Users with `purchasing.tools.read` (or manage) may view supplier compare; no new permission family required for v1.
- Ranking is computed on demand when the SKU is selected; no background sync or historical quote storage in v1.
- Purchase history window is **all available ERP receipts** (no 12/24-month cap); best-ever and last-purchase derive from the full allowlisted history.
- Supplier list is **display-only** for margin math; global latest purchase cost drives the calculator and updates when ERP records a new purchase.

## Dependencies

- Existing purchasing tools sidebar and SKU search (`012-osf-purchasing-suite`).
- ERP connectivity and supplier allowlist configuration used by OSF purchasing data.
- SKU identity aligned with ERP item codes (same as current calculator).

## Out of Scope (v1)

- Persisting user’s chosen “preferred supplier” per SKU.
- Placing purchase orders or RFQs to a supplier from this screen.
- Ranking by total volume purchased, lead time, or quality scores (price + recency only).
- Adding multi-supplier columns to generated OSF workbooks.
- Automatic alerts when a non-cheapest supplier was used on the last order.
