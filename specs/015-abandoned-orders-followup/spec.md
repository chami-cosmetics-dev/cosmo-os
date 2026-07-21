# Feature Specification: Abandoned Orders Follow-up

**Feature Branch**: `015-abandoned-orders-followup`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "In Shopify some users add products to cart and go to checkout page and stop their process there. I think Shopify stores that order details. I want to get those orders to a new tab in the sidebar — Abandoned Orders — and show all orders there so we can follow up with those orders. Want to create permission for that also; merchant who has that permission can visit that page and follow up with those orders and mark them. Want to add customer response dropdown with predefined responses the customer can give like no more interest, purchased elsewhere, changed my mind, and also add remark input (optional). Also want to download CSV file for that."

## Clarifications

### Session 2026-07-21

- Q: Who should see which abandoned checkouts on this page? → A: All users with abandoned-orders permission see every company abandoned checkout (Shopify-sourced; not scoped by merchant or contact assignment).
- Q: When must the customer response dropdown be filled in? → A: Optional while status is Pending or Follow up; required when status is set to Closed.
- Q: How should abandoned checkout data stay up to date with Shopify? → A: Sync on page open plus background refresh approximately every 30 minutes.
- Q: How far back should the first sync pull abandoned checkouts from Shopify? → A: Last 7 days only.
- Q: Can a user reopen a Closed abandoned checkout? → A: Yes — Closed can be changed back to Follow up; customer response becomes editable again.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View abandoned checkouts in a dedicated sidebar page (Priority: P1)

A merchant or sales team member with access opens **Abandoned Orders** from the sidebar under Order Management. They see a list of Shopify checkouts where a customer reached checkout but did not complete payment, including enough detail to decide who to call or message next.

**Why this priority**: Without a centralized list, abandoned revenue is invisible and cannot be recovered.

**Independent Test**: Sign in as a user with abandoned-orders view permission; open Abandoned Orders; verify the list shows known abandoned checkouts with customer contact info, cart summary, checkout value, and abandoned date.

**Acceptance Scenarios**:

1. **Given** a user has permission to view abandoned orders, **When** they open the Abandoned Orders page from the sidebar, **Then** they see all abandoned checkouts for the company’s connected Shopify store(s) — not limited to customers assigned to them.
2. **Given** a user lacks abandoned-orders view permission, **When** they attempt to open the page or sidebar link, **Then** the link is hidden and direct navigation is denied with a clear access message.
3. **Given** abandoned checkouts exist across multiple dates, **When** the list loads, **Then** rows are ordered with the most recently abandoned first by default.
4. **Given** an abandoned checkout includes customer contact details from Shopify, **When** displayed, **Then** the row shows customer name, phone, email (when available), line items or product summary, checkout total, and abandoned date/time.

---

### User Story 2 - Follow up and record customer outcome (Priority: P1)

An authorized merchant contacts a customer about their abandoned checkout, then updates that row in Cosmo OS: sets follow-up status, selects the customer’s response from a predefined list, and optionally adds free-text remarks.

**Why this priority**: Recovery depends on tracking who was contacted and what the customer said so the team does not duplicate effort and can measure outcomes.

**Independent Test**: Open one abandoned checkout, mark it as followed up, choose “Purchased elsewhere”, add a remark, save; refresh and confirm values persist; row reflects the updated follow-up state in the list.

**Acceptance Scenarios**:

1. **Given** a user has permission to manage abandoned orders, **When** they open a row’s follow-up panel, **Then** they can set follow-up status to **Pending**, **Follow up**, or **Closed**.
2. **Given** the user sets status to **Pending** or **Follow up**, **When** they save without selecting a customer response, **Then** the save succeeds and customer response remains empty.
3. **Given** the user sets status to **Closed**, **When** they save without selecting a customer response, **Then** the save is rejected with a clear message that a response is required to close follow-up.
4. **Given** the user is closing follow-up, **When** they save with status **Closed**, **Then** they must select one customer response from: **No more interest**, **Purchased elsewhere**, **Changed my mind** (customer intends to complete or re-order), **Recovered sale** (customer completed purchase after contact), or **No response** (contact attempted, customer unreachable or did not answer).
5. **Given** the user enters an optional remark, **When** they save, **Then** the remark is stored with the record and visible on later review; leaving remark blank is allowed.
6. **Given** a user has view-only permission, **When** they open the page, **Then** they can see the list and existing follow-up data but cannot change status, response, or remarks.
7. **Given** a follow-up update is saved, **When** the list refreshes, **Then** the row shows updated status and customer response without requiring a full page reload workaround.
8. **Given** a row has status **Closed**, **When** a user with manage permission changes status back to **Follow up**, **Then** the save succeeds, the row re-enters the active follow-up queue, and customer response can be updated again on a later close.

---

### User Story 3 - Export abandoned orders to CSV (Priority: P2)

A merchant filters the abandoned-orders list (by date range, follow-up status, or customer response) and downloads a CSV file for offline calling lists, reporting, or sharing with a supervisor.

**Why this priority**: Teams often work from spreadsheets or dialers; export supports bulk outreach and management reporting.

**Independent Test**: Apply a filter showing at least three rows, click export, open the CSV; verify columns match visible data and row count matches the filtered set.

**Acceptance Scenarios**:

1. **Given** a user has permission to view abandoned orders, **When** they export from the current filtered list, **Then** a CSV downloads containing all rows matching active filters (not only the visible screen page).
2. **Given** the export runs, **When** the file is opened, **Then** it includes at minimum: abandoned date, customer name, phone, email, product/cart summary, checkout total, follow-up status, customer response, remark, and last updated by/at when follow-up was recorded.
3. **Given** the filtered list is empty, **When** the user attempts export, **Then** they receive a clear message that there is nothing to export and no file is generated.
4. **Given** a user lacks view permission, **When** they attempt export via direct action, **Then** access is denied.

---

### Edge Cases

- User reopens a mistakenly **Closed** row → status can return to **Follow up**; customer response remains visible but is not required until closed again.
- User saves status **Follow up** before knowing customer outcome → save succeeds without customer response; response required only when closing.
- Abandoned checkout later converts to a completed Shopify order → system marks it as **Recovered sale** automatically (or flags “Converted in Shopify”) and removes it from the default “needs follow-up” view while keeping history searchable.
- Customer has no phone or email → row still appears with cart and value; contact fields show as unavailable; user can still record follow-up if contacted through another channel noted in remarks.
- Duplicate abandoned checkouts for the same customer → each checkout appears as its own row keyed by Shopify checkout identity; list may show multiple rows for one customer.
- Very old abandoned checkouts beyond the 7-day import window → not imported; only checkouts within the last 7 days (or previously synced and still within retention) appear; no fabricated historical data.
- Concurrent updates by two merchants on the same row → last save wins with audit of who updated and when; user sees confirmation if their save overwrote a newer change (clear retry message).
- Shopify store temporarily unavailable during sync → list shows last successful sync with a visible “data as of” timestamp; user is told sync is stale rather than seeing an empty list without explanation.
- Large result set (hundreds of rows) → list supports pagination or virtual scrolling and export still includes the full filtered set within reasonable time (see Success Criteria).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add an **Abandoned Orders** entry in the sidebar under Order Management, visible only to users with abandoned-orders view permission.
- **FR-002**: System MUST define role permissions at minimum: **view abandoned orders** (read list and export) and **manage abandoned orders** (update follow-up status, customer response, and remarks).
- **FR-003**: System MUST retrieve abandoned checkout records from connected Shopify store(s) associated with the company (checkouts where the customer reached checkout but did not complete purchase).
- **FR-003a**: Users with abandoned-orders view permission MUST see the full company list of abandoned checkouts; visibility MUST NOT be restricted by merchant assignment or contact allocation.
- **FR-003b**: Initial sync and subsequent Shopify imports MUST include abandoned checkouts from the last 7 days only; checkouts older than 7 days MUST NOT be added to the list.
- **FR-004**: System MUST display for each abandoned checkout: customer name, phone, email (when available), cart/product summary, checkout total, abandoned date/time, and current follow-up fields.
- **FR-005**: System MUST support follow-up status values: **Pending** (not yet contacted), **Follow up** (contact in progress), **Closed** (follow-up finished). Users with manage permission MUST be able to change status from **Closed** back to **Follow up** to reopen follow-up.
- **FR-006**: System MUST provide a customer response dropdown with predefined options: **No more interest**, **Purchased elsewhere**, **Changed my mind**, **Recovered sale**, **No response**.
- **FR-006a**: Customer response MUST be optional when follow-up status is **Pending** or **Follow up**; MUST be required when saving with status **Closed**.
- **FR-007**: System MUST allow an optional free-text remark on follow-up save; remark length MUST be bounded to prevent abuse (consistent with existing text field limits in Cosmo OS).
- **FR-008**: System MUST persist follow-up status, customer response, remark, updating user, and update timestamp per abandoned checkout record.
- **FR-009**: Users with manage permission MUST be able to save follow-up updates; users with view-only permission MUST NOT mutate follow-up data.
- **FR-010**: System MUST provide list filters at minimum by date range, follow-up status, and customer response; default view shows **Pending** and **Follow up** rows (excluding **Closed** unless user expands filter).
- **FR-011**: System MUST provide CSV export of the currently filtered list including follow-up fields and core checkout/customer columns.
- **FR-012**: System MUST keep abandoned checkout data in sync with Shopify by syncing when the Abandoned Orders page is opened and refreshing in the background approximately every 30 minutes; MUST expose when data was last refreshed on the page.
- **FR-012a**: Users MUST be able to trigger an on-demand sync via page open (automatic); a separate manual refresh control is optional for v1.
- **FR-013**: When Shopify reports an abandoned checkout converted to a paid order, system MUST update the record to reflect recovery and exclude it from the default active follow-up queue.
- **FR-014**: Unauthorized access to the page, follow-up updates, or export MUST be blocked server-side with a clear denial (not client-only hiding).

### Key Entities

- **Abandoned checkout**: A Shopify checkout session that was started but not completed, identified uniquely per store; includes customer contact, cart contents, monetary total, and abandoned timestamp.
- **Follow-up record**: Cosmo OS tracking for an abandoned checkout — status (Pending / Follow up / Closed), customer response (predefined enum; required only when Closed), optional remark, last updated by, last updated at.
- **Abandoned orders permission**: Access control granting view and/or manage capability for this feature; assigned to roles like other Order Management permissions.
- **Company Shopify store link**: Existing company-to-Shopify store association determining which abandoned checkouts belong in the list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized users can open Abandoned Orders and see their first page of results within 5 seconds under normal load (excluding intentional Shopify outage); data MUST be no older than the last successful sync (page-open or ~30-minute background refresh).
- **SC-002**: 100% of follow-up saves (status + response + optional remark) persist correctly after page refresh in verification testing.
- **SC-003**: Merchants with manage permission can complete a follow-up update (select response, add remark, save) in under 1 minute per row without leaving the page.
- **SC-004**: CSV export of up to 1,000 filtered rows completes and downloads within 30 seconds under normal load.
- **SC-005**: Unauthorized users are denied page access and export in 100% of verification attempts (sidebar hidden and server rejects direct URL).
- **SC-006**: At least 80% of team members in a pilot can identify which abandoned checkouts still need contact using default filters without training beyond a 5-minute walkthrough.

## Assumptions

- Abandoned checkout data is sourced from Shopify’s abandoned checkout capability for stores already linked to company locations in Cosmo OS (same multi-store pattern as existing order ingestion).
- Abandoned checkouts are company-wide Shopify data; any user with permission sees all rows. Contact allocation and merchant assignment do not filter this list.
- Initial sync and ongoing imports include abandoned checkouts from the **last 7 days** only; older checkouts are out of scope unless Shopify still returns them within that window on a later sync.
- **Changed my mind** means the customer is still interested or plans to purchase; **Recovered sale** means the checkout converted to a completed order (manually confirmed or auto-detected from Shopify).
- Follow-up workflow mirrors existing merchant review patterns (Pending → Follow up → Closed) for familiarity; no automated SMS/email recovery is in scope for v1.
- Shopify sync runs on Abandoned Orders page open and repeats in the background about every 30 minutes; no real-time webhooks required for v1.
- CSV export uses the same filtered dataset the user sees, including all pages of results.
- Super-admin and admin roles receive both view and manage permissions by default; other roles receive permissions only when explicitly assigned (consistent with existing RBAC setup).
- One permission pair (`abandoned_orders.read`, `abandoned_orders.manage`) is sufficient for v1; finer-grained export-only permission is out of scope unless requested later.
