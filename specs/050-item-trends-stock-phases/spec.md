# Feature Specification: Item Trends Stock Phases

**Feature Branch**: `050-item-trends-stock-phases`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "Item Trends needs one stock place (last-night snapshot, not live ERP), per-section filters (brand, common SKU then variant SKU), out-of-stock for a date range, and a 50% outlet-send rule: for each item at a location, avg sale vs snapshot stock must cover next week, and the location should hold at least 50% of that week need. Show monthly sale vs stock vs percentage and cover period. Online warehouses first, then physical shops. ROP tab: current ROP = total ROP; export suggestions."

## Clarifications

### Session 2026-09-07

- Q: What is "one stock"? → A: One place on Item Trends to see stock. Live ERP is too slow/unreliable for this page. Use last night’s warehouse snapshot.
- Q: SMS note? → A: Separate ticket (Supplement Vault order SMS). **Out of this feature.**
- Q: 50% stock rule? → A: When sending items to outlets, flag which SKUs to send. For item × location: average sale in the selected range → next-week need. Location should hold at least **50% of that week need**. Below that → send list. Suggest qty to reach a full week.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One stock snapshot (Priority: P1)

A purchasing user opens Item Trends and sees stock from last night’s snapshot in one place, with an as-of timestamp. They do not wait on live ERP. If no snapshot exists yet, the page says so and stock columns stay empty until the night job (or a permitted Capture now) runs.

**Why this priority**: Every stock, cover, OOS, and send decision depends on a stable number.

**Independent Test**: After a snapshot exists, open Outlets/Stock; stock matches snapshot rows for that Colombo date; banner shows captured time.

**Acceptance Scenarios**:

1. **Given** a completed overnight snapshot, **When** the user opens Item Trends stock views, **Then** quantities come from that snapshot and the UI shows snapshot date/time (Asia/Colombo).
2. **Given** no snapshot for the company, **When** the page loads, **Then** stock is shown as unavailable (not guessed) with a clear empty state.
3. **Given** a user with OSF manage permission, **When** they click Capture now, **Then** a new snapshot is stored and the page refreshes to it.

---

### User Story 2 - 50% send-to-outlet list (Priority: P1)

A buyer picks a date range and one or more physical locations. For each item that sold there, the page shows average daily sale, next-week need, snapshot stock, cover days, and % of week need. Rows below 50% of week need are the send list. Suggested send qty fills up to a full week (not only up to 50%).

**Why this priority**: This is the decision the notebook was written for.

**Independent Test**: Location with 14 units in 7 days (avg 2/day, week need 14) and snapshot stock 3 → flagged (3 < 7); suggested send 11.

**Acceptance Scenarios**:

1. **Given** a location and range, **When** the send list loads, **Then** `weekNeed = (unitsInRange / days) × 7` and `shouldSend` when `stock < weekNeed × 0.5`.
2. **Given** zero sales in range at that location, **When** listed, **Then** the item is not on the send list.
3. **Given** stock ≥ 50% of week need, **When** listed, **Then** it is not flagged to send.

---

### User Story 3 - Location cover phases (Priority: P1)

User selects location(s) (all or selective). They see monthly/range sale, snapshot stock, stock-against-sale %, and how long stock lasts. Selecting an item shows stock by warehouse with **online first, then physical shops**.

**Why this priority**: Matches the written drill: location → sale vs stock → item warehouses.

**Independent Test**: Pick one shop; confirm sale, stock, %, cover days; open a SKU and see online warehouses above shop warehouses.

**Acceptance Scenarios**:

1. **Given** a selected location, **When** the cover table loads, **Then** each item shows units in range, snapshot stock, stock/sale %, and cover days (stock ÷ avg daily) or "—" if no sales.
2. **Given** an item drill-down, **When** warehouse stock is shown, **Then** online/web columns appear before physical shops.
3. **Given** location filter "all", **When** viewed, **Then** every in-scope stock column appears; "selective" limits to chosen columns.

---

### User Story 4 - Per-section filters, brand, common SKU (Priority: P1)

Each data section (Movement, Outlets/Stock, ROP, Districts) has its own filters. Users can filter brand-wise and switch common SKU vs variant SKU. Common SKU groups variants of the same product; expanding a group shows separate SKUs.

**Why this priority**: Page-level From/To/Priority alone is confusing when each phase answers a different question.

**Independent Test**: Set Movement brand = "CeraVe" and grain = Common SKU; confirm grouped rows; expand one product; see variant SKUs. Change Outlets brand independently; Movement stays.

**Acceptance Scenarios**:

1. **Given** the dashboard, **When** the user changes a section filter, **Then** only that section reloads; other sections keep their filters.
2. **Given** brand selected, **When** results load, **Then** only items of that vendor appear.
3. **Given** Common SKU grain, **When** results load, **Then** variants of the same product are one row; expanding shows each SKU.
4. **Given** Variant SKU grain, **When** results load, **Then** each SKU is its own row.

---

### User Story 5 - Out of stock in date range (Priority: P1)

For a date range and location set, the user lists items that sold in that range at those locations but have **zero snapshot stock** there now (last night).

**Why this priority**: Shop-wise OOS for a range was an explicit notebook line.

**Independent Test**: SKU sold 5 units at GCC in range, snapshot GCC qty 0 → appears on OOS list; same SKU with stock 2 → does not.

**Acceptance Scenarios**:

1. **Given** range + location(s), **When** OOS filter is on, **Then** only sold-in-range and snapshot stock ≤ 0 rows remain.
2. **Given** an item with no sales in range, **When** OOS is on, **Then** it is omitted even if stock is 0.

---

### User Story 6 - ROP total + export (Priority: P2)

ROP tab shows **total ROP** (sum of all saved OSF column ROPs for the SKU), not a single column. User can export the suggestion table.

**Why this priority**: Needed for purchasing review; does not block stock/send.

**Independent Test**: SKU with column ROPs 10 and 20 → current ROP 30. Export downloads CSV of visible suggestions.

**Acceptance Scenarios**:

1. **Given** multiple OSF ROP columns, **When** the ROP table loads, **Then** Current ROP is the sum across columns.
2. **Given** suggestion rows, **When** the user exports, **Then** a CSV downloads with SKU, priority, peak month, window total, current (total) ROP, suggested ROP, overlay.

---

### Edge Cases

- Snapshot missing: stock, cover, OOS, send list show empty + "No overnight snapshot yet".
- Days in range = 0: treat as invalid; API 400.
- Duplicate ProductItem rows per SKU: catalog fields taken from the first non-archived row.
- Common SKU with mixed brands: group key is product id; brand filter still requires every variant’s vendor to match, or the parent is excluded if none match.
- Fractional ERP qty: stored as-is; cover math uses snapshot qty; send qty rounded up to whole units.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist a nightly ERP bin snapshot (positive qty) per company, SKU, and warehouse, keyed by Colombo calendar date.
- **FR-002**: Item Trends stock figures MUST read the latest snapshot, never live ERP on page load.
- **FR-003**: UI MUST show snapshot as-of date/time in Asia/Colombo.
- **FR-004**: Night cron MUST capture snapshots for every company with ERP credentials; retain 90 days.
- **FR-005**: Users with OSF manage MAY trigger Capture now.
- **FR-006**: Send list MUST use `weekNeed = (unitsInRange / daysInclusive) × 7` and flag when `stock < weekNeed × 0.5`.
- **FR-007**: Suggested send qty MUST be `ceil(max(0, weekNeed − stock))`.
- **FR-008**: Cover table MUST show range units, snapshot stock, stock/sale %, and cover days.
- **FR-009**: Warehouse/stock lists MUST sort online/web columns before physical shops.
- **FR-010**: Each Item Trends tab MUST have its own filters (date/priority inherit as defaults; brand, SKU grain, location, OOS are per-section).
- **FR-011**: Brand filter MUST match ProductItem vendor name.
- **FR-012**: Common SKU MUST group by Shopify product id (fallback: SKU itself); expand to variant SKUs.
- **FR-013**: OOS-in-range MUST mean sold in range at the location and snapshot stock ≤ 0.
- **FR-014**: ROP current value MUST be the sum of all saved OSF ROP columns for that SKU.
- **FR-015**: ROP tab MUST offer CSV export of suggestions.

### Key Entities

- **ErpStockSnapshot**: One night’s on-hand qty for company + date + SKU + warehouse.
- **CoverRow**: Item × location with sales, stock, week need, 50% flag, send qty, cover days.
- **CommonSkuGroup**: Product-level rollup of variant movement/cover rows.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Buyer can open Item Trends and see last-night stock with as-of time without waiting on live ERP.
- **SC-002**: For a known shop and range, send-list flags match the 50% week-need rule on paper in under 2 minutes.
- **SC-003**: User can filter one tab by brand + common SKU without changing another tab’s results.
- **SC-004**: OOS list for a range only includes items that sold there and now have zero snapshot stock.
- **SC-005**: ROP export produces a usable CSV; current ROP equals summed column ROPs.

## Assumptions

- Live ERP remains the source for OSF generate and other existing tools; only Item Trends stock views switch to snapshot.
- "Monthly sale" in the notebook = units in the section’s selected date range (user picks a month when they want a month).
- Common SKU = Shopify product (`shopifyProductId`); variant = `sku`.
- Brand = Vendor name on ProductItem.
- MNK and Cool Planet already follow the same shop-warehouse rules; no merge of those two shops in this change.
- Supplement Vault SMS double-check, Dump 2 phone, and unrelated district bugs are out of scope.
- Snapshot stores positive bins only; missing SKU+warehouse means qty 0.
- Schema migrate is created in-repo; deploying to vault / cosmo-dev / cosmo-prod waits for explicit user confirmation.
