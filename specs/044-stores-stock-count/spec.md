# Feature Specification: Store Stock Count

**Feature Branch**: `044-stores-stock-count`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "we have updated stock in erp no? we use 4 erps 2erps for one OS, we can get updated stock from them, now i have new feature for stores stock count, we can select companies in OS coming from erp side companies, we can selec multiple companies after select all items should load to ui with real time updated stock company wise, also data ge item sku, name, description, barcode stock, count we have input field we can type barcode also without anything we scan barcode in that page matchin barcode item should highlight and every time same barcode scan that matching item count should up this process not for single item we can scan multiple items scaned barcode change that item count qty, also another field we have to see differance between count and real time stock"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pick ERP companies and load items with live stock (Priority: P1)

A store user opens **Store stock count**, sees **companies as they exist in the ERP systems connected to this OS** (not a handmade local list), and selects one or more of those companies. After they confirm the selection, the page loads **every item** that belongs to the selected companies. Each item shows SKU, name, description, barcode, and **current on-hand stock broken out by selected company**. Stock is the live ERP figure, not a stale shop-floor copy.

**Why this priority**: Count work cannot start until the right company set is chosen and every item is on screen with trustworthy stock.

**Independent Test**: Select one company and confirm items + that company’s live stock. Select two companies and confirm the same items show stock for each selected company. Change ERP stock for a known item, refresh, and confirm the new figure appears.

**Acceptance Scenarios**:

1. **Given** this OS has connected ERPs that expose companies, **When** the user opens Store stock count, **Then** they can choose from those ERP companies and may select more than one.
2. **Given** one or more companies are selected, **When** the user confirms load, **Then** the list contains all items for those companies (including zero-stock items), each with SKU, name, description, barcode (when the item has one), and live stock per selected company.
3. **Given** two companies are selected and an item exists in both, **When** the list is shown, **Then** that item appears once with a stock figure for each company, not as two unrelated products.
4. **Given** an item exists in only one of the selected companies, **When** the list is shown, **Then** the other company’s stock for that item is shown as zero or blank, not as invented stock from another company.
5. **Given** no company is selected, **When** the page is viewed, **Then** the item list is empty and the user is prompted to select companies first.
6. **Given** a user without store stock-count access, **When** they open the page, **Then** they are denied.

---

### User Story 2 - Scan or type barcodes to count many items (Priority: P1)

On the same page a barcode field accepts typed codes and hardware scanner input (scanner acts like a keyboard and ends with Enter). The user does not have to fill anything else first: with the field focused they scan. Each scan that matches a loaded item **highlights that row** (and brings it into view) and **adds 1 to that item’s count**. They repeat for the same barcode to keep adding, and they scan other barcodes to count other items in the same session. Count is not limited to a single item.

**Why this priority**: This is the floor workflow. Physical count is a stream of scans, not one-item-at-a-time search.

**Independent Test**: Load a list that includes items A and B with known barcodes. Scan A three times, scan B once, type A’s barcode and confirm; counts are A=4, B=1; the last matched row is highlighted.

**Acceptance Scenarios**:

1. **Given** the item list is loaded and the barcode field is focused and empty, **When** the user scans a barcode that matches a loaded item, **Then** that item is highlighted, scrolled into view if needed, and its count increases by 1.
2. **Given** the same item was just counted, **When** the user scans that barcode again, **Then** that item’s count increases by 1 again (2, then 3, and so on) and it remains the highlighted row.
3. **Given** item A has count 2, **When** the user scans item B’s barcode, **Then** B’s count becomes 1 (or increases by 1 if already counted), B is highlighted, and A’s count stays 2.
4. **Given** the user types a full barcode into the field and confirms (Enter), **When** it matches a loaded item, **Then** the same highlight-and-increment behavior as a scan occurs, and the field clears for the next code.
5. **Given** a scanned or typed barcode matches no loaded item, **When** confirmed, **Then** the user sees a clear “not found” message, no row is incremented, and the field is ready for the next scan.
6. **Given** a scan occurs before companies are loaded, **When** the user scans, **Then** they are told to select companies first; nothing is counted.

---

### User Story 3 - See difference between count and live stock (Priority: P1)

Each item shows a **difference** of counted quantity versus that item’s live ERP stock for the selected companies. Difference updates whenever count changes or live stock is refreshed. Uncounted items do not look like shortages.

**Why this priority**: The point of the count is to see over/short versus ERP, item by item, while still counting.

**Independent Test**: Set an item’s live stock to 10, leave count empty (difference blank). Scan twice (count 2, difference −8). Type count 10 (difference 0). Refresh stock to 9 without changing count (difference +1).

**Acceptance Scenarios**:

1. **Given** an item has not been counted yet (count empty), **When** the list is viewed, **Then** difference is blank or “not counted”, not treated as a shortage against stock.
2. **Given** live stock for the selected companies totals 10 and the user has counted 7, **When** the row is viewed, **Then** difference is **−3** (count minus live stock).
3. **Given** live stock totals 10 and the user has counted 12, **When** the row is viewed, **Then** difference is **+2**.
4. **Given** live stock totals 10 and the user has entered count **0** (explicitly counted none), **When** the row is viewed, **Then** difference is **−10**, distinct from an uncounted row.
5. **Given** live stock later changes in ERP, **When** the user refreshes stock without changing counts, **Then** stock and difference update and counts stay as entered.

---

### User Story 4 - Type count by hand (Priority: P2)

Store users can type a number into the count field when a barcode is missing, damaged, or when they already know the pile size. Typed count **sets** the quantity (it does not add on top of itself). Scans after a typed value still add 1 each time.

**Why this priority**: Not every unit or item is scannable; the count must still be completable.

**Independent Test**: For an item with no barcode, type 5 in count; difference uses 5. Scan a different item; the typed 5 is unchanged.

**Acceptance Scenarios**:

1. **Given** a loaded item, **When** the user types 8 into count and leaves the field, **Then** count is 8 and difference uses 8 versus live stock.
2. **Given** count is 8, **When** the user scans that item’s barcode, **Then** count becomes 9.
3. **Given** an item has no barcode, **When** the user counts, **Then** they can only change count by typing (scans never hit this row unless a barcode is later present).
4. **Given** a non-numeric or negative value, **When** entered, **Then** it is rejected and the previous valid count is kept.

---

### User Story 5 - Keep counting while stock stays current (Priority: P2)

The user can refresh live stock for the selected companies without losing counts, highlights, or the company selection. Changing the company set reloads items and warns if existing counts would be discarded.

**Why this priority**: ERP stock moves during a count; the difference is only useful if stock can be refreshed mid-session.

**Independent Test**: Count several items, refresh stock, confirm counts remain. Change companies with counts present; user is warned and must confirm before counts are cleared.

**Acceptance Scenarios**:

1. **Given** counts in progress, **When** the user refreshes live stock, **Then** company-wise stock and difference update and all counts remain.
2. **Given** counts in progress, **When** the user changes the company selection and confirms reload, **Then** the list reloads for the new companies and previous counts are cleared.
3. **Given** counts in progress, **When** the user starts to change companies then cancels, **Then** the current list and counts stay.
4. **Given** the user chooses to clear all counts, **When** confirmed, **Then** every count returns to empty (not counted) and differences return to the not-counted state; stock is unchanged.

---

### Edge Cases

- Scanner sends Enter at the end of the code; a trailing Enter must count once, not twice.
- Empty barcode confirm (field blank + Enter) is ignored; no error spam.
- Two different SKUs sharing one barcode: no silent increment; user is told the code is ambiguous and must pick the row or type count.
- One SKU with several barcodes: any of those barcodes matches that item.
- Very large catalogs: the full selected-company item set is still available to count; the user can keep scanning without hunting the row by hand (highlight + scroll does the finding).
- Item with live stock below zero in ERP: still listed; difference uses that negative stock.
- Fractional ERP stock: difference uses the same unit as ERP (typically whole pieces); typed count allows only whole non-negative numbers.
- ERP unreachable or a selected company’s stock cannot be read: the user sees a clear failure for that company; already-loaded counts are not wiped; stock cells for the failed company show as unavailable, not zero pretending to be a true count of none.
- Duplicate company names across the two ERPs connected to this OS: each company remains selectable as a distinct ERP company (label includes enough identity to tell them apart).
- Leaving and returning to the page: v1 does not restore counts; counts live in the current session only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Store users with access MUST be able to open Store stock count and select one or more **ERP companies** exposed by the ERP systems connected to **this** OS (two ERPs per OS; companies from the other OS’s ERPs are not listed).
- **FR-002**: After company selection is confirmed, the system MUST load all items for those companies into the counting list.
- **FR-003**: Each list row MUST show SKU, name, description, barcode(s), live stock **per selected company**, a count input, and a difference vs live stock.
- **FR-004**: Live stock MUST be current on-hand quantity from ERP for that company, not shop-copy or last-synced store inventory.
- **FR-005**: The page MUST provide a barcode field that accepts typed entry and scanner (keyboard-wedge) input without requiring another field to be filled first.
- **FR-006**: A confirmed barcode that uniquely matches a loaded item MUST highlight that row, bring it into view, increment count by 1, and clear the barcode field.
- **FR-007**: Repeated scans of the same barcode MUST keep incrementing that same item’s count; scans of other barcodes MUST increment those other items in the same session.
- **FR-008**: A barcode that matches no loaded item MUST show a not-found outcome and MUST NOT change any count.
- **FR-009**: Users MUST be able to type a whole non-negative number into count to set that item’s counted quantity.
- **FR-010**: Difference MUST equal **count − live stock for the selected companies** (sum of the company-wise stock figures shown on that row) once the item is counted; uncounted items MUST NOT show a numeric shortage.
- **FR-011**: Users MUST be able to refresh live stock without losing counts.
- **FR-012**: Changing selected companies MUST require confirmation when counts exist, then reload items and clear counts.
- **FR-013**: Users MUST be able to clear all counts in the session without changing company selection or live stock.
- **FR-014**: Users without Store stock count access MUST NOT see item stock or record counts.
- **FR-015**: This feature MUST NOT post, adjust, or overwrite ERP stock from the count in v1; it is a counting and comparison worksheet only.

### Key Entities

- **ERP Company (selectable)**: A company record from an ERP connected to this OS. Multi-select. Stock and item membership are scoped to the selected set.
- **Count item**: One row per SKU across the selected companies. Attributes: SKU, name, description, barcode(s), live stock per selected company, counted quantity, difference.
- **Live stock**: Current on-hand quantity in ERP for that item in that ERP company.
- **Counted quantity**: Session value for how many units the store has counted. Empty = not yet counted; 0 = counted none; each successful scan adds 1.
- **Difference**: Counted quantity minus the sum of live stock shown for selected companies, only when counted quantity is set.
- **Count session**: The in-progress worksheet (company selection, item list, counts). Exists for the current visit; not a saved historical count document in v1.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After companies are selected, a store user can complete the first successful barcode count (highlight + count 1) in **under 1 minute** of the list becoming available, using either a scanner or typed barcode.
- **SC-002**: In a scripted pass of **20 scans** across at least **5 different items** (including repeats of the same barcode), **100%** of unique matches increment the correct item only, and the last matched row is highlighted.
- **SC-003**: For **15** items with known live stock and known counts (empty, 0, less than stock, equal, greater), difference matches **count − live stock** in **100%** of counted rows, and **100%** of uncounted rows show no numeric shortage.
- **SC-004**: After an ERP on-hand change on a counted item, a stock refresh updates stock and difference in **100%** of a 10-item sample while preserving every count.
- **SC-005**: Unknown barcodes produce a not-found outcome and **0** wrong increments in a 10-code negative test.
- **SC-006**: Unauthorized users are denied in **100%** of access checks.
- **SC-007**: Store users rate the scan-and-difference flow as usable for a real shelf count (target: at least **80%** of participating store users in a short floor trial say they can finish a typical bay without a second tool).

## Assumptions

- Actors are **store** users (same audience as store location allocation) plus admins who grant that access. This is not a merchant or rider screen.
- “Companies in OS coming from ERP side” means **ERP company names** from the ERPs linked to the current OS tenant. Each OS uses two of the four ERPs; the picker only lists companies from those two.
- Selecting multiple companies **unions** their item catalogs. One row per SKU. Stock is shown **company-wise**. One count per SKU. Difference uses the **sum** of the selected companies’ live stock for that SKU. If a store is counting a single shop, they select that shop’s ERP company only.
- Live stock for a company is ERP **on-hand for that company** as ERP reports it (company-level, not a separate warehouse picker in v1). If an ERP company is one store, that is the store’s stock.
- Item identity (SKU, name, description, barcode) comes from ERP item data for the selected companies, so barcodes used on the floor match what ERP holds.
- “Real time” means current ERP on-hand at load and on explicit refresh, not a delayed daily file. The page does not have to push a new number on every ERP keystroke without refresh.
- Barcode hardware is a keyboard-wedge scanner on the stock-count page, same idea as store location allocation.
- v1 does **not** create ERP stock reconciliations, stock entries, or warehouse transfers from this count. Over/short is visible on screen only.
- Counts are **session-only**. No named saved count, no audit history of past counts in v1.
- Zero-stock items still load so extras found on the floor can be scanned.
- Shopify/OS on-hand is not the stock column; ERP is the source of truth for this feature.
- Whole-unit counting (pieces). No serial/batch capture in v1.
- Changing ERPs or credentials is out of scope; this feature consumes already-working ERP connections used elsewhere for live stock.
