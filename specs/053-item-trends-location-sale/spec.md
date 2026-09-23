# Feature Specification: Item Trends Location-Wise Sale Columns

**Feature Branch**: `053-item-trends-location-sale`

**Created**: 2026-09-14

**Status**: Draft

**Input**: User description: "in item trend page we have to change bit, we have to show item tren column ROp(location wise common SKU ROP) sale count (given date range sale count should change) stock count(snapshot or live depend on filters) remove stock sale, need week need count, last 30 days avg sale/stock answer * stock to cover days, no need send column, market gap remove,(main focus location wise sale) new Speckit"

**Supersedes UI columns of**: `051-item-trends-simple` Location (cover) table — stock/sale %, Send, Market gap. **Keep**: shared filters, snapshot vs live stock source, common vs separate SKU, week-need math base, Districts and ROP export elsewhere unless noted. Permission `purchasing.item_trends.read` stays.

## Clarifications

### Session 2026-09-14 (buyer focus)

- **Primary surface**: Location-wise sale table (item × location rows). Column set is rebuilt around replenishment answers, not pricing or send suggestions.
- **ROP on row**: Show **current location ROP** for the **common SKU** at that location (saved OSF / warehouse column ROP). Common grain rolls variants under one parent; separate grain shows that SKU’s ROP at the location.
- **Sale count**: Units sold in the **selected date range** at that location. Changing From/To MUST change this number.
- **Stock count**: On-hand qty from **snapshot** or **live ERP**, whichever stock source the filters already choose. Label must make source clear.
- **Remove**: Stock/sale %, Send flag / suggested send qty, Market gap badge (and any send-only filter tied only to that column).
- **Keep**: Week need count (still derived from range pace × 7 days).
- **Add / redefine**: Last **30 calendar days** average daily sale (fixed lookback, independent of selected range), and **cover days** = stock ÷ that 30-day average daily sale (stock-to-cover-days).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Location table shows sale-focused columns (Priority: P1)

A buyer opens Item Trends in Location mode, picks locations and a date range, and reads one row per item × location with: ROP, sale count (range), stock count, week need, last-30-day avg daily sale, and stock cover days. Stock/sale %, Send, and Market gap are gone.

**Why this priority**: Manager wants location-wise sale as the main decision view; old % / send / gap columns clutter that answer.

**Independent Test**: Open Location mode for one shop and a 7-day range; table headers and cells match the new set only; no Stock/sale, Send, or Market gap columns.

**Acceptance Scenarios**:

1. **Given** Location mode with results, **When** the table renders, **Then** columns are Item, Location, ROP, Sale, Stock, Week need, Last 30d avg sale, Cover days (plus existing drill actions if any) — and **not** Stock/sale, Send, or Market gap.
2. **Given** a row with known range units and stock, **When** shown, **Then** Sale equals units in the selected range at that location and Stock equals the filtered stock source qty for that SKU × location.
3. **Given** common SKU grain with variants at one location, **When** the parent row shows, **Then** Sale, Stock, Week need, Last 30d avg, and Cover days roll up child variants; ROP is the common-SKU location ROP (not a sum of unrelated columns).

---

### User Story 2 - Sale count follows the selected date range (Priority: P1)

The buyer changes From/To. Sale count and week need (range-based) refresh for the new range. Last-30-day avg sale and cover days stay based on the fixed 30-day lookback, not the selected range length.

**Why this priority**: “Given date range sale count should change” is the core sale focus.

**Independent Test**: Same shop/SKU; 7-day range shows sale S7; switch to 30-day range shows sale S30 ≠ S7 when history differs; last-30 avg column stays the same for both loads (same “as of” day).

**Acceptance Scenarios**:

1. **Given** filters otherwise fixed, **When** the buyer shortens or lengthens the date range, **Then** Sale and Week need recalculate from the new range.
2. **Given** the same load moment, **When** only the selected range changes, **Then** Last 30d avg sale does not change solely because the selected range changed.
3. **Given** days in range = 0 or invalid, **When** applied, **Then** the page rejects or blocks the range (no invented sale).

---

### User Story 3 - Stock is snapshot or live from filters (Priority: P1)

The buyer uses existing stock-source controls. Stock column shows overnight snapshot qty when snapshot mode is on, or live ERP qty when live mode is on. Cover days use that same stock figure.

**Why this priority**: Stock answer must match what buyers already trust from filters.

**Independent Test**: Toggle snapshot → live for one SKU/location; Stock (and Cover days) change to the live figure; Sale and Last 30d avg unchanged.

**Acceptance Scenarios**:

1. **Given** stock source = snapshot and a selected snapshot date, **When** rows load, **Then** Stock is that night’s on-hand for the SKU at the location.
2. **Given** stock source = live, **When** rows load, **Then** Stock is current ERP on-hand (not the night snapshot), and the UI states live stock.
3. **Given** snapshot missing for the chosen date, **When** snapshot mode is active, **Then** Stock/Cover are unavailable for that row/date (not silently live).

---

### User Story 4 - Week need, 30-day avg, and cover days (Priority: P1)

For each location row the buyer sees week need from range pace, last-30-day average daily sale, and how many days current stock lasts at that 30-day pace.

**Why this priority**: Replaces stock/sale % and send with clearer pace and cover answers.

**Independent Test**: Range sold 14 over 7 days → week need 14. Last 30 days sold 60 → avg daily 2. Stock 10 → cover days 5.

**Acceptance Scenarios**:

1. **Given** units in range and days in range > 0, **When** Week need is shown, **Then** it equals `(unitsInRange / daysInRange) × 7`.
2. **Given** last-30-day units at that location for the SKU (common rollup when grain = common), **When** Last 30d avg sale is shown, **Then** it equals `last30Units / 30` (zero when no sales).
3. **Given** stock qty and last-30 avg daily > 0, **When** Cover days is shown, **Then** it equals `stockQty / last30AvgDaily` (rounded sensibly); if avg daily is 0, Cover days is unavailable (—), not infinity.
4. **Given** the page, **When** reviewing columns, **Then** no Send quantity/flag and no Market gap badge appear on Location rows.

---

### User Story 5 - Location-wise common SKU ROP column (Priority: P1)

Each location row shows the saved ROP for that location’s warehouse column for the common SKU (or the specific SKU in separate grain). Buyers compare sale/stock to ROP without leaving the location table.

**Why this priority**: Explicit ask for ROP on the item trend location row.

**Independent Test**: Location column with ROP 25 for ORD04; common grain row for ORD04 at that location shows ROP 25.

**Acceptance Scenarios**:

1. **Given** a saved ROP for location L and common parent P, **When** grain = common and row is P at L, **Then** ROP shows that saved value.
2. **Given** grain = separate and variant V at L, **When** shown, **Then** ROP is V’s ROP at L (not the parent’s unless that is how OSF stores it today).
3. **Given** no ROP saved for that SKU × location, **When** shown, **Then** ROP is empty/unavailable (—), not invented.

---

### User Story 6 - Item mode stays consistent without gap/send/% (Priority: P2)

Item (warehouse compare) mode keeps Main/online first and location sale/stock focus. It MUST NOT show Market gap, Send, or Stock/sale % either, so buyers are not pulled back into removed signals.

**Why this priority**: Same product language across modes; primary work is still Location.

**Independent Test**: Open Item mode for one SKU; no Market gap, Send, or Stock/sale columns.

**Acceptance Scenarios**:

1. **Given** Item mode, **When** warehouse rows load, **Then** sale, stock, week need, last-30 avg, cover days (and ROP if shown) appear without Stock/sale, Send, or Market gap.
2. **Given** competitor prices exist, **When** Item Trends rows render, **Then** no market-gap badge is shown on this page (Market Price Compare remains the place for gap).

---

### Edge Cases

- Selected range longer or shorter than 30 days: Sale uses range; Last 30d avg always uses the last 30 calendar days ending on the page’s “as of” sales day (Asia/Colombo), not the selected range length.
- Zero sales in last 30 days: Last 30d avg = 0; Cover days = —.
- Zero sales in selected range: Sale = 0; Week need = 0; row may still show if stock or ROP policy includes it — if current Location mode only lists items that sold in range, keep that behavior.
- Common grain with one location and many variants: numeric columns sum (or ROP uses common location ROP as defined above); do not double-count ROP by summing variant ROPs unless OSF stores only per-variant and common has none — then show — or the single shared value when variants share one column ROP.
- Live stock failure: show stock unavailable; do not fall back to snapshot without telling the buyer.
- Snapshot date with missing SKU bin: stock = 0 for cover math.
- Send-only filter: remove or disable if it only filtered on the removed Send flag; OOS filter may remain if still used.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Location mode MUST present item × location rows focused on location-wise sale, with columns: Item, Location, ROP, Sale (range), Stock, Week need, Last 30d avg sale, Cover days.
- **FR-002**: Location mode MUST NOT show Stock/sale %, Send (flag or suggested qty), or Market gap.
- **FR-003**: Sale MUST equal completed sale units for the SKU (per grain) at that location in the **selected date range**, and MUST update when the range changes.
- **FR-004**: Stock MUST come from the active stock-source filter: overnight snapshot for the selected snapshot date, or live ERP on-hand; the UI MUST indicate which source is active.
- **FR-005**: Week need MUST equal `(saleUnitsInRange / daysInRange) × 7` when daysInRange > 0.
- **FR-006**: Last 30d avg sale MUST equal total units sold at that location for the SKU (per grain) over the last 30 calendar days (Asia/Colombo) divided by 30, independent of the selected analysis range length.
- **FR-007**: Cover days MUST equal `stockQty / last30AvgDaily` when last30AvgDaily > 0; otherwise Cover days MUST be unavailable. Cover days MUST use the same Stock value as FR-004.
- **FR-008**: ROP MUST show the saved location-wise ROP for the common SKU (common grain) or the row SKU (separate grain) at that location’s warehouse column.
- **FR-009**: Common SKU grain MUST continue to roll variant sale/stock/week-need/30d averages into the parent row at a location; ROP MUST follow FR-008 (common location ROP), not a misleading sum of unrelated ROPs.
- **FR-010**: Item mode MUST also omit Market gap, Send, and Stock/sale %; location sale/stock answers remain the priority language.
- **FR-011**: Existing shared filters (range, priority, SKU search, grain, locations, snapshot date / live stock) MUST continue to drive the Location table except filters that exist only for removed Send behavior.
- **FR-012**: Market Price Compare / competitor MCP remain available as separate products; Item Trends MUST NOT surface market gap on these rows.
- **FR-013**: Access control MUST remain `purchasing.item_trends.read` (and existing admin/purchasing bypasses); this feature does not change who can open the page.

### Key Entities

- **LocationSaleRow**: Item × location answer: ROP, range sale units, stock qty, week need, last-30 avg daily sale, cover days, grain key, location label.
- **LocationRop**: Saved ROP for a SKU (or common parent) at a warehouse/location column.
- **RangeSale**: Units in buyer-selected From/To at a location.
- **Trailing30Sale**: Units in the fixed last-30-day window at a location; drives avg daily and cover days.
- **StockReading**: Snapshot-night or live ERP on-hand for SKU × location, selected by filter.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A buyer can answer “for this shop, what sold in my range, what stock do I have, what’s ROP, and how many days will stock last at recent pace?” from Location mode in under 2 minutes without using Stock/sale, Send, or Market gap.
- **SC-002**: Changing only the date range updates Sale (and Week need) within one refresh; Last 30d avg does not flip solely because range length changed.
- **SC-003**: Switching stock source between snapshot and live changes Stock and Cover days to match that source while Sale stays range-based.
- **SC-004**: For a fixture row (14 units / 7 days, 60 units last 30 days, stock 10), Week need = 14, Last 30d avg = 2, Cover days = 5.
- **SC-005**: Location table has zero visible Stock/sale, Send, or Market gap columns in default and filtered views.
- **SC-006**: Common-grain parent at a location shows the location’s common SKU ROP when one is saved.
- **SC-007**: New buyers do not need Market Price Compare to use Location mode for sale/stock/ROP/cover decisions.

## Assumptions

- “Last 30 days” = trailing 30 calendar days ending on the sales “as of” day in Asia/Colombo (typically today or yesterday consistent with existing Item Trends sales cut), not “calendar month” and not the selected analysis range.
- Cover days **stop** using selected-range average daily sale; they use last-30 avg daily only (range still drives Sale and Week need).
- Week need formula stays `(unitsInRange / days) × 7`; the 50% send rule and suggested send qty are retired from this UI (backend may keep unused fields until cleaned in plan/tasks).
- Stock source toggle / snapshot date behavior from `051` / `050` stays; this feature only binds Stock and Cover days to that choice.
- Location-wise ROP = existing OSF / warehouse column ROP already used on ROP export; no new ROP formula inventing on this page.
- Common SKU ROP means the ROP stored for the parent/common key at that location when grain = common; if only variants have ROP and parent has none, show — unless product already maps parent↔variant ROP (reuse existing mapping, do not invent).
- OOS highlighting may remain as a row state if useful, but not via a Send column.
- Districts view and separate ROP export panel are out of scope for column removal unless they embed the same Location table chrome.
- Brand filter, SMS, Dump 2 phone stay out of scope.
- No change to nightly snapshot capture retention (90 days) or permission model.
