# Feature Specification: Rider Maps Fallback & Cash Change Display

**Feature Branch**: `026-maps-cash-change`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: "now maps not available error display, also i want add feature mobile app under payment order total price display no? we can add input to input customer gave total and can show change we should give them, ex- if order 2500 and customer gave us 5000 then we can show balance 2500 then rider can easily give change to them"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open delivery location without a dead-end error (Priority: P1)

A rider on an open delivery taps **Open map** to navigate to the customer address. Today many phones show a blocking “Maps unavailable / No maps app is available on this phone” dialog and leave the rider stuck. The app must still help the rider reach the address: open a usable maps destination when possible, or give a clear next step (for example copy the address) when no maps app can open.

**Why this priority**: Riders cannot complete route work efficiently when navigation fails with no useful fallback; this blocks live deliveries.

**Independent Test**: On a device/emulator with no default maps handler, tap Open map on a delivery that has an address; confirm the rider is not left with only a dead-end alert and can still obtain the address for navigation. On a device with a maps app, confirm Open map launches navigation to that address.

**Acceptance Scenarios**:

1. **Given** a delivery with a street address, **When** the rider taps Open map and a maps app can handle the request, **Then** a maps/navigation experience opens for that address (or coordinates if available).
2. **Given** a delivery with a street address, **When** the rider taps Open map and no maps app can open, **Then** the rider sees a clear message plus at least one useful action (for example copy address), not only “Maps unavailable / OK”.
3. **Given** a delivery with no usable address text, **When** the rider taps Open map, **Then** the app explains that navigation is not possible and does not pretend a map can open.

---

### User Story 2 - Enter cash received and see change under the order total (Priority: P1)

During payment collection on the rider app, near the order total / amount due, the rider enters how much cash the customer handed over. The app immediately shows the change (balance) the rider must return. Example: order due **2,500**, customer gave **5,000** → show balance **2,500**.

**Why this priority**: Correct change at the door reduces cash disputes and speeds handover; riders asked for this next to the amount they already look at.

**Independent Test**: Open payment for a COD (or cash-due) delivery totaling 2,500; enter customer gave 5,000; confirm balance 2,500 is shown before the rider confirms payment.

**Acceptance Scenarios**:

1. **Given** a delivery with amount due 2,500 that requires cash collection, **When** the rider enters customer gave 5,000 on the payment screen under/near the order total, **Then** the app shows change/balance of 2,500.
2. **Given** the rider enters customer gave equal to the amount due, **When** they view the payment summary, **Then** change/balance is 0 (or clearly “no change”).
3. **Given** the rider enters customer gave less than the cash amount still due, **When** they try to confirm that cash payment, **Then** they are blocked or clearly warned that the tendered cash is insufficient.
4. **Given** payment is confirmed with customer-gave and change recorded, **When** staff later view the order in Cosmo OS, **Then** amount due, customer gave, and change/balance remain visible for that delivery payment.

---

### Edge Cases

- Address is present but only a landmark/short note — maps open may fail; fallback actions still apply.
- Customer gave is empty or non-numeric — do not show a misleading balance; require a valid amount before confirming cash collection.
- Split payments (cash + card): change is calculated against the **cash portion due**, not necessarily the full order total, unless the rider is collecting the full remainder in cash.
- Customer gave exactly the cash due — balance 0; confirmation still allowed.
- Very large tender amounts — show the calculated change without crashing or truncating incorrectly.
- Offline payment draft — entered customer-gave and shown balance must still be consistent when connectivity returns (same values submitted).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Rider app MUST attempt to open the delivery destination in an available maps/navigation experience when the rider taps Open map and a usable address (or location) exists.
- **FR-002**: When no maps app can open, the rider app MUST NOT leave the rider with only a dead-end “Maps unavailable” acknowledgment; it MUST provide a clear explanation and a useful fallback action for the address (at minimum: copy address to clipboard when address text exists).
- **FR-003**: Open map MUST be disabled or clearly unavailable when there is no address/location to navigate to.
- **FR-004**: On the rider payment flow, near the displayed order total / amount due, the app MUST provide an input for “customer gave” (cash handed over).
- **FR-005**: When customer gave is entered, the app MUST show change/balance as customer gave minus the cash amount due for that payment (example: due 2,500, gave 5,000 → balance 2,500).
- **FR-006**: The app MUST prevent confirming an insufficient cash tender for the cash amount being collected (or show an explicit blocking warning the rider cannot ignore).
- **FR-007**: Confirmed customer-gave and change/balance MUST be stored with the delivery payment and visible to authorized Cosmo OS staff on the order.
- **FR-008**: Change/balance display MUST update as the rider edits customer gave, before confirmation.

### Key Entities

- **Delivery destination**: Customer shipping/delivery address (and optional coordinates) used for Open map and fallback copy.
- **Delivery payment tender**: Amount due (cash portion), amount the customer handed over, and calculated change/balance returned to the customer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In test sessions on devices without a maps handler, 100% of Open map taps on deliveries with an address end with a usable next step (fallback action available), not only a dead-end alert.
- **SC-002**: In test sessions on devices with a maps app, Open map successfully launches navigation for at least 95% of deliveries that have a complete street address.
- **SC-003**: Riders can enter customer gave and see the correct change for a standard COD example (due 2,500 / gave 5,000 → balance 2,500) in under 15 seconds on the payment screen.
- **SC-004**: After confirmation, Cosmo OS order views show customer gave and change for that payment without a separate support request in pilot use.
- **SC-005**: Insufficient cash tender cannot be confirmed as a successful full cash collection in QA scenarios (0 false completions).

## Assumptions

- Target surface is the Cosmo Rider mobile app used for Cosmetics.lk deliveries; Cosmo OS web only needs to continue showing recorded tender fields after payment (no new web calculator required for this feature).
- “Order total” in the rider example means the **amount the rider must collect in cash for that payment** (full COD total, or cash line in a split), displayed next to the customer-gave input.
- Existing delivery payment / tender recording from prior work may already store customer-gave and change; this feature focuses on reliable maps fallback UX and making the change calculator obvious under/near the payment total on mobile.
- Currency display follows the order’s currency (typically LKR) already shown on the delivery.
- Riders may not have Google Maps installed; fallbacks must not assume a specific maps brand.
- Native APK rebuild is only required if Open map changes need new native capabilities; pure payment UI/JS changes can ship via existing OTA once enabled.
