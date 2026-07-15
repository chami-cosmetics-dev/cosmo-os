# Feature Specification: Copy Review Contacts for Follow-up

**Feature Branch**: `007-copy-review-contacts`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "merchant review page we can select merchant and we can get all assigned customers — add function to copy all contact numbers in the list; when we copy those numbers review status should mark as follow up; after merchant gets those numbers they follow one by one and update reviews in our OS"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Copy assigned contact numbers and mark Follow up (Priority: P1)

A merchant reviewer opens Merchant Reviews, selects their merchant (and any other filters), reviews the Assigned Review Queue, and uses a single action to copy all contact numbers from that queue to the clipboard. At the same time, every order included in that copy is marked **Follow up** so the queue reflects that outbound calling has started.

**Why this priority**: This is the core workflow request — get numbers quickly for calling, and automatically move statuses so the list no longer looks untouched/pending.

**Independent Test**: With a filtered queue of several pending orders that have phone numbers, trigger copy-all; clipboard contains those numbers and each affected order shows status Follow up without opening each order.

**Acceptance Scenarios**:

1. **Given** the Assigned Review Queue shows filtered orders for a selected merchant, **When** the reviewer triggers “copy all contact numbers”, **Then** all phone numbers from orders in that current queue that have a contact number are placed on the clipboard in a call-ready list, and a clear success confirmation is shown (including how many numbers were copied).
2. **Given** those numbers were copied successfully, **When** the action completes, **Then** each order that contributed a number is marked **Follow up** (and no longer shows as Pending if it was Pending).
3. **Given** the reviewer has permission to manage merchant reviews, **When** they use the copy-all action, **Then** the status updates are saved permanently so a refresh still shows Follow up.
4. **Given** the reviewer lacks manage permission (read-only), **When** they attempt copy-all with status change, **Then** the system blocks the status update and does not leave clipboard + status in an inconsistent confirmed state without telling them they cannot update statuses.

---

### User Story 2 - Call customers one-by-one and complete reviews in Cosmo OS (Priority: P1)

After copying numbers, the reviewer calls customers from their dialer/phone using the copied list, then returns to Cosmo OS Merchant Reviews, opens each relevant order, and updates the Review Capture Form (status and call notes) as they do today — completing the review workflow without needing a separate spreadsheet.

**Why this priority**: Copy/status change only starts follow-up; business value is completed when reviews are still logged in Cosmo OS.

**Independent Test**: After copy-all marks orders Follow up, open one order, save a reviewed/no-response result with remarks; that order reflects the new status independently of others still in Follow up.

**Acceptance Scenarios**:

1. **Given** orders are already **Follow up** from copy-all, **When** the reviewer opens an order and saves the Review Capture Form with a new status (e.g. Reviewed or No response) and remarks, **Then** that order updates as today and remains searchable/filterable by the new status.
2. **Given** the reviewer still has other Follow up orders in the queue, **When** they filter the queue by Follow up (or All), **Then** remaining uncalled/unfinished orders stay visible so they can continue the list.

---

### User Story 3 - Safe handling when the queue is empty or incomplete (Priority: P2)

The reviewer is told clearly when there is nothing useful to copy, or when some queue rows cannot contribute a number, so they do not assume every listed customer was included.

**Why this priority**: Prevents wasted calling time and incorrect assumptions about who was marked Follow up.

**Independent Test**: Run copy-all on an empty queue, and on a queue mixing orders with and without phones; confirm messaging and which statuses changed.

**Acceptance Scenarios**:

1. **Given** the current Assigned Review Queue is empty, **When** the reviewer triggers copy-all, **Then** nothing is copied, no statuses change, and the user is told there are no contacts to copy.
2. **Given** some orders in the queue have no contact number, **When** copy-all runs, **Then** only orders with numbers are copied and marked Follow up, and the user is informed how many were skipped for missing numbers.
3. **Given** every order in the queue already lacks a usable contact number, **When** copy-all runs, **Then** the clipboard is not treated as a successful call list, no statuses change, and the user is informed that no numbers were available.

---

### Edge Cases

- What happens if the filtered queue is very large (hundreds of orders)? Copy-all still includes the full current filtered queue (not only the first visible screenful), and status updates apply to all successfully copied rows; the user sees a clear count when finished.
- What happens if an order is already Follow up, Reviewed, or No response? Orders already Reviewed or No response are not re-marked merely because they appear in a broad filter; only Pending (and optionally already-Follow up if re-copied — treated as remaining Follow up with no regression) participate in the Follow up mark. Default: mark Follow up for Pending orders that contribute a number; already Follow up stay Follow up; Reviewed / No response are excluded from the bulk status change even if somehow visible in the filter.
- What happens if clipboard access fails (browser permission / unsupported environment)? Statuses are not marked Follow up unless the copy succeeds, so callers are not told work has started when numbers were never obtained.
- What happens if status updates partially fail after a successful copy? The user is warned that numbers may have been copied but not all statuses were updated, and shown how many succeeded vs failed so they can retry or fix manually.
- Duplicate phone numbers across orders in the same queue: both orders are still marked Follow up if eligible; the clipboard may list the number once or once per order — default once per order so the reviewer can match volume of calls to queue size (documented in Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Merchant Reviews MUST provide a clear action (e.g. “Copy all contact numbers”) available in the Assigned Review Queue context after the merchant (and other) filters are applied.
- **FR-002**: That action MUST copy contact numbers from all orders in the **current filtered Assigned Review Queue** (the same set the list is showing for the active filters), not only a single selected order.
- **FR-003**: Copied numbers MUST be placed on the user’s clipboard in a simple call-ready format (one number per line).
- **FR-004**: After a successful copy, the system MUST set review status to **Follow up** for each eligible order that contributed a contact number (eligible = Pending, or already Follow up with no change other than remaining Follow up).
- **FR-005**: Orders in terminal review outcomes (**Reviewed**, **No response**) MUST NOT be bulk-changed to Follow up by this action.
- **FR-006**: Orders without a usable contact number MUST be skipped for both clipboard inclusion and Follow up marking, with the skipped count communicated to the user.
- **FR-007**: If the queue has no copyable numbers, the system MUST NOT change any review statuses and MUST inform the user.
- **FR-008**: Follow up marking MUST only persist when the user is authorized to update merchant reviews; unauthorized users MUST receive a clear denial for the status-changing part of the action.
- **FR-009**: Clipboard success MUST gate bulk Follow up updates: if numbers cannot be copied, statuses MUST remain unchanged.
- **FR-010**: Existing per-order Review Capture Form behavior MUST remain available so reviewers can update status and remarks after calling customers one by one.
- **FR-011**: After copy-all, the queue UI MUST refresh (or update in place) so badges/statuses and counts reflect Follow up without requiring a full page reload workaround.
- **FR-012**: The action MUST report counts for: numbers copied, orders marked Follow up, and orders skipped (missing number or ineligible status).

### Key Entities

- **Assigned Review Queue**: The merchant-filtered list of orders awaiting or in review on the Merchant Reviews page (same filters: search, status, merchant, date range).
- **Order contact number**: The customer phone number associated with a queue order used for outbound follow-up calls.
- **Merchant review status**: Business review state for an order — Pending, Follow up, Reviewed, No response.
- **Review Capture Form**: Existing per-order form used after a call to record outcome and remarks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reviewer can copy contact numbers for a filtered queue of at least 50 orders and see matching Follow up status updates in under 15 seconds from triggering the action (excluding intentional network outages).
- **SC-002**: 100% of Pending orders with a contact number in the filtered queue are marked Follow up when copy-all succeeds; 0 Reviewed / No response orders are bulk-changed by the same action.
- **SC-003**: Reviewers can complete the post-call update for a Follow up order using the existing capture form without needing a separate external contact sheet as the system of record.
- **SC-004**: In empty-queue or no-number scenarios, reviewers receive an unambiguous message and leave statuses unchanged 100% of the time in verification.
- **SC-005**: First-time trained reviewers can locate and use copy-all without assistance (task completion on first attempt for ≥90% of test users in a short usability check).

## Assumptions

- The feature builds on the existing Merchant Reviews page where merchants are selected and assigned orders already appear in the Assigned Review Queue.
- “All contact numbers in the list” means the **current filtered queue**, including orders not scrolled into view yet — not a hand-picked subset and not the entire unfiltered company backlog.
- Review statuses use the existing business values: Pending, Follow up, Reviewed, No response.
- Clipboard format is one phone number per line; each order with a number contributes one line (duplicates allowed if multiple orders share a number).
- Individual calling and note-taking after copy remains the existing Review Capture Form workflow; this feature does not add auto-dial, SMS blast, or call recording.
- Read-only reviewers may be able to copy numbers for convenience only if product later chooses; default for this spec is that the combined “copy + mark Follow up” action requires manage permission. If product prefers copy without status change for read-only users, that can be clarified later without blocking the P1 managed workflow.
- No new review status values are introduced.
- Confirmation dialog before copy-all is optional for v1; a clear post-action summary is required. If accidental bulk Follow up becomes a problem, a confirm step can be added later.
