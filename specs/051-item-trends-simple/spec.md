# Feature Specification: Item Trends Simple Rebuild

**Feature Branch**: `051-item-trends-simple`

**Created**: 2026-09-07

**Status**: Draft

**Input**: User description: "Redefine Item Trends after manager meeting. One name per location. ERP company = shop warehouse (POS) + main warehouse (online). OOS in range, 50% shop stock vs average sale. Filters: range, item, common vs separate SKU, priority, locations. Location mode and item mode. ROP export. Keep districts (mark order district from shipping address if missing). Keep market gap (used with competitor MCP). Keep overnight stock snapshots with history; pick a date; default yesterday."

**Supersedes UI of**: `047-item-trend-tracking` (super-dashboard chrome) and `050-item-trends-stock-phases` (cluttered multi-tab layout). **Keep**: Districts, market gap, overnight snapshots + history, ROP export. Permission `purchasing.item_trends.read` stays.

## Clarifications

### Session 2026-09-07 (manager meeting)

- Location identity: do **not** show two labels (ERP company code and shop name) for the same place. One display name per warehouse.
- Warehouse model: one ERP company → **Main** (online orders) + **Shop** (POS). 50% cover is mainly for shop warehouses.
- SKU grain: common parent (e.g. ORD04) vs separate variants (ORD04_1, ORD04_2). Search works on both.
- Stock on this page: **overnight warehouse snapshot**, not live ERP as the working figure. Buyer **picks a snapshot date**. **Default = yesterday** (Asia/Colombo). History of nightly captures is kept so they can look back.
- Market gap stays: compact gap vs competitors on item rows (same data used with the competitor MCP / Market Price Compare).
- Districts stay: every completed sale order must have a district. If none stored, resolve from shipping address. Still unknown → Unmapped.
- Page goal: simple tables. Cut KPI/chart super-dashboard chrome and a separate compare overlay (item mode is the warehouse compare).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One simple page with shared filters (Priority: P1)

A buyer opens Item Trends and sees one screen: date range, priority, SKU search, common vs separate SKU, locations, and **snapshot date** (default yesterday). They pick **Location**, **Item**, or **Districts**. Market gap shows on item rows when competitor prices exist. ROP export is available without a separate analytics product.

**Why this priority**: Manager asked for a restructure so anyone can get data without learning the old dashboard.

**Independent Test**: Open the page; snapshot date is yesterday; apply range + one shop; only that shop’s sale/stock/cover rows appear, labeled with a single location name.

**Acceptance Scenarios**:

1. **Given** permitted access, **When** the page loads, **Then** the buyer sees shared filters (range, priority, SKU search, grain, locations, snapshot date defaulting to yesterday) and work modes: Location, Item, Districts, plus ROP export — not a KPI/chart super-dashboard.
2. **Given** a warehouse, **When** it is listed, **Then** it has one display name, not a second company-code prefix such as “LWK - OGF” beside another Cosmo name.
3. **Given** grain = common and search `ORD04`, **When** results load, **Then** ORD04_1 and ORD04_2 roll into ORD04; grain = separate shows each SKU as its own row.

---

### User Story 2 - Location: sale, snapshot stock, %, cover, 50% shop send, OOS (Priority: P1)

The buyer selects location(s) (or all) and a snapshot date (default yesterday). For each item that sold in the range at those shop floors they see: units in range, stock from that night’s snapshot, stock as % of sale, how long stock lasts, and whether shop stock is below 50% of next-week need. OOS = sold in range and snapshot stock ≤ 0 at that shop.

**Why this priority**: Replenishment decision for shop warehouses.

**Independent Test**: Shop sold 14 in 7 days (week need 14), snapshot shop stock 3 → flagged (3 < 7); suggested send 11.

**Acceptance Scenarios**:

1. **Given** selected location(s), range, and snapshot date, **When** the table loads, **Then** each item shows range units, snapshot stock for that date, stock/sale %, cover days, and send flag using `weekNeed = (units / days) × 7` and `shouldSend` when shop stock `< weekNeed × 0.5`.
2. **Given** suggested send, **When** shown, **Then** qty is `ceil(weekNeed − stock)` (fill a full week).
3. **Given** OOS on, **When** listed, **Then** only items with sales in range at that location and snapshot stock ≤ 0 remain.
4. **Given** Main vs Shop, **When** cover is judged for send, **Then** the 50% rule applies to the **shop** warehouse.

---

### User Story 3 - Item: warehouses with snapshot stock vs sale, online first, market gap (Priority: P1)

The buyer selects one item. They see warehouses with snapshot stock (selected date), sale in range, %, cover. **Online / Main first**, then shops. Where competitor prices exist, a **market gap** badge shows (same source as Market Price Compare / competitor MCP). Clicking the badge opens that SKU’s market compare.

**Why this priority**: Same meeting drill: pick the item, compare locations; pricing gap stays in view.

**Independent Test**: Select ORD04; Main/online above shops; gap badge only when competitor data exists.

**Acceptance Scenarios**:

1. **Given** one selected item and a snapshot date, **When** warehouse rows load, **Then** online/main appear before shops, each with snapshot stock, range sale, %, cover days.
2. **Given** common grain, **When** the item is a parent (ORD04), **Then** warehouse figures sum variants unless a single variant SKU is selected.
3. **Given** competitor prices on file for that SKU, **When** the row is shown, **Then** a compact market gap badge appears; with no competitor data, no badge.
4. **Given** the buyer clicks the gap badge, **When** navigation runs, **Then** they land on Market Price Compare for that SKU.

---

### User Story 4 - Historical stock snapshots (Priority: P1)

Nightly job keeps capturing warehouse bins. The buyer is not stuck on “latest only”: they pick any stored snapshot date. Opening the page uses **yesterday**. If yesterday has no capture yet, show the latest available night and say so. History is retained (not wiped to a single day).

**Why this priority**: Without history, “stock at that time” cannot be reviewed later.

**Independent Test**: After captures for D-1 and D-3 exist, pick D-3; stock columns match D-3 bins, not D-1.

**Acceptance Scenarios**:

1. **Given** the page loads with no date chosen, **When** stock is shown, **Then** the snapshot date is yesterday (Asia/Colombo) if that capture exists.
2. **Given** captures for several nights, **When** the buyer picks an older date, **Then** Location and Item stock columns use that night only.
3. **Given** yesterday has no snapshot, **When** the page loads, **Then** stock is not invented; UI states no snapshot for that date and offers the latest stored night.
4. **Given** a permitted Capture now, **When** it succeeds, **Then** that calendar date’s snapshot is stored (replacing that date’s prior capture) and remains selectable in history.

---

### User Story 5 - Districts from every order (Priority: P1)

A buyer opens **Districts** for the selected range. Every completed sale order is counted in a district. Stored district wins; else shipping address (province, then city/text). Still unknown → **Unmapped**. New orders get district marked at save time.

**Why this priority**: Blank districts make demand by area a lie.

**Independent Test**: `province: Colombo` → Colombo. Empty province + “Kiribathgoda” → Gampaha. No address → Unmapped.

**Acceptance Scenarios**:

1. **Given** an order with a stored district, **When** Districts loads, **Then** its units land in that district.
2. **Given** no stored district and a shipping address, **When** Districts loads, **Then** district is resolved from that address.
3. **Given** neither, **When** listed, **Then** Unmapped, not dropped.
4. **Given** new orders after this change, **When** saved, **Then** district is marked using the same address rules.

---

### User Story 6 - ROP suggestions export (Priority: P2)

The buyer exports suggested ROP. Current ROP is the **total** across saved columns.

**Independent Test**: Export CSV includes SKU, current total ROP, suggested ROP.

**Acceptance Scenarios**:

1. **Given** saved column ROPs 10 and 20, **When** ROP is shown, **Then** current ROP is 30.
2. **Given** visible suggestion rows, **When** export is used, **Then** a CSV downloads for those rows.

---

### Edge Cases

- Snapshot missing for the chosen date: stock/cover/OOS/send show unavailable for that date; buyer can pick another night.
- Days in range = 0: reject the range.
- SKU+warehouse absent in that night’s snapshot: stock = 0.
- Common parent with no underscore variants: that SKU is its own group.
- POS with no shipping address: stored district or Unmapped.
- Town not in city→district map: Unmapped until the map is extended.
- No competitor data: no market gap badge (not an error).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Item Trends MUST be one simple page with shared filters: date range, priority, SKU search, common vs separate SKU, all vs selected locations, snapshot date.
- **FR-002**: Each warehouse MUST have a single display name; the page MUST NOT pair a company code with a second shop name for the same place.
- **FR-003**: Each ERP company in scope MUST be treated as **Main** (online orders) and **Shop** (POS), using stored ERP instance + warehouse mapping already in Cosmo.
- **FR-004**: Stock figures on Location and Item views MUST come from the ERP overnight snapshot for the **selected snapshot date** (default yesterday, Asia/Colombo), not live ERP on page load.
- **FR-005**: Location view MUST show, per item: range sale, snapshot stock, stock/sale %, cover days, 50% send flag (shop), suggested send qty.
- **FR-006**: Send math MUST be `weekNeed = (unitsInRange / daysInclusive) × 7`, flag when shop stock `< weekNeed × 0.5`, suggested qty `ceil(max(0, weekNeed − stock))`.
- **FR-007**: OOS-in-range MUST mean sold in range at that location and snapshot stock for the selected date ≤ 0.
- **FR-008**: Item view MUST list warehouses with snapshot stock, range sale, stock/sale %, cover days; sort online/main before physical shops.
- **FR-009**: Common SKU MUST group variants that share a parent code (example: ORD04 groups ORD04_1, ORD04_2); separate SKU lists each variant; search matches parent or variant.
- **FR-010**: Priority filter MUST restrict to the selected product priority (including all).
- **FR-011**: ROP current value MUST be the sum of saved OSF ROP columns; the page MUST offer CSV export of suggestions.
- **FR-012**: Item Trends MUST include a Districts view: range sales rolled by customer district, with drill into items in a district.
- **FR-013**: Every completed sale order MUST have a district when one can be known: stored district if present; otherwise shipping address (province, then city/text). Persist when blank.
- **FR-014**: Orders that cannot be resolved MUST appear as Unmapped in Districts, not omitted.
- **FR-015**: Nightly snapshot capture MUST continue; snapshots MUST be retained as history (not only the latest night). The UI MUST let the buyer choose any stored snapshot date; default yesterday.
- **FR-016**: Re-capturing a date MUST replace that date’s snapshot only; other dates stay.
- **FR-017**: Item and location item rows MUST show a compact market-gap badge when competitor pricing exists (same data as Market Price Compare / competitor MCP); badge MUST open that SKU’s market compare. No data → no badge.
- **FR-018**: The rebuilt page MUST NOT include movement-super-dashboard KPIs/charts or a separate “compare overlay” — item view is the warehouse compare.

### Key Entities

- **LocationWarehouse**: One named warehouse: Main (online) or Shop (POS) under one ERP company / Cosmo mapping.
- **ErpStockSnapshot**: One night’s on-hand qty for company + date + SKU + warehouse. Many dates kept.
- **CoverRow**: Item × shop with range units, snapshot stock, week need, 50% flag, send qty, cover days, OOS.
- **CommonSku**: Parent item code that rolls variants (ORD04 → ORD04_1, ORD04_2).
- **RopSuggestion**: SKU with current total ROP and suggested next ROP.
- **OrderDistrict**: District marked on the order; filled from shipping address when missing.
- **MarketGap**: Competitor vs our price (OGF default) for a SKU, already used by Market Price Compare / MCP.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new buyer can answer “for this shop, which items need stock this week?” in under 2 minutes using Location mode + yesterday snapshot + 50% send.
- **SC-002**: A new buyer can answer “for this SKU, where is stock vs sale?” in under 2 minutes using Item mode, with Main/online above shops.
- **SC-003**: Searching ORD04 in common grain returns the parent group; switching to separate SKU shows ORD04_1 and ORD04_2 as their own rows.
- **SC-004**: Location names on the page match one label people already use; no duplicate company+shop caption.
- **SC-005**: OOS list only includes items that sold in the range at that shop and have zero snapshot stock on the selected date.
- **SC-006**: ROP export produces a usable CSV; current ROP equals summed column ROPs.
- **SC-007**: For a known range, Districts totals match completed sales; readable shipping addresses are not left Unmapped when they name a known district or town.
- **SC-008**: Changing snapshot date from yesterday to an older stored night changes stock/%/cover to that night within one interaction.
- **SC-009**: SKUs with competitor prices show a market gap; SKUs without do not.

## Assumptions

- “Monthly sale” = units in the selected date range (buyer picks a calendar month when they want a month).
- 50% rule is for **shop** warehouses; Main/online is shown for cover (online first) but is not the send-to-shop target.
- Cosmetics.lk shop-floor warehouses appear as shops; website/main remains online.
- Snapshot date and sales range are independent: sales = From/To; stock = chosen night (default yesterday).
- Snapshot retention stays **90 days** unless purchasing asks for longer.
- Capture now (OSF manage) still allowed; it writes today’s Colombo date into history.
- Market gap uses existing competitor catalog (OGF layer default), not a new scrape on this page.
- Parent SKU grouping uses the item-code stem (ORD04 / ORD04_1).
- Brand filter is not required for v1 unless it is a one-click add on the same filter bar.
- SMS and Dump 2 phone stay out of this feature.
- Existing Item Trends permission and route stay.
- District resolution reuses existing Sri Lanka province / city / address-text rules.
- Existing completed orders with blank district are filled from shipping address (backfill + read fallback).
