# Feature Specification: OSF Purchasing Suite

**Feature Branch**: `012-osf-purchasing-suite`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "New purchasing sidebar group for OSF; margin calculator by SKU; supplier price-change comparison; OSF warehouse order qty show surplus as negative for intercompany transfer; SKU ROP percentage for reorder triggers; download OSF only for items below ROP %; purchasing reminder bubble + new permission."

## Clarifications

### Session 2026-07-20

- Q: Warehouse ROP vs reorder threshold % → A: Keep absolute warehouse ROP + add per-SKU reorder threshold % (default 70%); do not replace warehouse ROP with percentage-only inputs.
- Q: How should TOTAL / Common SKU reorder totals treat negative (surplus) warehouse order qtys? → A: Per-warehouse columns show signed qty (ROP − stock, including negatives). TOTAL / Common reorder totals sum **positive buy qtys only**; surplus negatives must not reduce the buy total. Example: stocks 0/5/30, ROPs 10/8/15 → order qtys +10 / +3 / −15; TOTAL ORDER QTY = 13 (not −2).
- Q: Permission model for new tools vs reminder bubble? → A: **Two new permission families** — (1) Purchasing suite tools (margin calculator, supplier price compare, filtered reorder OSF, and related purchasing sidebar entries) gated by new purchasing-tool permissions; (2) separate new permission for the ROP-threshold reminder bubble. Existing `purchasing.osf.read` / `.manage` continue for classic OSF generate/edit unless plan maps finer keys; do not rely on reminder permission alone for tools or vice versa.
- Q: Is supplier new-price comparison saved? → A: **Session-only** live compare in v1 — user enters new price, sees % change vs last purchase; no quote history / persisted new-price record.
- Q: Margin calculator selling-price default? → A: **Prefill from Cosmo catalog sell/discounted price** when available; user may overwrite for what-if margin.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Purchasing sidebar group for OSF tools (Priority: P1)

A purchasing user opens the dashboard sidebar and sees a dedicated **Purchasing / OSF** group that gathers Order Support File generation and related buying tools in one place (instead of hunting under unrelated admin sections).

**Why this priority**: Without clear navigation, new calculators, alerts, and filtered exports are hard to discover; grouping is the entry point for the whole suite.

**Independent Test**: Log in as a user with the new purchasing-tools permission; confirm the sidebar group shows calculator / price-compare / filtered OSF entry points; user with only OSF generate permission (no tools permission) does not get those new tool links; user with only reminder permission does not get tools either.

**Acceptance Scenarios**:

1. **Given** a user with classic OSF and/or new purchasing-tools permission as applicable, **When** they open the sidebar, **Then** they see a distinct Purchasing / OSF group: OSF creation for OSF-permitted users, and new tool links only when purchasing-tools permission is granted.
2. **Given** a user without purchasing-tools permission, **When** they open the sidebar, **Then** they do not get access to margin calculator, price compare, or filtered reorder OSF.
3. **Given** the group is present, **When** the user opens OSF creation from the group (with OSF permission), **Then** they reach the existing OSF hub without a broken link.

---

### User Story 2 - SKU margin calculator (Priority: P1)

A buyer with purchasing-tools permission searches by SKU, sees the item’s current purchase/cost price, enters a proposed selling price, and immediately sees the margin percentage for that SKU.

**Why this priority**: Daily pricing decisions need a fast, SKU-level check without downloading the full OSF workbook.

**Independent Test**: Search a known SKU with a known purchase price; enter a selling price; verify margin % matches (selling − purchase) / selling when both exist.

**Acceptance Scenarios**:

1. **Given** an authorized purchasing-tools user, **When** they search by SKU and select a catalog item, **Then** the screen shows item identity and the purchase/cost price used for margin (blank if unknown — never invented), and the selling-price field prefills from catalog discounted/sell price when present.
2. **Given** purchase price and a selling price (prefilled or edited) are both present and selling price ≠ 0, **When** margin is calculated, **Then** margin % = (selling − purchase) / selling, shown clearly as a percentage.
3. **Given** purchase price is missing, **When** the user has or enters a selling price, **Then** margin is blank/unavailable with a clear reason (not a fabricated cost).
4. **Given** the user clears or changes the selling price, **When** values update, **Then** margin recalculates immediately.
5. **Given** catalog sell/discounted price is missing, **When** the SKU is selected, **Then** selling price starts blank (user must type to compute margin).

---

### User Story 3 - Supplier price-change comparison (Priority: P1)

When a supplier quotes a new price, a buyer compares it to the last known purchase price for that SKU and sees how much higher (or lower) the new price is as a percentage.

**Why this priority**: Supplier increases must be visible before ordering; this is a core purchasing control next to margin math.

**Independent Test**: For a SKU with last purchase price 100, enter new price 120; verify increase shows +20% (or equivalent clear label).

**Acceptance Scenarios**:

1. **Given** a SKU with a known last purchase price, **When** the user enters a new supplier price, **Then** the system shows the absolute difference and the percentage change relative to the last price.
2. **Given** last purchase price is missing, **When** the user enters a new price, **Then** comparison is blank/unavailable (no invented baseline).
3. **Given** new price equals last price, **When** comparison runs, **Then** change shows 0% (or “no change”).
4. **Given** new price is lower than last, **When** comparison runs, **Then** the decrease is shown as a negative percentage (or clearly labeled decrease).
5. **Given** the user leaves the compare screen or clears the new price, **When** they return later, **Then** no previously typed “new price” is restored from storage (session-only; last purchase baseline still loads from purchasing data).

---

### User Story 4 - OSF warehouse order qty shows surplus as negative (Priority: P1)

On generated OSF, per-warehouse suggested order quantity is **ROP − stock** and may be **negative** when stock exceeds ROP (e.g. ROP 12, stock 50 → **−38**), so buyers can spot surplus for intercompany transfer. Positive values still mean “buy this many.”

**Why this priority**: Current “floor at zero” hides surplus; negative qty is required for transfer planning between warehouses.

**Independent Test**: Generate OSF for a SKU with warehouse ROP 12 and stock 50; that warehouse’s order-qty cell is −38 (not blank/0). Warehouse with ROP 12 and stock 8 shows +4.

**Acceptance Scenarios**:

1. **Given** a warehouse column has ROP and stock, **When** OSF is generated, **Then** order qty = ROP − stock (may be negative).
2. **Given** ROP is missing for a warehouse, **When** OSF is generated, **Then** that warehouse order qty stays blank / “No ROP” (not treated as zero ROP inventing a large buy or sell).
3. **Given** warehouses with mixed buy and surplus (e.g. order qtys +10, +3, −15), **When** OSF is generated, **Then** each warehouse column shows its signed order qty, and TOTAL ORDER QTY (and Common SKU Reorder buy total) equals the sum of **positive** warehouse order qtys only (13), not the signed net (−2).

---

### User Story 5 - SKU reorder threshold % + filtered OSF download (Priority: P1)

Purchasing maintains a **reorder threshold percentage** per SKU (e.g. 70%). When **total stock as a share of total ROP** falls below that percentage, the SKU is “below threshold.” Users can download an OSF workbook that contains **only** those below-threshold SKUs — without regenerating the full catalog file.

**Why this priority**: Full OSF downloads are heavy for day-to-day “what must we reorder now?” decisions.

**Independent Test**: Set SKU threshold 70%; stock/ROP below 70%; download filtered OSF and confirm only below-threshold SKUs appear (and a SKU above threshold does not).

**Acceptance Scenarios**:

1. **Given** an authorized user edits a SKU’s reorder threshold %, **When** they save, **Then** the value persists and is used for filtered export and reminders.
2. **Given** total ROP > 0 and stock/ROP &lt; threshold %, **When** the user downloads the “reorder-only” OSF, **Then** that SKU is included.
3. **Given** stock/ROP ≥ threshold % (or ROP missing so % cannot be evaluated), **When** reorder-only OSF is downloaded, **Then** that SKU is excluded (missing ROP never silently treated as “must buy”).
4. **Given** no SKUs are below threshold, **When** the user requests reorder-only OSF, **Then** they get a clear empty-state message (or an empty workbook with notice) — not a silent full catalog dump.

---

### User Story 6 - Purchasing ROP-threshold reminder bubble + permission (Priority: P2)

When SKUs fall below their reorder threshold %, users with the **purchasing reminder permission** see a **reminder bubble** listing those items. Access is gated by that dedicated permission (not tools permission alone, not only generic admin).

**Why this priority**: Proactive notice reduces missed reorders; permission keeps the bubble scoped to purchasing roles.

**Independent Test**: Seed a below-threshold SKU; user with new permission sees reminder count/items; user without permission does not.

**Acceptance Scenarios**:

1. **Given** at least one SKU is below its reorder threshold %, **When** a user with the new purchasing reminder permission opens reminders, **Then** they see a purchasing/OSF reorder category with those SKUs (or a count linking to the filtered list).
2. **Given** a user lacks the new permission, **When** they use the reminder UI, **Then** they do not see the purchasing ROP-threshold bubble.
3. **Given** all SKUs are at/above threshold (or cannot be evaluated), **When** reminders refresh, **Then** the purchasing reorder bubble is empty or hidden.
4. **Given** a reminder item is shown, **When** the user follows it, **Then** they land on a purchasing screen that can act (filtered OSF or SKU list) — not a dead end.

---

### Edge Cases

- SKU found in search but purchase/cost price missing → show identity; leave margin / price-compare baseline blank.
- Selling price or new supplier price ≤ 0 → reject or show validation; do not compute misleading margins.
- Total ROP = 0 or all warehouse ROPs blank → SKU cannot be “below threshold”; exclude from filtered OSF and reminders.
- Multiple warehouses: threshold uses **total stock vs total ROP** (same basis as existing OSF “% of ROP” intent), not a single warehouse alone. Example total stock 35 vs total ROP 33 is a separate concept from per-warehouse buy/surplus columns.
- Intercompany surplus (negative order qty) and “below threshold” can both be true or only one true — filtered reorder file is driven by threshold %, not by negative order qty alone.
- TOTAL ORDER QTY ignores surplus: only positive warehouse order qtys add into the buy total (e.g. +10 + +3 + (−15) → TOTAL 13).
- Large catalog: filtered generate and reminder evaluation must complete within normal purchasing wait expectations (see Success Criteria).
- Supplier allowlist / last-purchase rules from prior OSF work still apply to purchase price used in calculators when that price comes from last purchase.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present a dedicated sidebar navigation group for Purchasing / OSF tools, including OSF file creation and the new calculator / price-compare / reorder-export entry points that belong to this suite.
- **FR-002**: System MUST allow authorized users to search catalog items by SKU and open a margin calculator view for the selected item.
- **FR-003**: System MUST display the item’s purchase/cost price in the calculator from the best available purchasing source already used for OSF (latest allowed purchase / cost); MUST NOT invent a price when unknown.
- **FR-004**: System MUST accept a user-entered selling price and compute margin % as (selling − purchase) / selling when both values are valid and selling ≠ 0. When the SKU is selected, the selling-price field MUST **prefill from the Cosmo catalog discounted/sell price** when available; the user MUST be able to overwrite it. If catalog sell price is missing, the field starts blank.
- **FR-005**: System MUST allow authorized purchasing-tools users to enter a new supplier price for a SKU and compare it to the last known purchase price, showing percentage change (and absolute difference). In v1 this MUST be a **session-only** calculation — the entered new price MUST NOT be persisted as quote history.
- **FR-006**: On OSF generation, per-warehouse order quantity MUST equal ROP − stock and MUST allow negative values when stock exceeds ROP (surplus / transfer signal).
- **FR-006a**: TOTAL ORDER QTY and Common SKU Reorder buy aggregates MUST sum only **positive** per-warehouse order qtys. Negative (surplus) warehouse values MUST remain visible on their columns but MUST NOT reduce those totals.
- **FR-007**: System MUST keep per-warehouse **absolute ROP** qty for order-qty columns AND support a separate per-SKU **reorder threshold percentage** in Cosmo UI (default 70% when unset). Warehouse ROP MUST NOT be replaced by percentage-only inputs.
- **FR-008**: System MUST offer a download that generates an OSF workbook containing only SKUs whose total stock / total ROP is below that SKU’s reorder threshold percentage.
- **FR-009**: System MUST evaluate below-threshold SKUs for a purchasing reminder bubble visible to users with a new dedicated permission.
- **FR-010**: System MUST introduce and enforce **two new permission areas**: (a) **Purchasing suite tools** — gates margin calculator, supplier price compare, filtered reorder-only OSF, and related new sidebar entries; (b) **Purchasing ROP-threshold reminders** — gates visibility of the reminder bubble/category. These MUST be independent of each other. Classic OSF generate/edit MUST continue to use existing OSF permissions (`purchasing.osf.read` / `purchasing.osf.manage`) unless a later plan explicitly remaps them.
- **FR-011**: Calculator, price-compare, filtered export, and reminder features MUST reuse company-scoped catalog / OSF ROP data and MUST NOT require Excel upload to operate.
- **FR-012**: Users without purchasing-tools permission MUST NOT access calculator, price-compare, or filtered reorder export. Users without the reminder permission MUST NOT see the purchasing ROP-threshold reminder category. Holding only one of these MUST NOT grant the other.

### Key Entities

- **Purchasing nav group**: Sidebar grouping for OSF creation and related buying tools.
- **SKU margin session**: Selected SKU + purchase price + user selling price + computed margin % (ephemeral UI state).
- **Supplier price comparison**: Selected SKU + last purchase price + user-entered new price + % change (**session-only** in v1; no saved quote entity).
- **Warehouse ROP (absolute)**: Existing per-location ROP qty used for signed order qty (ROP − stock).
- **SKU reorder threshold %**: Per-SKU percentage of total ROP; below this, SKU is reorder-eligible for filtered OSF and reminders.
- **Reorder-only OSF snapshot**: Generated workbook limited to below-threshold SKUs.
- **Purchasing ROP reminder**: Reminder-bubble category listing below-threshold SKUs for permitted users.
- **Purchasing suite tools permission**: RBAC permission(s) controlling margin calculator, supplier price compare, filtered reorder OSF, and related new purchasing sidebar entries.
- **Purchasing reminder permission**: RBAC permission controlling who sees/acts on the ROP-threshold reminder category (independent of tools permission).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized purchasing users can open the new sidebar group and reach OSF creation in one click from the dashboard shell.
- **SC-002**: For a held-out set of at least 10 SKUs with known purchase and selling prices, calculator margin % matches hand-checked (selling − purchase) / selling within 0.01 percentage points rounding tolerance.
- **SC-003**: For at least 10 SKUs with known last and new prices, price-change % matches hand-checked (new − last) / last within 0.01 percentage points.
- **SC-004**: On a sample OSF generate, every warehouse with both ROP and stock shows order qty = ROP − stock including negatives; no warehouse with surplus is forced to 0. For a fixture with order qtys +10, +3, −15, TOTAL ORDER QTY equals 13 (positives only).
- **SC-005**: Filtered reorder OSF contains 100% of SKUs below threshold and 0% of SKUs at/above threshold (or unevaluable) in a sampled catalog of ≥50 SKUs.
- **SC-006**: Users with the reminder permission see the purchasing reorder reminder when ≥1 SKU is below threshold; users without that permission never see that bubble. Users without purchasing-tools permission cannot open calculator / price-compare / filtered OSF even if they have the reminder permission.
- **SC-007**: Purchasing users report they can answer “margin for this SKU?” and “how much did supplier raise?” without downloading the full OSF for routine checks (qualitative check after two weeks of use).

## Out of Scope

- Persisted supplier quote history or audit log of compared new prices (v1 session-only).
- Replacing per-warehouse absolute ROP with percentage-only ROP inputs.
- Email / SMS / push notifications for below-threshold SKUs beyond the in-app reminder bubble (v1).
- Hard-delete or Excel import of ROP / threshold values.
- Changing OSF Country gap or unrelated prior OSF deferred items.

## Assumptions

- Scope for v1 is **Cosmo OS** purchasing (same company context as existing OSF); Vault gets the same behavior automatically only if it shares the same code paths and company-scoped data — no separate Vault-only product fork in this feature.
- **Per-warehouse absolute ROP remains** the basis for OSF stock/order columns; **reorder threshold % is an additional per-SKU setting** used for alerts and filtered download (default **70%** when unset, matching today’s OSF “70% of total ROP” cue). Confirmed in Clarifications 2026-07-20 (Option A).
- Margin formula uses selling price as denominator (same family as existing Cosmetics / OGF margin style: (price − cost) / price). Selling price **prefills from catalog discounted/sell price** when available (Clarifications 2026-07-20).
- Supplier price-change % uses last purchase price as denominator: (new − last) / last.
- “Purchase price” in calculators follows the same sourcing rules as OSF latest cost / last allowed purchase (including supplier allowlist behavior where applicable).
- New supplier price in the compare tool is **entered by the user** in Cosmo (quote / email / call) and is **session-only in v1** (not saved); it is not required to already exist in ERP for the comparison screen. Confirmed Clarifications 2026-07-20.
- Signed order qty (including negatives) applies to Main OSF and buyer sheets that include those quantity columns. **TOTAL / Common buy totals = sum of positive warehouse order qtys only**; surplus does not reduce the buy total (Clarifications 2026-07-20).
- Intercompany surplus columns are planning signals for transfer; they do not invent a “sell” or reduce what must still be purchased for short warehouses.
- Reminder bubble follows the existing Cosmo reminder UX patterns (count + list + link); exact SLA hours can match other purchasing-adjacent reminders or use a simple “currently below threshold” list without aging SLA in v1.
- Existing `purchasing.osf.read` / `purchasing.osf.manage` continue to gate classic OSF generate/edit. **New purchasing-tools permission(s)** gate calculator, price-compare, and filtered reorder OSF. **Separate new reminder permission** gates the ROP-threshold bubble. Confirmed Clarifications 2026-07-20 (Option C).
- Country / unrelated OSF gaps from prior specs stay out of scope.
