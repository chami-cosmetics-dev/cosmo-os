# Feature Specification: Shop Item Requests

**Feature Branch**: `feature/066-shop-item-requests`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "new feature in material transfer add new tab to shop users they can request items from stores, no item restriction for requests, they can add items by barcode or sku both, sku suggestion need, needed qty they add they can edit it also qty, also when merchant add item to list for that item we have status in OSF shop allowed or not, when they add shop not allowed item with error sound they notify this item not allowed for shops, even not allowed they can add it to request form, also they can remove items from list, after add item to list they can see current stock at cosmetics main, pevi, spk, chami, udara, sdp main warehouses stock, if stock in main warehouses < 4 this item cannot transfer like status even they can request it, or they can remove it and request later, after merchant at shop add all items they need and make request it came to stores for store they can see that request who create it and which outlet, also like merchants stores can see company main warehouses current stock also stock < 4 status cannot send this item, also they can mark it as done, also new requests show pending filter for done and pending, keep request history also"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Shop asks stores for items (Priority: P1)

A shop user opens a new tab on Material Transfer and builds a request for their outlet. They add any item by scanning or typing a barcode, or by typing a SKU and picking a suggestion. There is no block on which items may be requested. Each line has a needed quantity they can change, and they can remove a line. When the item’s OSF Shop Availability is Not Allowed, an error sound plays and a notice says the item is not allowed for shops, and the line still stays on the form. Each line shows current stock at the six company main warehouses: Cosmetics main, Pevi, SPK, Chami, Udara, and SDP. A main warehouse with fewer than 4 units is marked cannot-transfer for that item. The shop user can still keep the line and submit, or remove it and request it later. Submitting sends the request to stores as pending.

**Why this priority**: Shops need a way to ask for stock without the limits that apply when stores actually send a transfer.

**Independent Test**: As a shop user with an outlet, add one allowed item by barcode, one item by SKU suggestion, one Not Allowed item, and one item whose Cosmetics main stock is 3. Edit a quantity, remove a line, and submit. Confirm the request is pending, the Not Allowed line is present with the sound and notice, and the low main-warehouse stock is marked cannot-transfer.

**Acceptance Scenarios**:

1. **Given** a shop user with an outlet is on Material Transfer, **When** they open the request tab, **Then** they can start a request for that outlet only.
2. **Given** the request form is open, **When** they scan or type a barcode that matches one item, **Then** that item is added with needed quantity 1.
3. **Given** they type part of a SKU, **When** suggestions appear and they pick one, **Then** that item is added with needed quantity 1.
4. **Given** an item is already on the list, **When** they add it again by barcode or SKU, **Then** the same line’s needed quantity increases by 1 and a second line is not created.
5. **Given** a line is on the list, **When** they change the needed quantity to another whole number of 1 or more, **Then** the new quantity is kept.
6. **Given** a line is on the list, **When** they remove it, **Then** that item leaves the list and is not on the submitted request.
7. **Given** the item’s OSF Shop Availability is Not Allowed, **When** they add it, **Then** an error sound plays, they are told this item is not allowed for shops, and the line remains on the form.
8. **Given** the item’s OSF Shop Availability is Allowed, or Shop Availability is blank, **When** they add it, **Then** no not-allowed notice or error sound is played for Shop Availability.
9. **Given** a line is on the list, **When** they look at it, **Then** they see the current quantity at Cosmetics main, Pevi, SPK, Chami, Udara, and SDP main warehouses.
10. **Given** one of those main warehouses has 0, 1, 2, or 3 units, **When** they look at that warehouse for the line, **Then** it is marked cannot-transfer. A quantity of 4 or more is not marked.
11. **Given** a line is Not Allowed, cannot-transfer, or both, **When** they submit the request, **Then** the request is accepted as pending and those lines are included.
12. **Given** the list is empty, **When** they try to submit, **Then** no request is created.
13. **Given** a user has no outlet, **When** they look for this tab, **Then** they cannot create a shop item request.

---

### User Story 2 - Stores review the request and mark it done (Priority: P1)

Stores see each new shop request on Material Transfer. The request shows who created it and which outlet it is for, plus every line’s needed quantity, OSF Shop Availability, and the same six main-warehouse stocks. A main warehouse below 4 units is marked cannot-transfer, with the same meaning as on the shop form: that warehouse should not send the item while stock is under 4. Stores can still mark the whole request done. Marking done does not move stock and does not create a material transfer. New requests are pending. Pending is the list they see first.

**Why this priority**: Stores must know who asked, from which outlet, and which mains are too low to send from, then close the request when they have dealt with it.

**Independent Test**: Submit a two-line shop request, one of them with SPK main stock of 2. As a stores user, open the pending list, confirm creator, outlet, both lines, Shop Availability, the six stocks, and the cannot-transfer mark on SPK. Mark the request done and confirm it leaves the pending list and no material transfer was created.

**Acceptance Scenarios**:

1. **Given** a shop user has just submitted a request, **When** a stores user opens shop requests, **Then** that request is pending and shows the creator and the outlet.
2. **Given** the request is open, **When** stores look at a line, **Then** they see needed quantity, OSF Shop Availability, and current stock at Cosmetics main, Pevi, SPK, Chami, Udara, and SDP.
3. **Given** a main warehouse quantity is below 4, **When** stores look at that warehouse on the line, **Then** it is marked cannot-transfer. A quantity of 4 or more is not marked.
4. **Given** a request is pending, **When** stores mark it done, **Then** its status becomes done, it is no longer pending, and no stock movement or material transfer is created from that action.
5. **Given** a request is already done, **When** another stores user tries to mark it done again, **Then** it stays done a single time and they see that it is already done.

---

### User Story 3 - Pending, done, and history (Priority: P2)

Shop users and stores users can filter requests to pending or done. New requests appear under pending. Done requests stay in history and appear under done. A shop user sees only their outlet. Stores see every outlet. Opening a historical request still shows its lines, quantities, creator, and outlet.

**Why this priority**: Closed requests must remain findable. The daily queue is the pending list.

**Independent Test**: Create two requests, mark one done, and leave one pending. As stores, switch between pending and done and confirm each list is correct and the done request is still openable. As the shop user, confirm they see only their outlet’s requests under the same filters.

**Acceptance Scenarios**:

1. **Given** pending and done requests exist, **When** a stores user chooses pending, **Then** only pending requests are listed, and a newly submitted request is among them.
2. **Given** the same history, **When** they choose done, **Then** only done requests are listed, including older done requests.
3. **Given** a shop user opens their request history, **When** they choose pending or done, **Then** they see only requests for their outlet in that status.
4. **Given** a done request, **When** either role opens it, **Then** they still see creator, outlet, lines, and needed quantities.

---

### Edge Cases

- A barcode or SKU matches no item: nothing is added, an error sound plays, and the user is told the item was not found.
- A barcode or SKU matches more than one item: nothing is added, an error sound plays, and the user is told to pick a single suggestion.
- Needed quantity is cleared, set to 0, or set to a fraction: the previous quantity stays, and the user is told to enter a whole number of 1 or more.
- The same item is Not Allowed and also below 4 at a main warehouse: both the not-allowed notice and the cannot-transfer mark show, and the line can stay on the request.
- OSF Shop Availability is blank: the line can be added with no not-allowed sound or notice.
- A main warehouse has no stock figure: that warehouse shows as unknown and is not marked cannot-transfer.
- Every listed main warehouse is below 4: each is marked cannot-transfer, and the shop can still submit.
- A main warehouse quantity is exactly 4: that warehouse is not marked cannot-transfer.
- The shop user removes every line: submit does nothing until at least one line remains.
- After submit, the shop user cannot add, edit, or remove lines on that request.
- Two stores users mark the same pending request done: the first success wins; the second sees it already done.
- Stock changes after submit: opening the request shows the stocks at that moment, and cannot-transfer marks follow those current quantities. Needed quantities stay as submitted.
- A shop user whose outlet is not assigned cannot submit a request.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Material Transfer MUST offer shop users a tab where they request items from stores for their own outlet.
- **FR-002**: A shop user MUST be able to add an item by barcode and by SKU. Typing a SKU MUST offer matching suggestions, and choosing a suggestion MUST add that item.
- **FR-003**: Any item that can be identified by barcode or SKU MUST be addable. OSF Shop Availability and main-warehouse stock MUST NOT block adding or submitting.
- **FR-004**: A newly added line MUST start at needed quantity 1. Adding the same item again MUST increase that line by 1 instead of creating a duplicate line.
- **FR-005**: Before submit, the shop user MUST be able to change a line’s needed quantity to any whole number of 1 or more, and MUST be able to remove a line.
- **FR-006**: When the added item’s OSF Shop Availability is Not Allowed, the system MUST play an error sound, MUST tell the user this item is not allowed for shops, and MUST keep the line on the form.
- **FR-007**: When OSF Shop Availability is Allowed or blank, adding the item MUST NOT play the not-allowed notice.
- **FR-008**: Each line, on the shop form and on the stores view, MUST show current stock at these company main warehouses: Cosmetics main, Pevi, SPK, Chami, Udara, and SDP.
- **FR-009**: A shown main-warehouse quantity below 4 MUST be marked cannot-transfer. A quantity of 4 or more MUST NOT be marked. The mark MUST NOT stop the shop from keeping or submitting the line, and MUST NOT stop stores from marking the request done.
- **FR-010**: Submitting a request with at least one line MUST create a pending request that stores can see. An empty list MUST NOT create a request.
- **FR-011**: Each request MUST show who created it and which outlet it belongs to.
- **FR-012**: Stores MUST be able to mark a pending request done. Marking done MUST NOT move stock and MUST NOT create a material transfer.
- **FR-013**: A request that is already done MUST stay done and MUST NOT be marked done a second time.
- **FR-014**: Shop users and stores users MUST be able to filter requests to pending or to done. The first list shown MUST be pending. Done requests MUST remain available as history.
- **FR-015**: A shop user MUST see only their outlet’s requests. Stores MUST see requests from every outlet.
- **FR-016**: After a request is submitted, the shop user MUST NOT add, edit, or remove its lines.
- **FR-017**: A user with no outlet MUST NOT be able to create a shop item request.
- **FR-018**: A barcode or SKU that matches nothing, or matches more than one item, MUST add no line, MUST play an error sound, and MUST tell the user why.

### Key Entities

- **Shop item request**: One ask from a shop to stores. It has the outlet, the person who created it, when it was created, status pending or done, and when and by whom it was marked done.
- **Request line**: One item on a request. It has the item identity (SKU, barcode, description), the needed quantity, and the OSF Shop Availability captured as Allowed, Not Allowed, or blank. Main-warehouse stocks and cannot-transfer marks are current figures shown when the request is viewed, not a frozen copy of stock at submit time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shop user can add 10 items by barcode or SKU suggestion, set quantities, and submit in under 3 minutes.
- **SC-002**: Every Not Allowed add plays the error sound, shows the not-allowed notice, and still appears on the submitted request.
- **SC-003**: On every line, both the shop user and stores can read the current quantity for all six named main warehouses, and every quantity below 4 is visibly marked cannot-transfer.
- **SC-004**: Stores can name the creator and the outlet for 100% of submitted requests without opening another screen.
- **SC-005**: After stores mark a request done, it disappears from the pending list, remains on the done list, and no stock movement is created by that action.
- **SC-006**: With pending and done history present, choosing a filter shows only that status, and a shop user never sees another outlet’s requests.

## Assumptions

- Shop users are merchant staff who already have an outlet on Material Transfer. Stores users are the people who already handle store-to-shop transfers.
- “No item restriction” means Shop Availability, low main-warehouse stock, and any rule that blocks a real send do not stop a request. This feature does not itself send stock.
- The six warehouses are the company main warehouses named Cosmetics main, Pevi, SPK, Chami, Udara, and SDP. Shop warehouses are not shown in these stock columns.
- Cannot-transfer is per main warehouse. It applies when that warehouse’s current quantity is 0, 1, 2, or 3. It is a warning that the item should not be sent from that warehouse. It is not a block on the request or on marking done.
- Needed quantity is a whole number of 1 or more. Removing a line is a separate action from editing quantity.
- OSF Shop Availability is the existing Allowed / Not Allowed value. Blank means unknown and does not count as Not Allowed.
- Stock figures are the quantities on hand at the moment the form or request is opened. They can change later. Needed quantities do not change after submit.
- A missing stock figure displays as unknown and is not treated as below 4.
- Marking done closes the request as handled. Fulfilling it, if stores choose to, stays on the existing material-transfer send flow and is out of scope here.
- One request can hold many lines. A shop may have more than one pending request.
- The shop cannot change a request after submit, and stores cannot change its lines. Stores can only mark the whole request done.
- Pending is the default filter for both the shop history and the stores queue.
- An unknown or ambiguous code uses the same error sound as a Not Allowed add, with a different message, and does not add a line.
