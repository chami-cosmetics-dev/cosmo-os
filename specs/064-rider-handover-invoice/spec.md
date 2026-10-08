# Feature Specification: Rider Cash Handover and Invoice Close

**Feature Branch**: `064-rider-handover-invoice`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "in rider performance with new permission user can select one rider and select date or range generate printable summury for given date or range delivery complete marked by that rider summury, not all orders at first step, first permited user can get summury company wise total amout rider should handover to finance and full total it can print it should have another two places for add signature handover by - rider name and cash collected signature, after that another permission role for this feature mark money recieved and load all orders complete by that rider for give date or range also permited user can change payment type at that time and button mark invoices completed, when permited user do this process all orders mark as invoice comlete also PE should create for those orders, manual selectable payment types we get from erp side, cus some times oredrs placed as cash and when it deliver to customer they paid by bank transfer or card payment, we have to place change that payment type before create PE in erp. from now on we calculate riders incentive full completed orders, not only delivery completed, delivery and invoice all completed orders."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Print a company-wise cash handover slip (Priority: P1)

A staff member with the **handover summary** permission opens Rider performance, picks **one rider**, and picks **one calendar day or a from–to range**. They get a **printable summary** of deliveries that rider marked delivery complete in that period.

The first screen is the summary only. It does not list every order.

The summary shows, for each company those deliveries belong to, the **cash total the rider must hand to finance**, then a **full total** across companies. The user can print it. The printed slip has two signature places:

- **Handover by** — the rider’s name, with space to sign
- **Cash collected** — space for the person who receives the cash to sign

**Why this priority**: Finance needs a single paper total per company before anyone opens individual orders. Riders hand cash over by company books, and the slip is the record both people sign.

**Independent Test**: With the handover-summary permission only, pick a rider and a day that has delivery-complete orders in two companies, some collected as cash and some as card or bank transfer. Confirm the slip shows one cash total per company, those totals add up to the full total, the order list is absent, and print shows the rider name and both signature places.

**Acceptance Scenarios**:

1. **Given** a user with the handover-summary permission, **When** they select one rider and one day or a date range, **Then** they see company cash totals and a full total for deliveries that rider marked delivery complete in that Asia/Colombo period.
2. **Given** that summary, **When** they print it, **Then** the printout shows the rider, the day or range, each company cash total, the full total, a **Handover by** line with that rider’s name and a signature space, and a **Cash collected** signature space.
3. **Given** the user has only the handover-summary permission, **When** they generate the summary, **Then** they cannot open the order list, change a payment type, mark money received, or mark invoices completed.
4. **Given** a delivery in the period was collected as card or bank transfer, **When** the summary is built, **Then** that non-cash amount is left out of the company cash total and the full total.
5. **Given** a delivery was collected partly as cash and partly as another method, **When** the summary is built, **Then** only the cash portion is included in that company’s total.
6. **Given** the rider has no delivery-complete orders in the period, **When** the user generates the summary, **Then** the slip shows zero company totals and a zero full total, and it can still be printed.
7. **Given** a user without the handover-summary permission, **When** they open Rider performance, **Then** they cannot generate or print this slip.

---

### User Story 2 - Record that finance received the cash (Priority: P1)

A staff member with the **cash receive and invoice close** permission records that the rider’s cash for that same rider and period was received. The record keeps who received it, when, and the company totals and full total they accepted.

**Why this priority**: The signed paper slip needs a matching record so the same handover is not treated as still outstanding, and so a later reprint can be compared with what finance already accepted.

**Independent Test**: After a slip exists for rider R and a known range, mark money received. Confirm the record stores the receiver, the time, and the company totals. Marking the same rider and range again asks for an explicit confirm before a second receipt is stored.

**Acceptance Scenarios**:

1. **Given** a user with the cash-receive permission and a summary for one rider and period, **When** they mark money received, **Then** the system stores the receiver, the time, the rider, the period, and the company cash totals plus full total accepted at that moment.
2. **Given** money was already marked received for that rider and period, **When** the user tries to mark it received again, **Then** the system shows the earlier receipt and requires an explicit confirm before storing another one.
3. **Given** a user with only the handover-summary permission, **When** they try to mark money received, **Then** they are denied.
4. **Given** card or bank deliveries sit in the same period, **When** finance marks the cash received, **Then** those non-cash deliveries do not have to be part of the cash receipt before their invoices can be closed.

---

### User Story 3 - Correct payment type, close invoices, and create payment entries (Priority: P1)

The same cash-receive permission can then **load every order that rider marked delivery complete** in that day or range. For each order still needing invoice close, the user can set the **payment type** to the type the customer actually used. The choices are the payment types maintained in that order’s company accounts.

Orders are often placed as cash. At the door the customer may pay by **bank transfer** or **card**. The corrected type is the one used when the accounts payment entry is created.

A **Mark invoices completed** button closes every eligible order in the loaded set: each becomes invoice complete, and a payment entry is created for the payment type chosen for that order.

**Why this priority**: Cash can be signed over before finance opens the orders, but the books must use the real payment type. Closing invoices without a payment entry leaves the accounts unpaid.

**Independent Test**: Load a rider-day that includes one cash order, one order placed as cash but paid by card, and one order already invoice complete. Change the card order’s payment type to card, press Mark invoices completed, and confirm the cash and card orders are invoice complete with a payment entry for the chosen type, while the already closed order is unchanged.

**Acceptance Scenarios**:

1. **Given** a user with the cash-receive permission, **When** they select the same rider and day or range, **Then** they see each order that rider marked delivery complete in that period, including company, amount, current payment type, and whether invoice close is still open.
2. **Given** an order placed as cash and paid at delivery by bank transfer or card, **When** the user changes its payment type before closing, **Then** the payment entry uses the type they selected, and the available types are those maintained for that order’s company accounts.
3. **Given** eligible orders in the loaded set have a chosen payment type, **When** the user presses **Mark invoices completed**, **Then** each eligible order is marked invoice complete and a payment entry is created for its chosen type.
4. **Given** the accounts system rejects a payment entry, or the order has no sales invoice to pay, **When** the button runs, **Then** that order stays not invoice complete, the user sees the reason, and the other eligible orders in the set still close.
5. **Given** an order in the set is already invoice complete, **When** the button runs, **Then** that order is left as it is and no second payment entry is created for the same settlement.
6. **Given** the linked invoice is already fully paid, **When** the button runs, **Then** the order can be marked invoice complete and no extra payment entry is created.
7. **Given** a user without the cash-receive permission, **When** they try to load this order list, change a payment type, or mark invoices completed, **Then** they are denied.
8. **Given** the user has not marked money received, **When** they still need to close card or bank orders, **Then** they can load the orders and mark invoices completed. Cash receipt is not a gate on invoice close.

---

### User Story 4 - Incentive only after delivery and invoice are both complete (Priority: P1)

Rider incentive counts an order only when **both** are true: the rider’s delivery is complete, and the order is invoice complete. A delivery-complete order that is still waiting for invoice close adds no incentive.

Staff Rider performance and the rider’s own performance view use this same rule. The day the incentive belongs to is the day the delivery was completed (Asia/Colombo). Invoice close later in the period unlocks the incentive for that delivery day.

The existing delivery-complete counts on Rider performance stay available so operations can still see deliveries finished before finance closes the invoices.

**Why this priority**: Pay must follow a fully closed order. Paying on delivery complete alone counts work whose invoice and payment entry are still open.

**Independent Test**: Complete a delivery with a known rider charge and leave invoice open. Confirm incentive for that rider-day excludes it. Mark the invoice complete. Confirm the same delivery day now includes that rider charge. Confirm a prepaid order that was already invoice complete earns incentive as soon as delivery is complete.

**Acceptance Scenarios**:

1. **Given** a delivery-complete order that is not invoice complete, **When** staff or the rider view incentive for the delivery day, **Then** that order adds no incentive.
2. **Given** that same order becomes invoice complete, **When** they view incentive for the delivery day, **Then** the rider charge for that order is included.
3. **Given** an order that was already invoice complete before delivery (prepaid), **When** the rider marks delivery complete, **Then** the rider charge counts immediately, on the delivery day.
4. **Given** staff totals and the rider’s own performance for the same rider and period, **When** both are viewed, **Then** the incentive totals match.
5. **Given** a fully closed order whose delivery label has no rider charge, **When** incentive is shown, **Then** the order adds 0 and the existing unmatched-delivery signal still appears.
6. **Given** a voided, cancelled, refunded, or failed delivery, **When** incentive is shown, **Then** it stays excluded under the existing pay rules.

---

### Edge Cases

- One rider, several companies in one period: one cash line per company that has cash, plus one full total. A company with only card or bank deliveries shows no cash to hand over.
- Reprinting the slip does not mark money received and does not close invoices.
- Deliveries completed after a receipt was stored can change a later slip. The earlier receipt keeps the totals accepted at that time. The order list shows the current delivery-complete set.
- An order with no recorded cash collection contributes 0 to the slip. It still appears in the order list so finance can set the payment type and close it.
- Payment types differ by company. An order only offers types from its own company accounts. If that company has none, the user sees that and that order cannot be closed until a type can be chosen.
- The user can set payment types on many orders, then press the button once. Each order uses the type selected for it.
- One failed order in the batch does not roll back orders that already closed in that same run. Failed orders stay visible for retry.
- Already invoice-complete orders in the range, including prepaid paths that closed earlier, are visible and are not submitted for a new payment entry.
- A second payment entry is not created when the invoice is already fully paid.
- Date filters use Asia/Colombo calendar days. A single day is a from-date and to-date on that same day. An inverted range is rejected with a clear message.
- Completions attributed to a rider follow the existing rider-delivery rules, including app and link completion. A delivery with no rider is outside this slip and this close action.
- Incentive stays on the delivery-complete day after invoice close, including when finance closes the invoice on a later day.
- Changing payment type does not change the rider charge used for incentive.
- Users who can see Rider performance but hold neither new permission keep today’s performance view and cannot print the slip or close these invoices.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a distinct **handover summary** permission. Holders can select one rider and one Asia/Colombo day or date range and generate the cash handover summary for deliveries that rider marked delivery complete in that period.
- **FR-002**: That summary MUST show a cash total per company and one full total. The cash total MUST include only cash the rider collected on those deliveries. Card and bank-transfer amounts MUST stay out of the totals. A split collection MUST contribute only its cash portion.
- **FR-003**: The handover-summary step MUST NOT list the individual orders.
- **FR-004**: The user MUST be able to print the summary. The printout MUST include the rider, the day or range, each company cash total, the full total, a **Handover by** line showing the rider’s name plus a signature space, and a **Cash collected** signature space.
- **FR-005**: The system MUST provide a distinct **cash receive and invoice close** permission. It is separate from the handover-summary permission and from existing Rider performance access.
- **FR-006**: A holder of the cash-receive permission MUST be able to mark money received for one rider and period. The record MUST store who received it, when, the rider, the period, and the company cash totals and full total accepted then.
- **FR-007**: Marking the same rider and period received again MUST show the earlier receipt and MUST require an explicit confirm before another receipt is stored. Printing the slip MUST NOT itself mark money received.
- **FR-008**: A holder of the cash-receive permission MUST be able to load every order that selected rider marked delivery complete in the selected day or range, with company, amount, current payment type, and whether invoice close is still open.
- **FR-009**: Before invoice close, the user MUST be able to set each still-open order’s payment type. The choices MUST be the payment types maintained in that order’s company accounts. The payment entry MUST use the type selected for that order.
- **FR-010**: **Mark invoices completed** MUST apply to every eligible order in the loaded rider and period. An eligible order is delivery complete, not yet invoice complete, has a sales invoice that still needs a payment entry, and has a selected payment type.
- **FR-011**: For each eligible order the action succeeds on, the system MUST mark the order invoice complete and MUST create the accounts payment entry for the selected payment type.
- **FR-012**: If a payment entry is required and the accounts system does not create it, the system MUST leave that order not invoice complete, MUST show the reason, and MUST still complete the other eligible orders in that run. The user MUST be able to retry the failed orders.
- **FR-013**: Orders already invoice complete, and invoices already fully paid, MUST NOT receive another payment entry for the same settlement. An already fully paid invoice MAY still be marked invoice complete when the order was not.
- **FR-014**: Marking money received MUST NOT be required before loading orders or marking invoices completed.
- **FR-015**: A user without the handover-summary permission MUST NOT generate or print the slip. A user without the cash-receive permission MUST NOT mark money received, load this order list, change these payment types, or mark these invoices completed.
- **FR-016**: Rider incentive on staff Rider performance and on the rider’s own performance MUST include an order only when delivery is complete and the order is invoice complete. The amount remains the existing rider delivery charge for that order. The incentive day is the delivery-complete day (Asia/Colombo).
- **FR-017**: Delivery-complete counts on Rider performance MUST remain counts of deliveries the rider completed, including orders whose invoices are still open.
- **FR-018**: Existing incentive exclusions MUST remain: failed, voided, cancelled, or refunded deliveries add no incentive; a closed order with no rider charge adds 0 and stays visible as unmatched.
- **FR-019**: Staff incentive and the rider’s own incentive for the same rider and period MUST match.

### Key Entities

- **Handover slip**: Printable summary for one rider and one day or range: company cash totals, full total, handover-by line, cash-collected signature line. No order lines.
- **Cash receipt**: Record that finance accepted a slip’s cash totals for that rider and period, including who accepted them and when.
- **Rider delivery**: A delivery the rider marked complete, tied to one order and that order’s company, with the cash and non-cash amounts collected.
- **Company**: The company the order belongs to. Cash totals and payment-type choices follow that company.
- **Payment type**: A type maintained in the order’s company accounts (cash, bank transfer, card, and the other types that company keeps). The user selects it before the payment entry is created.
- **Invoice close**: The order state invoice complete, together with the payment entry on that order’s sales invoice for the selected payment type.
- **Rider incentive**: The rider delivery charge earned on an order, counted only after delivery complete and invoice complete, on the delivery day.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with the handover-summary permission can produce a printed company-wise cash slip for one rider and one day or range in under 2 minutes, without an order list on that step.
- **SC-002**: On every generated slip, the company cash totals add up to the full total within 0.01 currency units, and card or bank amounts from the same deliveries are absent from both.
- **SC-003**: In a sample of at least 10 mixed deliveries (cash, card, bank, and at least two companies), finance can point to the company line each cash amount belongs to, and the two signature places are present with the rider’s name on **Handover by**.
- **SC-004**: For a sample of at least 10 eligible orders closed with this button, including at least 3 whose payment type was changed from cash to bank transfer or card first, each order is invoice complete and the payment entry uses the type selected before the button. Any order the accounts system rejects stays open with a visible reason, and the successful orders in that same run stay closed.
- **SC-005**: In a sample of at least 5 orders that were already invoice complete in the loaded range, the button creates no additional payment entry.
- **SC-006**: In a checked pay period, 100% of the incentive total comes from orders that are both delivery complete and invoice complete, and a delivery-complete order that is still open for invoice close contributes 0. Staff and rider views of that period match to 0.01 currency units.
- **SC-007**: In an access check, a user with neither new permission cannot print the slip or close invoices this way, a summary-only user cannot open the order list or press **Mark invoices completed**, and a cash-receive user can record receipt and close invoices.

## Assumptions

- This feature is part of Cosmo OS **Rider performance**. Existing Rider performance access stays as it is. The two new permissions are additional.
- One action is for one rider. A period covering every rider at once is out of scope.
- “Cash” on the slip is cash the rider collected on the delivery, including cash on delivery. Card and bank transfer are not cash to hand over.
- Signature places are blank lines on the printed slip for pen signature. The system does not capture signature images.
- “Company” is the company already stored on the order. Totals are grouped by that company.
- Payment types offered for an order are the types that company’s accounts already maintain. This feature does not invent a fixed short list.
- The usual correction is cash on the original order, changed to bank transfer or card before the payment entry. Any other type that company maintains can be selected the same way.
- **Mark invoices completed** processes the whole eligible set for the selected rider and period. Holding one order back is done by leaving it ineligible (no payment type, or a visible failure) or by narrowing the dates. A separate checkbox picker is out of scope.
- Money received and invoice close are separate. Card and bank orders can be closed when no cash was handed over.
- Prepaid orders that are already invoice complete before delivery stay in the loaded list as already closed and still earn incentive once the rider completes delivery.
- Incentive amount rules (rider delivery charge, unmatched label = 0, exclusions for failed or cancelled work) stay as they are today. Only the moment an order starts to earn incentive changes: both delivery complete and invoice complete.
- The delivery-complete count on Rider performance remains the operational count. It can be higher than the number of orders included in incentive until finance closes the open invoices.
- A delivery with no assigned rider is outside the slip, the receipt, and this invoice-close action.
- Vault OS is out of scope for this feature.
