# Feature Specification: OSF Purchasing Suite

**Feature Branch**: `012-osf-purchasing-suite`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "New purchasing sidebar group for OSF; margin calculator by SKU; supplier price-change comparison; OSF warehouse order qty show surplus as negative for intercompany transfer; SKU ROP percentage for reorder triggers; download OSF only for items below ROP %; purchasing reminder bubble + new permission."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Purchasing sidebar group for OSF tools (Priority: P1)

A purchasing user opens the dashboard sidebar and sees a dedicated **Purchasing / OSF** group that gathers Order Support File generation and related buying tools in one place (instead of hunting under unrelated admin sections).

**Why this priority**: Without clear navigation, new calculators, alerts, and filtered exports are hard to discover; grouping is the entry point for the whole suite.

**Independent Test**: Log in as a user with purchasing OSF permission; confirm the new sidebar group appears with links to OSF generation and at least the margin calculator; user without permission does not see the group (or sees it disabled / denied).

**Acceptance Scenarios**:

1. **Given** a user with purchasing OSF access, **When** they open the sidebar, **Then** they see a distinct group for OSF / purchasing tools including OSF file creation.
2. **Given** a user without the purchasing OSF permission, **When** they open the sidebar, **Then** they do not get access to the protected purchasing tools in that group.
3. **Given** the group is present, **When** the user opens OSF creation from the group, **Then** they reach the existing OSF hub (generate / maintain) without a broken link.

---

### User Story 2 - SKU margin calculator (Priority: P1)

A buyer searches by SKU, sees the item’s current purchase/cost price, enters a proposed selling price, and immediately sees the margin percentage for that SKU.

**Why this priority**: Daily pricing decisions need a fast, SKU-level check without downloading the full OSF workbook.

**Independent Test**: Search a known SKU with a known purchase price; enter a selling price; verify margin % matches (selling − purchase) / selling when both exist.

**Acceptance Scenarios**:

1. **Given** an authorized purchasing user, **When** they search by SKU and select a catalog item, **Then** the screen shows item identity and the purchase/cost price used for margin (blank if unknown — never invented).
2. **Given** purchase price and a user-entered selling price are both present and selling price ≠ 0, **When** margin is calculated, **Then** margin % = (selling − purchase) / selling, shown clearly as a percentage.
3. **Given** purchase price is missing, **When** the user enters a selling price, **Then** margin is blank/unavailable with a clear reason (not a fabricated cost).
4. **Given** the user clears or changes the selling price, **When** values update, **Then** margin recalculates immediately.

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

---

### User Story 4 - OSF warehouse order qty shows surplus as negative (Priority: P1)

On generated OSF, per-warehouse suggested order quantity is **ROP − stock** and may be **negative** when stock exceeds ROP (e.g. ROP 12, stock 50 → **−38**), so buyers can spot surplus for intercompany transfer. Positive values still mean “buy this many.”

**Why this priority**: Current “floor at zero” hides surplus; negative qty is required for transfer planning between warehouses.

**Independent Test**: Generate OSF for a SKU with warehouse ROP 12 and stock 50; that warehouse’s order-qty cell is −38 (not blank/0). Warehouse with ROP 12 and stock 8 shows +4.

**Acceptance Scenarios**:

1. **Given** a warehouse column has ROP and stock, **When** OSF is generated, **Then** order qty = ROP − stock (may be negative).
2. **Given** ROP is missing for a warehouse, **When** OSF is generated, **Then** that warehouse order qty stays blank / “No ROP” (not treated as zero ROP inventing a large buy or sell).
3. **Given** total / common reorder aggregates, **When** surplus warehouses exist, **Then** totals remain consistent with summing the signed per-warehouse order qtys (document behavior in Assumptions if netting is used).

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

When SKUs fall below their reorder threshold %, purchasing admins see a **reminder bubble** (same family as existing task reminders) listing those items. Access is gated by a **new explicit permission** (not only generic admin).

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
- Multiple warehouses: threshold uses **total stock vs total ROP** (same basis as existing OSF “% of ROP” intent), not a single warehouse alone.
- Intercompany surplus (negative order qty) and “below threshold” can both be true or only one true — filtered reorder file is driven by threshold %, not by negative order qty alone.
- Large catalog: filtered generate and reminder evaluation must complete within normal purchasing wait expectations (see Success Criteria).
- Supplier allowlist / last-purchase rules from prior OSF work still apply to purchase price used in calculators when that price comes from last purchase.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present a dedicated sidebar navigation group for Purchasing / OSF tools, including OSF file creation and the new calculator / price-compare / reorder-export entry points that belong to this suite.
- **FR-002**: System MUST allow authorized users to search catalog items by SKU and open a margin calculator view for the selected item.
- **FR-003**: System MUST display the item’s purchase/cost price in the calculator from the best available purchasing source already used for OSF (latest allowed purchase / cost); MUST NOT invent a price when unknown.
- **FR-004**: System MUST accept a user-entered selling price and compute margin % as (selling − purchase) / selling when both values are valid and selling ≠ 0.
- **FR-005**: System MUST allow authorized users to enter a new supplier price for a SKU and compare it to the last known purchase price, showing percentage change (and absolute difference).
- **FR-006**: On OSF generation, per-warehouse order quantity MUST equal ROP − stock and MUST allow negative values when stock exceeds ROP (surplus / transfer signal).
- **FR-007**: System MUST support a per-SKU **reorder threshold percentage** maintained in Cosmo UI (alongside existing per-warehouse absolute ROP used for order-qty columns).
- **FR-008**: System MUST offer a download that generates an OSF workbook containing only SKUs whose total stock / total ROP is below that SKU’s reorder threshold percentage.
- **FR-009**: System MUST evaluate below-threshold SKUs for a purchasing reminder bubble visible to users with a new dedicated permission.
- **FR-010**: System MUST introduce and enforce a new permission for purchasing ROP-threshold reminders (and gate related reminder visibility); OSF generate / manage permissions remain as today unless explicitly extended for the new tools.
- **FR-011**: Calculator, price-compare, filtered export, and reminder features MUST reuse company-scoped catalog / OSF ROP data and MUST NOT require Excel upload to operate.
- **FR-012**: Users without the appropriate purchasing permissions MUST NOT access calculator, price-compare, filtered reorder export, or the new reminder category.

### Key Entities

- **Purchasing nav group**: Sidebar grouping for OSF creation and related buying tools.
- **SKU margin session**: Selected SKU + purchase price + user selling price + computed margin %.
- **Supplier price comparison**: Selected SKU + last purchase price + user-entered new price + % change.
- **Warehouse ROP (absolute)**: Existing per-location ROP qty used for signed order qty (ROP − stock).
- **SKU reorder threshold %**: Per-SKU percentage of total ROP; below this, SKU is reorder-eligible for filtered OSF and reminders.
- **Reorder-only OSF snapshot**: Generated workbook limited to below-threshold SKUs.
- **Purchasing ROP reminder**: Reminder-bubble category listing below-threshold SKUs for permitted users.
- **Purchasing reminder permission**: RBAC permission controlling who sees/acts on that reminder category.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized purchasing users can open the new sidebar group and reach OSF creation in one click from the dashboard shell.
- **SC-002**: For a held-out set of at least 10 SKUs with known purchase and selling prices, calculator margin % matches hand-checked (selling − purchase) / selling within 0.01 percentage points rounding tolerance.
- **SC-003**: For at least 10 SKUs with known last and new prices, price-change % matches hand-checked (new − last) / last within 0.01 percentage points.
- **SC-004**: On a sample OSF generate, every warehouse with both ROP and stock shows order qty = ROP − stock including negatives; no warehouse with surplus is forced to 0.
- **SC-005**: Filtered reorder OSF contains 100% of SKUs below threshold and 0% of SKUs at/above threshold (or unevaluable) in a sampled catalog of ≥50 SKUs.
- **SC-006**: Users with the new permission see the purchasing reorder reminder when ≥1 SKU is below threshold; users without the permission never see that bubble in the same data state.
- **SC-007**: Purchasing users report they can answer “margin for this SKU?” and “how much did supplier raise?” without downloading the full OSF for routine checks (qualitative check after two weeks of use).

## Assumptions

- Scope for v1 is **Cosmo OS** purchasing (same company context as existing OSF); Vault gets the same behavior automatically only if it shares the same code paths and company-scoped data — no separate Vault-only product fork in this feature.
- **Per-warehouse absolute ROP remains** the basis for OSF stock/order columns; **reorder threshold % is an additional per-SKU setting** used for alerts and filtered download (default **70%** when unset, matching today’s OSF “70% of total ROP” cue).
- Margin formula uses selling price as denominator (same family as existing Cosmetics / OGF margin style: (price − cost) / price).
- Supplier price-change % uses last purchase price as denominator: (new − last) / last.
- “Purchase price” in calculators follows the same sourcing rules as OSF latest cost / last allowed purchase (including supplier allowlist behavior where applicable).
- New supplier price in the compare tool is **entered by the user** in Cosmo (quote / email / call); it is not required to already exist in ERP for the comparison screen.
- Signed order qty (including negatives) applies to Main OSF and buyer sheets that include those quantity columns.
- Reminder bubble follows the existing Cosmo reminder UX patterns (count + list + link); exact SLA hours can match other purchasing-adjacent reminders or use a simple “currently below threshold” list without aging SLA in v1.
- Existing `purchasing.osf.read` / `purchasing.osf.manage` continue to gate OSF generate/edit; new reminder permission is separate; calculator / price-compare / filtered export are available to users with OSF read (or manage) unless plan phase assigns stricter keys.
- Country / unrelated OSF gaps from prior specs stay out of scope.
