# Feature Specification: Material Transfer Counts and Shop Returns

**Feature Branch**: `065-material-transfer-counts`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "new feature/task name branch, want add beep sound for mismatch barcode read, also count should be editable, in history and shop can see item barcode, cant add more than avilable quantity, if try add beep sound, scaned barcode should came top of list with highlighting, also count and available count match it should maark grean border, other keep normal, shops can mark count less or more than what we sent, if we sent 3 item shop mark 2 or 4 items its mismatch add filter for stores also shops mismatch filter then they can see waht are the misatch transfers with items, also another process shops can send items to main also in their UI show only that merchan allocated outlet shop warehouse to main warehouse and scan items and send, for that they can see thei available qty also they cant sen more than available same as what we use in now fro main to shop transfer, but shop to main outlets cant create any erp side material transfers, shop to main transfer should came to stores user for stores user reminder bubble also then they can scan and count wha tey received and confir for erp metirai transfer, then it create erp meterial transfer, now we click on entry it open items what we sent to shop and shops click it open items what they received for stores when they click on entry it should open erp transfer, when they click on row it should open items list, after shop receved items they scan it and mark received who scaned and mark it should show to stores, also shop can change count on their side before mark recieved. when merchant send items shop to main only, they can send main to shop, also their request not create erp meterial transfer"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Scan and count a store-to-shop send (Priority: P1)

A stores user is sending stock from a warehouse to a shop. They pick the source and target, then scan barcodes or type a SKU. Each accepted scan adds 1. They can also type the quantity. They cannot put more on the transfer than the source warehouse currently has. A bad scan or an attempt to go over that available quantity makes a short error beep and does not change the list. The scanned line jumps to the top and stays highlighted. A line whose quantity equals the available quantity gets a green border. Other lines stay in the normal style. When they submit, the confirmation shows every line and marks each line whose quantity is lower than the available quantity at the main warehouse, so they can see they are not sending the full amount on hand. They can still submit.

**Why this priority**: The floor already sends this way. Wrong beeps and silent over-sends cause the stock books and the box to disagree.

**Independent Test**: On a store-to-shop transfer from main, scan a known barcode, scan an unknown barcode, type a quantity equal to available, and try to type one more than available. Confirm the beep, the block, the highlight, and the green border. Then submit with one line below main’s available quantity and one line equal to it. Confirm the confirmation marks only the lower line, and the send still goes through.

**Acceptance Scenarios**:

1. **Given** a source warehouse is selected and an item there has available quantity 5, **When** the user scans that item’s barcode, **Then** the line is added or increased by 1, moves to the top of the list, and is highlighted.
2. **Given** the same line now has quantity 5, **When** the user looks at the list, **Then** that line has a green border and lines whose quantity is not equal to available stay in the normal style.
3. **Given** the line quantity is already equal to available, **When** the user scans again or types a higher quantity, **Then** the quantity stays at the available amount, an error beep plays, and the user sees that they cannot send more than available.
4. **Given** the user scans or types a code that is not an item they can send, **When** the scan is read, **Then** no line is added, an error beep plays, and the user sees that the barcode does not match.
5. **Given** a line is on the list, **When** the user edits the quantity by hand to any whole number from 1 up to available, **Then** the new quantity is kept.
6. **Given** the source is the main warehouse and the list has a line below that warehouse’s available quantity and a line equal to it, **When** the stores user starts submit, **Then** the confirmation shows the items and marks the line whose quantity is lower than main’s available quantity. The matching line is not marked as low.
7. **Given** that confirmation is showing, **When** the stores user continues, **Then** the stock books still receive a material transfer for the quantities they entered.

---

### User Story 2 - Shop counts what arrived (Priority: P1)

A shop user whose staff profile has an outlet opens the transfers sent to that shop. They see each item’s SKU, description, barcode, quantity sent, and a received quantity they can change. Scanning a barcode on the transfer adds 1 to received quantity, moves that line to the top, and highlights it. Scanning a barcode that is not on the transfer beeps and does not add a line. Before they mark the transfer received, they can type a received quantity that is less than, equal to, or greater than the quantity sent. Sent 3 and received 2, or sent 3 and received 4, is a mismatch and is allowed. After they mark received, they cannot change the counts. Stores users see who last changed each line and who marked the transfer received.

**Why this priority**: The shop must record the real count, including shorts and extras, and stores must know who did it.

**Independent Test**: Open a sent transfer of 3 units, scan once, type the received quantity down to 2, mark received, and confirm stores see the mismatch, the barcode, the person who changed the count, and the person who marked it received. Confirm the count cannot be edited after that.

**Acceptance Scenarios**:

1. **Given** a transfer sent to the user’s outlet, **When** they open it, **Then** they see SKU, description, barcode, sent quantity, and an editable received quantity for each line.
2. **Given** the transfer is not yet marked received, **When** they scan a barcode that is on the transfer, **Then** that line’s received quantity increases by 1, the line moves to the top, and it is highlighted.
3. **Given** the transfer is not yet marked received, **When** they type a received quantity of 2 or 4 on a line that was sent as 3, **Then** that quantity is saved and the line is treated as a mismatch.
4. **Given** they scan a barcode that is not on the transfer, **When** the scan is read, **Then** an error beep plays and the list does not gain a new item.
5. **Given** they mark the transfer received, **When** a stores user opens it, **Then** stores see the received quantities, the barcode, the person who last changed each line, and the person who marked it received.
6. **Given** the transfer is marked received, **When** the shop user tries to change a count, **Then** the count stays as it was at mark time.

---

### User Story 3 - Find mismatch transfers (Priority: P2)

Stores users and shop users can filter history to mismatches only. A mismatch transfer is one where at least one line’s received quantity is not the sent quantity. The filtered list shows those transfers, and opening a row shows the items, with mismatched lines identifiable. Stores see every shop. A shop user sees only their outlet.

**Why this priority**: Shorts and extras need a queue. The full history is too long to hunt through.

**Independent Test**: Create one transfer the shop received exactly and one they received short. Turn on the mismatch filter as a stores user and as that shop user. Confirm only the short transfer remains, and its items show the sent and received quantities.

**Acceptance Scenarios**:

1. **Given** history contains exact receipts and mismatched receipts, **When** a stores user turns on the mismatch filter, **Then** only transfers with at least one line whose received quantity differs from the sent quantity are listed, across all shops.
2. **Given** the same history, **When** a shop user turns on the mismatch filter, **Then** they see only their outlet’s mismatched transfers.
3. **Given** a mismatched transfer is in that filtered list, **When** the user opens the row, **Then** they see the items, including barcode, sent quantity, and received quantity, and can tell which lines differ.
4. **Given** the user turns the mismatch filter off, **When** history reloads, **Then** exact and mismatched transfers are both listed again.

---

### User Story 4 - Shop sends stock back to main (Priority: P1)

A user with an outlet can start a return from that outlet’s shop warehouse to the main warehouse only. The screen shows available quantity at that shop warehouse. They scan or type quantities the same way as a store-to-shop send: they cannot exceed available, a try over available beeps, a bad barcode beeps, a matching scan jumps to the top and highlights, and a line whose quantity equals available gets a green border. Sending does **not** create a material transfer in the stock books. It creates a request for stores.

**Why this priority**: Shops need a way to push stock back without posting the books before stores have counted it.

**Independent Test**: As a user whose outlet is Maharagama, open the return screen, confirm the only movement offered is that shop warehouse to main, scan within available, try to exceed available, and send. Confirm no stock-books material transfer exists yet and stores are notified.

**Acceptance Scenarios**:

1. **Given** a user whose outlet is assigned, **When** they open the shop-to-main screen, **Then** the source is that outlet’s shop warehouse, the target is the matching main warehouse, and they cannot choose a different shop or start a main-to-shop send.
2. **Given** the shop warehouse has available quantity 4 for an item, **When** they scan or type a quantity up to 4, **Then** the line behaves like a store-to-shop send, including highlight, green border when quantity equals available, and barcode on the line.
3. **Given** the quantity is already 4, **When** they try to add another, **Then** the quantity stays 4 and an error beep plays.
4. **Given** they send the request, **When** stores look in the stock books, **Then** no material transfer has been created for it.
5. **Given** a user has no outlet, **When** they look for this screen, **Then** they cannot start a shop-to-main request.

---

### User Story 5 - Stores count the shop return and post it (Priority: P1)

When a shop sends stock to main, stores users who handle store-to-shop transfers get a reminder. They open the request, scan and edit the quantities they actually received, and confirm. Confirmation creates the stock-books material transfer for the quantities stores confirmed. Until then, nothing is posted. Stores can count less or more than the shop sent; that difference is a mismatch and shows in the mismatch filter. The reminder goes away once the request is confirmed.

**Why this priority**: The books must move only after stores agree the goods are in hand.

**Independent Test**: Send a 3-unit shop-to-main request, see the stores reminder, count 2, confirm, and check that the stock books now contain one material transfer for 2 and the mismatch filter shows sent 3 / received 2.

**Acceptance Scenarios**:

1. **Given** a shop has just sent a shop-to-main request, **When** a stores user is in the app, **Then** they see a reminder for that request.
2. **Given** the request is open, **When** stores scan a barcode on it or type a received quantity, **Then** the count updates the same way as a shop receipt, including moving the scanned line to the top, and they can enter less or more than the shop sent.
3. **Given** stores confirm, **When** the shop warehouse still has at least the confirmed quantity, **Then** one material transfer is created in the stock books for the quantities stores confirmed, from that shop warehouse to main, and the reminder for that request is gone.
4. **Given** stores confirm a quantity the shop warehouse no longer has, **When** confirmation is attempted, **Then** no material transfer is created and stores see why it was refused.
5. **Given** stores counted a different quantity than the shop sent, **When** either side uses the mismatch filter, **Then** that request appears with the items and both quantities.
6. **Given** the request is not yet confirmed, **When** someone looks for its stock-books document, **Then** there is none.

---

### User Story 6 - Open the books document or the item list (Priority: P2)

On history, the entry identifier and the row do different things. Choosing the entry identifier opens the stock-books material transfer when one exists. Choosing the rest of the row opens the item list (what was sent, and what was received once counted). A shop-to-main request has no entry identifier to open until stores confirm it. After confirmation, that identifier opens the material transfer that was created.

**Why this priority**: Stores need the books document in one click and the count list in another, without losing either.

**Independent Test**: On a store-to-shop history row, activate the entry identifier and confirm the stock-books transfer opens, then activate the row and confirm the item list opens with barcodes. Repeat on a confirmed shop-to-main request. On an unconfirmed shop-to-main request, confirm the row opens items and there is no books document to open.

**Acceptance Scenarios**:

1. **Given** a store-to-shop transfer that already has a stock-books material transfer, **When** a stores user activates the entry identifier, **Then** that material transfer opens.
2. **Given** the same row, **When** they activate the row rather than the entry identifier, **Then** the item list opens, including barcode, sent quantity, and received quantity.
3. **Given** a shop user opens their history, **When** they activate a row, **Then** they see the items they were sent or the items on their shop-to-main request, including barcodes.
4. **Given** a shop-to-main request stores have not confirmed, **When** a user activates the row, **Then** the item list opens and no stock-books material transfer is offered.
5. **Given** stores have confirmed that request, **When** a user activates the entry identifier, **Then** the material transfer created at confirmation opens.

---

### Edge Cases

- Available quantity is 0: the item can be found, but quantity cannot rise above 0, and an attempt beeps.
- Two fast scans of the same barcode both count, and the line stays at the top.
- A scan that matches more than one item is rejected with the error beep and no line is added.
- The shop marks received with every line still at 0: the transfer is received, every line is a mismatch, and stores see who marked it.
- Stores confirm a shop-to-main request with every line at 0: no material transfer is created, and they are told to enter a received quantity or leave the request open.
- Two stores users open the same shop-to-main request: the first successful confirmation posts the books; the second sees that it is already confirmed and cannot post a second material transfer.
- The outlet name does not match a shop warehouse: the shop-to-main screen explains that no shop warehouse is allocated, and no request can be sent.
- Store-to-shop on the trading books still requires a company, and only that company’s main and shop warehouses are offered. Shop-to-main uses the outlet’s shop warehouse and that same company’s main warehouse.
- VAT-only rule on the cosmetics books still applies to store-to-shop sends. Shop-to-main from a cosmetics shop follows the same item rule as store-to-shop on those books.
- After mark-received or stores confirmation, later stock changes do not rewrite the saved counts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On a send list (store-to-shop and shop-to-main), the user MUST be able to set each line’s quantity by scanning (adds 1) or by typing a whole number.
- **FR-002**: A send quantity MUST NOT exceed the available quantity at the source warehouse at the time of the scan or edit. An attempt MUST leave the quantity unchanged, play an error beep, and tell the user they cannot exceed available.
- **FR-003**: A scanned code that does not match one sendable item, or that is not on an open receipt, MUST play an error beep and MUST NOT add a line.
- **FR-004**: A successful scan on a send list or an open receipt MUST move that item’s line to the top and highlight it until another line is scanned or the list is left.
- **FR-005**: On a send list, a line whose quantity equals the available quantity MUST show a green border. Every other line MUST keep the normal border.
- **FR-005a**: When stores submit a store-to-shop transfer whose source is the main warehouse, the confirmation MUST list the items and MUST mark every line whose quantity is lower than that main warehouse’s available quantity. Lines equal to available MUST NOT be marked as low. The user MUST still be able to submit those lower quantities.
- **FR-006**: History for stores and for shops MUST show each item’s barcode along with SKU, description, sent quantity, and received quantity.
- **FR-007**: Before a shop marks a store-to-shop transfer received, the shop user MUST be able to set each received quantity to any whole number, including a number lower or higher than the quantity sent.
- **FR-008**: A line whose received quantity differs from the sent quantity MUST be a mismatch. Marking received with mismatches MUST be allowed.
- **FR-009**: Stores users and shop users MUST be able to filter history to mismatch transfers only. Stores see all shops. A shop user sees only their outlet. Opening a filtered row MUST show the items and which lines differ.
- **FR-010**: After a shop marks a transfer received, counts MUST be locked. Stores MUST see, for each line, who last changed the received quantity, and who marked the transfer received.
- **FR-011**: A user with an assigned outlet MUST be able to send only from that outlet’s shop warehouse to the matching main warehouse. They MUST NOT start a main-to-shop transfer.
- **FR-012**: A shop-to-main send MUST NOT create a stock-books material transfer.
- **FR-013**: A new shop-to-main request MUST raise a reminder for stores users who can send store-to-shop transfers, and that reminder MUST remain until the request is confirmed.
- **FR-014**: Stores users MUST be able to scan and edit received quantities on a shop-to-main request, including counts that differ from the shop’s sent quantities, before confirmation.
- **FR-015**: Stores confirmation of a shop-to-main request MUST create one stock-books material transfer from that shop warehouse to main for the quantities stores confirmed, and then clear that request’s reminder.
- **FR-016**: If the shop warehouse cannot cover the confirmed quantities, confirmation MUST refuse and MUST NOT create a material transfer.
- **FR-017**: Confirming a shop-to-main request with no positive received quantity MUST NOT create a material transfer.
- **FR-018**: A second confirmation of the same shop-to-main request MUST NOT create another material transfer.
- **FR-019**: Activating the entry identifier on a transfer that has a stock-books material transfer MUST open that document. Activating the rest of the row MUST open the item list. A shop-to-main request MUST NOT offer a stock-books document until stores have confirmed it.
- **FR-020**: Store-to-shop sends MUST still create the stock-books material transfer when the stores user sends, and MUST still limit cosmetics-books sends to VAT items and trading-books sends to the selected company’s main and shop warehouses.

### Key Entities

- **Store-to-shop transfer**: Stock moved from a source warehouse to a shop warehouse. Posted to the stock books when stores send. Lines keep barcode, sent quantity, received quantity, who last changed the received quantity, and who marked the transfer received.
- **Shop-to-main request**: A shop’s request to move stock from their outlet shop warehouse to main. Not posted until stores confirm. After confirmation it has one stock-books material transfer for the quantities stores counted.
- **Mismatch**: Any line on either kind of transfer where received quantity is not equal to sent quantity.
- **Outlet allocation**: The outlet on the staff profile. It decides which shop warehouse that person receives into and which shop warehouse they can return from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a send list, a user who tries to exceed available quantity is blocked on every attempt, hears the error beep within a second, and the recorded quantity never goes above available.
- **SC-002**: A bad barcode on a send or an open receipt is rejected on every attempt, with an error beep within a second, and the list length does not change.
- **SC-003**: After a successful scan, that item is the first line and is visually highlighted, and a line at exactly the available quantity is distinguishable by a green border from lines that are not.
- **SC-003a**: On every store-to-shop submit from main, each line below main’s available quantity is marked on the confirmation, and each line equal to that available quantity is not marked as low.
- **SC-004**: A shop user can record a received quantity both below and above the sent quantity, mark received once, and stores can see those quantities, the barcode, the last person who changed each line, and the person who marked it received.
- **SC-005**: With the mismatch filter on, 100% of listed transfers have at least one differing line, and 100% of exact transfers stay hidden until the filter is cleared.
- **SC-006**: A shop-to-main send creates no stock-books material transfer. Stores confirmation creates exactly one, for the quantities stores confirmed, and the reminder for that request is gone afterward.
- **SC-007**: From history, opening the entry identifier reaches the stock-books material transfer when one exists, and opening the row reaches the item list, in one action each.

## Assumptions

- Outlet users can only start shop-to-main. They cannot start main-to-shop. The words “they can send main to shop” are read as the opposite of “shop to main only,” because the screen is specified as that outlet’s shop warehouse to main and shop users must not post the books themselves.
- Store-to-shop continues to post to the stock books at send time. Only shop-to-main waits for stores confirmation.
- The error beep is the same short sound for a bad barcode and for an over-available attempt.
- Green border applies on send lists when the quantity to send equals available stock. It is not used to block shop or stores receipt mismatches.
- The low-count mark on submit applies when stores send store-to-shop from the main warehouse. It compares each line’s quantity with that main warehouse’s available quantity. It warns only. It does not block the send. Shop-to-main confirmation does not use this mark.
- “Who scanned” is the person who last changed that line’s received quantity, whether by scan or by typing. “Who marked” is the person who marked the transfer received or confirmed the shop-to-main request.
- The stock-books quantity for a shop-to-main confirmation is the quantity stores entered, not the quantity the shop originally sent.
- One outlet maps to one shop warehouse by the outlet name, and the main warehouse is the main warehouse on the same books as that shop.
- Stores users are the people who can already create store-to-shop transfers. The reminder is for those people.
- There is no separate reject action. Stores record zeros or lower counts and confirm, or they leave the request open.
- Highlight means a visible emphasis on the latest scanned line only. A new successful scan moves the emphasis.
