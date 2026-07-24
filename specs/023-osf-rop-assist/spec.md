# Feature Specification: OSF Live Refresh & ROP Assist

**Feature Branch**: `023-osf-rop-assist`

**Created**: 2026-07-24

**Status**: Draft

**Input**: User description: "When someone opens the OSF page, refresh details from both ERPs (live stock, product priority). Main focus Top Priority items but consider all items. Purchasing managers set ROP using sales from last purchase date to today (fallback last 30 days if no purchase date). Suggest ROP = sales in that window (option A); managers review, edit if needed, save. Later richer signals (stock movement, purchase qty, day sales) — Phase 1 focuses live refresh + assist."

## Clarifications

### Session 2026-07-24

- Q: Which product priority is the main work focus? → A: **Top Priority** (ERP Product Priority values include Non Priority, Top Priority, Discontinue, Newly Added, etc.). All items remain available; default view emphasizes Top Priority.
- Q: Sales window for ROP judgment? → A: From **Last Purchase Date → today** (day OSF is opened). **Not** a fixed last-N-days window when purchase date exists.
- Q: If item has no last purchase date? → A: Use **last 30 days → today**.
- Q: Suggested ROP formula (v1)? → A: **Option A** — suggested ROP ≈ **sales units in that window** (replace what sold since last buy / in fallback window). Manager reviews; never silent overwrite.
- Q: When should ERP data refresh? → A: When a user **opens the OSF page** (and optional manual refresh), sync product priority from both ERPs and load live stock so decisions use current data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open OSF page refreshes live ERP data (Priority: P1)

A purchasing user opens the OSF page in Cosmo OS. The system refreshes product priorities from both ERPs and loads current stock quantities for OSF locations/shops so the page shows up-to-date priority and stock without requiring a separate Items-page visit or Excel download first.

**Why this priority**: Stale priority/stock forces managers back to Excel; live-on-open is the foundation for in-app ROP decisions.

**Independent Test**: Change an item’s Product Priority in ERP and stock in ERP; open OSF page; confirm Cosmo shows the new priority and updated stock without opening the Items page first.

**Acceptance Scenarios**:

1. **Given** a user with OSF access, **When** they open the OSF page, **Then** the system starts a refresh of Product Priority from both configured ERPs and live stock for OSF columns.
2. **Given** the refresh completes, **When** the user views the work list / item details, **Then** ERP1/ERP2 priority and stock reflect current ERP values (or a clear partial-failure message if one ERP is down).
3. **Given** refresh is in progress, **When** the user looks at the page, **Then** they see a clear loading/refresh status and can still navigate without a blank dead page.
4. **Given** the user clicks an optional Refresh control, **When** refresh runs again, **Then** priority and stock update again to current ERP values.

---

### User Story 2 - Top Priority–first work list with sales window for ROP (Priority: P1)

A purchasing manager sees a work list of items on the OSF page. By default the list emphasizes **Top Priority** items first (all items still reachable via filter/sort). For each item they see stock, last purchase date (if any), sales in the assist window, and related cues needed to judge ROP without downloading Excel first.

**Sales window (assist window):**
- If Last Purchase Date exists: sales from that date through **today** (OSF open / as-of date).
- If no Last Purchase Date: sales for the **last 30 days** through today.

**Why this priority**: Matches how managers already use downloaded OSF, focused on Top Priority.

**Independent Test**: Open OSF; confirm Top Priority items appear first; for a SKU with purchase date 10 days ago, sales window = those 10 days; for a SKU with no purchase date, sales window = last 30 days.

**Acceptance Scenarios**:

1. **Given** the OSF ROP assist view, **When** it loads with default filters, **Then** Top Priority items are the primary focus (sorted/filtered ahead of others).
2. **Given** the user clears or changes priority filter, **When** they choose all items, **Then** non–Top Priority items are also available.
3. **Given** an item with Last Purchase Date D, **When** assist metrics load for as-of date T, **Then** sales shown for ROP assist are units sold from D through T (inclusive rules documented consistently).
4. **Given** an item with no Last Purchase Date, **When** assist metrics load, **Then** sales shown use the last 30 days through T.
5. **Given** an item, **When** the manager views the row/detail, **Then** they see at least: identity (SKU), priority, stock (relevant totals/locations as designed for v1), last purchase date if known, sales in assist window, current ROP(s), and suggested ROP.

---

### User Story 3 - Suggest ROP = sales in window; review, edit, save (Priority: P1)

For items in the assist view, the system proposes **Suggested ROP = sales units in the assist window** (Option A). The purchasing manager reviews suggestions, edits any that need changing, and saves. Nothing overwrites saved ROPs without an explicit accept/save action.

**Why this priority**: This is the core “easier than Excel” loop: system does the arithmetic; human stays in control.

**Independent Test**: SKU sold 12 units since last purchase; suggested ROP shows 12; manager changes to 15 and saves; stored ROP is 15; another SKU left untouched is unchanged.

**Acceptance Scenarios**:

1. **Given** an item with assist-window sales S (finite number), **When** suggestion is computed, **Then** Suggested ROP = S (non-negative; rounding rule: whole units, floor or round — default round to nearest integer, ties away from zero documented in assumptions).
2. **Given** assist-window sales is 0, **When** suggestion is computed, **Then** Suggested ROP is 0 (manager may still set a positive ROP manually).
3. **Given** suggestions are shown, **When** the manager accepts selected suggestions (or saves edits), **Then** only those items’ ROPs update in Cosmo for the ROP targets in scope (v1: same ROP column set as item ROP editor / active includeInRop columns — company default documented in assumptions).
4. **Given** the manager does not accept/save, **When** they leave the page, **Then** existing saved ROPs remain unchanged.
5. **Given** a user without OSF manage rights, **When** they open OSF, **Then** they may see read-only assist metrics if they can generate OSF, but cannot save ROP changes (or they do not see save controls).

---

### User Story 4 - Download OSF after decisions (Priority: P2)

After reviewing/saving ROPs, the manager downloads the OSF workbook as today; the file reflects saved ROPs and live stock at generate time.

**Why this priority**: Completes the loop; generate already exists — ensure assist save feeds generate.

**Independent Test**: Save a suggested ROP, generate OSF, confirm that SKU’s ROP column matches the saved value.

**Acceptance Scenarios**:

1. **Given** ROPs saved via assist, **When** the user generates OSF, **Then** the workbook uses those ROPs.
2. **Given** generate runs, **When** stock is fetched, **Then** stock remains live from ERP at generate time (unchanged principle).

---

### Edge Cases

- One ERP fails during refresh: show which source failed; still show data from the other ERP where possible; do not invent stock or priority.
- Item has purchase date in the future or unparseable: treat as no purchase date → 30-day fallback.
- Assist window longer than catalog history: sales = whatever completed sales exist in the window (may be less than “true” demand).
- Top Priority string must match ERP value exactly (`Top Priority`); other priorities remain filterable.
- Bulk accept on hundreds of Top Priority rows: must remain usable (progress/summary); exact UX is planning detail but outcome is all accepted rows saved.
- Location/shop-level suggested ROP in v1: default to **one suggested value applied to a defined set of ROP columns** (see Assumptions); per-location sales split can be Phase 2.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Opening the OSF page MUST trigger refresh of Product Priority from both company ERPs and live stock for OSF-configured warehouses/locations.
- **FR-002**: Users MUST be able to manually re-trigger the same refresh from the OSF page.
- **FR-003**: The OSF ROP assist view MUST default to emphasizing **Top Priority** items while allowing access to all items.
- **FR-004**: For each item in assist, the system MUST compute an assist sales window: Last Purchase Date→today if purchase date exists; else last 30 days→today.
- **FR-005**: The system MUST show sales units in that assist window (from Cosmo completed-sale sources consistent with existing OSF sales logic, scoped to the window dates).
- **FR-006**: Suggested ROP MUST equal assist-window sales units (Option A), as a non-negative whole number per rounding assumption.
- **FR-007**: Saving/accepting suggestions MUST update stored OSF ROPs only for explicitly accepted/edited items; no silent overwrite of the full catalog.
- **FR-008**: Users without OSF manage permission MUST NOT be able to save ROP changes via assist.
- **FR-009**: Refresh failures MUST surface clear errors without inventing stock, priority, sales, or ROP.
- **FR-010**: After assist saves, OSF generate MUST use the updated ROPs on download.

### Key Entities

- **Product Priority**: ERP-synced label on the item (e.g. Top Priority, Newly Added, Non Priority, Discontinue).
- **Assist sales window**: Purchase date→today, or last 30 days→today.
- **Suggested ROP**: Proposed reorder point = sales in assist window; requires human accept/save.
- **Saved ROP**: Persisted per-SKU (and column/location as today) used on OSF generate.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After opening OSF, a test SKU whose ERP priority and stock changed since last Items sync shows the new priority and stock on the assist view without visiting Items first (verified in UAT).
- **SC-002**: For a fixture SKU with known purchase date and known sales S in that window, Suggested ROP equals S in 100% of test runs.
- **SC-003**: For a fixture SKU with no purchase date and known sales S over the last 30 days, Suggested ROP equals S.
- **SC-004**: A manager can accept suggestions for at least 20 Top Priority SKUs and save in under 5 minutes in UAT (vs building the same ROPs from Excel alone).
- **SC-005**: Zero silent ROP overwrites: items not accepted remain at prior ROP after a bulk accept session.
- **SC-006**: OSF download after save shows the new ROP for accepted SKUs on the next generate.

## Assumptions

- Suggested ROP Option A replaces “what sold in the window,” not a cover-days forecast (can be revisited later).
- Sales for the assist window use the same Cosmo notion of sold units as OSF monthly sales (completed delivery/invoice paths), filtered to the window dates instead of calendar month only.
- Last Purchase Date comes from the same ERP purchase signal already used on OSF (“Last Purchase Date”).
- v1 may apply one suggested ROP value to all active `includeInRop` columns for that SKU, or to a single primary column set — default: **apply accepted value to all active ROP columns for that SKU** unless the UI allows per-column edit (per-column edit preferred if low cost; otherwise document single-value apply).
- Rounding: nearest integer; 0.5 rounds up.
- “Today” = company business date used elsewhere for OSF as-of (Asia/Colombo), consistent with existing OSF dating.
- Richer cues (stock movement detail, purchase qty display, day-of sales strip) can follow in a later increment once this assist loop works.
- Existing OSF generate, ROP import template, and column access features remain; this feature adds the in-app review path.
