# Feature Specification: CityPak Delivery Failed Reminders

**Feature Branch**: `071-citypak-delivery-failed`

**Created**: 2026-11-27

**Status**: Draft

**Input**: User description: "we have citypack api keys and we can see citypack status for order, i want add one more feature to our system when citypack notdelivered then add that order to mercahnts reminder bubble city pack delivery failed tab, merchant wise orders, dm general orders show merchant sandali who controll dm general orders also, when merchant click that order in reminder bubble list redirect to this waybill details page, later we have to add send email function,"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Merchant sees CityPak delivery-failed orders in reminder bubble (Priority: P1)

A merchant opens Cosmo OS and looks at the reminder bubble. A new category/tab labeled **City Pack Delivery Failed** shows orders for that merchant where CityPak tracking reports a **not delivered** (delivery attempt failed) status. The bubble count includes these items so the merchant knows follow-up work exists without hunting Pending Waybills.

**Why this priority**: Core value — surface failed CityPak deliveries to the right merchant so they can act.

**Independent Test**: With at least one matched CityPak waybill in not-delivered status for merchant A, log in as merchant A and confirm the tab lists that order (and not merchant B’s orders). Log in as merchant B and confirm merchant A’s order is absent.

**Acceptance Scenarios**:

1. **Given** a matched CityPak waybill whose courier status is not delivered / delivery attempt failed, and the order belongs to merchant A, **When** merchant A opens the reminder bubble and selects **City Pack Delivery Failed**, **Then** that order appears in the list with a clear invoice (and waybill when available) label.
2. **Given** the same order belongs to merchant A, **When** merchant B (different merchant) opens **City Pack Delivery Failed**, **Then** that order does not appear.
3. **Given** a CityPak waybill that is delivered, in transit, out for delivery, or booked (not in not-delivered state), **When** any merchant views **City Pack Delivery Failed**, **Then** that order does not appear in this tab.
4. **Given** zero not-delivered CityPak orders for the logged-in merchant, **When** they view the reminder bubble, **Then** the **City Pack Delivery Failed** tab is still available (if they have access) and shows an empty / zero state, without errors.

---

### User Story 2 - DM General orders appear for Sandali (Priority: P1)

Orders that are tracked as **DM General** (company/default DM channel, not a personal MER merchant) appear under the same **City Pack Delivery Failed** tab for the merchant who controls DM General — **Sandali**. Sandali can work those failed deliveries the same way as personal MER orders.

**Why this priority**: Without this rule, DM General failed deliveries would have no merchant owner in the bubble and would be missed.

**Independent Test**: Create or identify a DM General order with CityPak not-delivered status; log in as Sandali and confirm it appears; log in as another merchant and confirm it does not appear under their personal list solely because of DM General ownership.

**Acceptance Scenarios**:

1. **Given** a DM General order with CityPak not-delivered status, **When** Sandali opens **City Pack Delivery Failed**, **Then** that order appears in her list.
2. **Given** the same DM General order, **When** a different merchant (who does not control DM General) opens the tab, **Then** that order does not appear as theirs.
3. **Given** Sandali also has personal MER-attributed not-delivered orders, **When** she opens the tab, **Then** both her personal MER failures and DM General failures appear together in her scoped list.

---

### User Story 3 - Click opens Waybill Details (Priority: P1)

When a merchant clicks an item in the **City Pack Delivery Failed** list, Cosmo OS takes them to the **Waybill Details** view for that order’s CityPak waybill (the same details experience used from Fulfillment → Pending Waybills → View), so they can see courier status timeline, invoice, waybill number, and match/OS order context.

**Why this priority**: Reminder without a path to the operational detail screen does not complete the follow-up loop.

**Independent Test**: From the reminder list, click one failed item and confirm Waybill Details opens for the correct invoice/waybill; close and click another and confirm the second waybill’s details load.

**Acceptance Scenarios**:

1. **Given** a City Pack Delivery Failed reminder for invoice X / waybill Y, **When** the merchant clicks that reminder, **Then** Waybill Details opens for that same invoice/waybill (not a different row).
2. **Given** the merchant lacks permission to open waybill lookup/details, **When** they click the reminder, **Then** they see a clear access message or are blocked consistently with other fulfillment access rules — they are not shown another merchant’s private data.
3. **Given** Waybill Details is open from a reminder click, **When** the merchant reviews the CityPak status section, **Then** the not-delivered / attempt-failed status (and timeline) is visible so they can decide next action.

---

### User Story 4 - List updates when CityPak status changes (Priority: P2)

After CityPak status moves off not-delivered (for example delivered on a later attempt, or returned), the order leaves the **City Pack Delivery Failed** reminder list for that merchant so the bubble stays actionable.

**Why this priority**: Stale reminders erode trust; correctness after status refresh is required for daily ops.

**Independent Test**: Start with a not-delivered waybill in the list; refresh/update status to delivered; confirm the reminder count drops and the item is gone from the tab.

**Acceptance Scenarios**:

1. **Given** an order in **City Pack Delivery Failed**, **When** CityPak status becomes delivered (or otherwise no longer not-delivered), **Then** the order is removed from that tab on the next reminder refresh.
2. **Given** status briefly was not-delivered and later becomes not-delivered again after another failed attempt, **When** reminders refresh, **Then** the order appears again while the latest courier status remains not-delivered.

---

### Edge Cases

- Order has CityPak waybill not yet matched to an OS order: do not show in merchant reminder list until merchant ownership can be resolved from a matched OS order (or documented merchant link); unmatched rows stay on Pending Waybills only.
- Order has multiple CityPak waybills: show a reminder when **any** active matched CityPak waybill is not-delivered; click opens Waybill Details for the not-delivered waybill (if several, prefer the latest not-delivered).
- Merchant user without reminder-bubble access for this category: tab not shown; no data leak via count badge.
- Company/admin users with this reminder category permission: may see company-scoped failed items per existing reminder admin patterns; merchant users remain merchant-scoped.
- CityPak status unknown or stale until next sync: list uses last known stored CityPak status already available to Pending Waybills; does not invent failures.
- Returned-to-merchant terminal status is **not** treated as “not delivered” for this tab (separate operational path); only CityPak not-delivered / delivery attempt failed qualifies.
- Send-email action from this tab is **out of scope** for this release (planned later).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add a reminder-bubble category/tab named **City Pack Delivery Failed** (or equivalent clear label matching product language).
- **FR-002**: System MUST include an order in that category when it has a matched CityPak waybill whose latest known CityPak delivery status is **not delivered** / delivery attempt failed.
- **FR-003**: System MUST scope listed orders **merchant-wise**: each merchant sees only orders attributed to them.
- **FR-004**: System MUST attribute **DM General** orders to merchant **Sandali** (the controller of DM General) for this reminder category so those failures appear in her City Pack Delivery Failed list.
- **FR-005**: System MUST exclude orders whose CityPak status is not in the not-delivered / attempt-failed state from this category.
- **FR-006**: When a user clicks a City Pack Delivery Failed reminder item, system MUST open the **Waybill Details** experience for that order’s CityPak waybill (same information surface as Fulfillment waybill lookup details).
- **FR-007**: System MUST gate visibility of the category with the existing reminder-bubble permission model (dedicated category permission; admins follow current reminder permission patterns).
- **FR-008**: System MUST update membership in the category when CityPak status for the waybill changes away from not-delivered (item leaves the list on refresh).
- **FR-009**: System MUST NOT implement customer/merchant **send email** from this tab in this release; email is deferred to a later feature.
- **FR-010**: Reminder list items MUST show enough identity for ops (at least invoice number; waybill number when available) and waiting/age context consistent with other reminder categories where applicable.

### Key Entities

- **CityPak waybill upload / tracking record**: Courier booking linked to an invoice/order; holds latest CityPak delivery status and timeline used by Pending Waybills and Waybill Details.
- **OS order**: Internal order used to resolve merchant ownership (personal MER vs DM General).
- **Merchant (reminder audience)**: Staff user who owns personal MER orders; Sandali additionally owns DM General for this feature.
- **Reminder bubble item**: Category, title/body, link target to Waybill Details, and counts contributing to the bubble badge.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of matched CityPak waybills currently in not-delivered status with resolvable merchant ownership, the owning merchant (or Sandali for DM General) sees the order under **City Pack Delivery Failed** after reminder refresh.
- **SC-002**: Merchants never see another merchant’s personal MER CityPak delivery-failed orders in this tab (0 cross-merchant leaks in acceptance checks).
- **SC-003**: From reminder click to Waybill Details for the correct invoice/waybill completes in under 3 seconds under normal desk conditions for 95% of clicks in UAT.
- **SC-004**: After CityPak status leaves not-delivered, the order disappears from the tab on the next reminder load within one refresh cycle (no manual dismiss required for status-clearing).
- **SC-005**: In UAT, Sandali can locate DM General not-delivered CityPak orders in this tab without using Pending Waybills search first (task success on first attempt for at least 9 of 10 test cases).

## Assumptions

- “CityPak not delivered” means the courier status Cosmo already surfaces as not delivered / delivery attempt failed (CityPak “NOT DELIVERED”), not “still in transit” and not “returned to merchant.”
- Merchant attribution for personal orders follows the same ownership rules already used for other merchant-scoped reminder categories (MER / assigned merchant).
- DM General controller is Sandali for Cosmo OS; if that mapping is configurable later, this feature uses the current operational mapping at build time unless planning introduces a setting.
- Waybill Details means the existing Fulfillment waybill details view/modal opened for the relevant waybill (deep-link or equivalent), not a new standalone page.
- Email notification / “send email” from this tab is explicitly deferred; this spec only prepares the in-app reminder + navigation loop.
- Existing CityPak status sync (manual refresh, bulk check, scheduled sync, or push) remains the source of truth for when an order enters or leaves the list; this feature does not require a new courier integration.
- Non-CityPak couriers are out of scope for this tab.
- Reminder list capping and overdue/waiting display follow existing reminder-bubble conventions unless planning documents a category-specific override.
