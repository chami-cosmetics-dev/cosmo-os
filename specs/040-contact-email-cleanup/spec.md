# Feature Specification: Contact Email Cleanup & Insight Display

**Feature Branch**: `040-contact-email-cleanup`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "we have lot of email in our contact base some emails are not really working emails, i want double check if their not working email then i want remove them from customer, also in insight page if that customer have email then only show i want stick email icon if that user not have mail then show it "-" blank, but email field should visible, also list down email that start from cosmetics or any place cosmatics word like ise cuz some of our users add their mail to customer mail section, i want remove them also"

## Clarifications

### Session 2026-08-12

- Q: How should v1 decide an email is “not working” for the Invalid cleanup list? → A: Format-only — non-empty emails that fail normal email-shape checks (no deliverability / bounce probing in v1)
- Q: When a customer has an email on the Insight page, what should the email field show? → A: Icon + full email address (empty still shows "-")
- Q: When staff confirm clear for a contact, which emails should be removed? → A: Clear only matching bad address(es) for the list reason (invalid format or cosmetics pattern); keep any other valid emails on the same contact
- Q: For the Invalid format list, which emails should be checked? → A: Primary and secondary email aliases (same breadth as cosmetics scanning)
- Q: After clearing a bad primary email, if a valid secondary remains, what should happen? → A: Promote a remaining valid secondary to primary

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Remove invalid or non-working customer emails (Priority: P1)

A staff user finds customer contacts whose primary or secondary email fails basic email-shape validation (malformed or incomplete). They review the list, confirm which emails to clear, and remove only those matching invalid addresses without deleting the customer records.

**Why this priority**: Bad emails pollute outreach and loyalty work; cleaning them is the core business need.

**Independent Test**: Can be tested by loading a contacts email-cleanup view with known bad emails, selecting them, clearing the email field, and confirming the customer still exists with no email.

**Acceptance Scenarios**:

1. **Given** contacts with primary or secondary emails that fail email-shape validation, **When** staff open the Invalid email cleanup review list, **Then** those contacts appear with enough identity context (name, phone, flagged email) to decide.
2. **Given** staff select one or more contacts on the review list, **When** they confirm remove email, **Then** only the matching invalid-format address(es) are cleared and the customers remain in the contact base.
3. **Given** a contact whose email is already empty, **When** staff view the review list, **Then** that contact is not treated as needing email removal for emptiness alone.
4. **Given** staff cancel a remove action, **When** the confirmation is dismissed, **Then** no email fields are changed.

---

### User Story 2 - List and remove cosmetics / company-pattern emails (Priority: P1)

Staff list customer emails that contain company or staff mailbox patterns such as "cosmetics" / "cosmatics" (including when the word appears at the start or anywhere in the address). These are staff or company addresses wrongly stored as customer emails. Staff review the list and remove those emails from the customers.

**Why this priority**: Same cleanup goal as P1; explicitly called out because staff mailboxes pollute the customer email field.

**Independent Test**: Seed contacts with emails like `cosmetics@example.com`, `sales.cosmetics.lk@example.com`, and `user@cosmatics.example`, open the list filtered to this pattern, remove them, and verify emails are cleared while contacts remain.

**Acceptance Scenarios**:

1. **Given** contacts whose email contains "cosmetic", "cosmetics", or "cosmatics" (case-insensitive, any position), **When** staff open the cosmetics-pattern email list, **Then** those contacts are listed with name, phone, and email.
2. **Given** a contact email that does not match the cosmetics/cosmatics pattern, **When** staff view that list, **Then** the contact does not appear there.
3. **Given** staff select cosmetics-pattern matches, **When** they confirm remove email, **Then** only the matching cosmetics/cosmatics address(es) are cleared, any other valid emails on the contact are kept, and contacts remain.
4. **Given** the list is empty, **When** staff open it, **Then** they see a clear empty state (no matches), not an error.

---

### User Story 3 - Insight page email presence display (Priority: P2)

On the customer insight page, the email field stays visible for every customer. If the customer has an email, staff see the email indicator (icon) **and** the full email address. If the customer has no email, the field still shows and displays "-" (blank placeholder) instead of an icon or empty-looking gap.

**Why this priority**: Improves day-to-day insight scanning; depends on clean email data but delivers value even before bulk cleanup finishes.

**Independent Test**: Open insight for a contact with email and one without; confirm icon vs "-" while the email column/field remains present in both cases.

**Acceptance Scenarios**:

1. **Given** a customer with a non-empty email, **When** staff view them on the insight page, **Then** the email field is visible and shows the email indicator (icon) together with the full email address.
2. **Given** a customer with no email, **When** staff view them on the insight page, **Then** the email field is still visible and shows "-" (not an icon, not a missing column).
3. **Given** a customer's email was just cleared by cleanup, **When** staff refresh or reopen insight for that customer, **Then** the email field shows "-".

---

### Edge Cases

- Contact has both a matching bad email and a valid personal email: only the bad address is removed; the valid email remains on the contact and insight shows it after refresh.
- When a cleared address was the primary email and a valid secondary remains, the system promotes that secondary to primary so insight and outreach keep a usable email.
- Email with only whitespace is treated as no email (show "-" on insight; eligible for cleanup as empty/invalid).
- Mixed-case cosmetics variants (e.g. `Cosmetics@…`, `COSMATICS`) still match the pattern list.
- Partial words that are not company patterns (e.g. unrelated strings that do not contain cosmetic/cosmetics/cosmatics) do not appear on the cosmetics list.
- Removing email never deletes the contact, orders, or allocation history.
- Concurrent edit: if another user changes the same contact's email before confirm, removal applies only to clearing email (or shows a clear failure for that row) without corrupting other contact fields.
- Very large match lists remain usable (paging or progressive load) so staff can still review and remove in batches.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a staff-facing review list of contacts whose primary or secondary email is non-empty and fails email-shape validation (format-only; no deliverability probing), including customer identity context and the flagged email.
- **FR-002**: System MUST allow authorized staff to remove only the matching invalid-format address(es) from one or many selected customers from that review list without deleting the customer or clearing unrelated valid emails on the same contact.
- **FR-003**: System MUST provide a staff-facing list of contacts whose primary or secondary email contains "cosmetic", "cosmetics", or "cosmatics" case-insensitively anywhere in the address (local part or domain).
- **FR-004**: System MUST allow authorized staff to remove only matching cosmetics-pattern address(es) for selected contacts without deleting the customer or clearing unrelated valid emails on the same contact.
- **FR-005**: System MUST require an explicit confirmation before any bulk or multi-select email removal.
- **FR-006**: System MUST keep the email field visible on the customer insight page for every customer row/card shown.
- **FR-007**: On the insight page, when a customer has an email, the system MUST show an email indicator (icon) and the full email address.
- **FR-008**: On the insight page, when a customer has no email, the system MUST show "-" in the email field (not an icon and not a missing field).
- **FR-009**: After email removal, insight and contact views MUST reflect the contact's remaining email (or "-" when none remains).
- **FR-010**: Only staff roles that already manage contacts / insight MAY access email cleanup lists and perform removals; other users MUST NOT.
- **FR-011**: System MUST record enough audit context for email removals (who cleared which contact email, and when) so staff can review cleanup actions later.
- **FR-012**: When a cleared address was the contact's primary email and at least one valid secondary email remains, the system MUST promote one remaining valid secondary to primary.

### Key Entities

- **Contact (Customer)**: Person in the contact base; may have a primary email and optional secondary email aliases used for outreach and insight.
- **Suspect Email Review Item**: A contact flagged for cleanup because the primary email fails format validation or a primary/secondary email matches the cosmetics/company pattern; includes display identity and the specific flagged email.
- **Email Removal Action**: A confirmed staff action that clears only the matching flagged address(es) on a contact and leaves an audit trail.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can open the cosmetics-pattern list and identify matching customer emails in under 1 minute for a typical search of the contact base.
- **SC-002**: Staff can clear email from a batch of at least 25 selected contacts in one confirmed action in under 2 minutes.
- **SC-003**: 100% of insight rows keep the email field visible; contacts without email show "-" and contacts with email show the email indicator plus the full address.
- **SC-004**: After cleanup, at least 95% of sampled cosmetics/cosmatics-pattern emails previously listed are no longer present on any customer email field (verified by re-running the list).
- **SC-005**: Zero customer records are deleted as a side effect of email removal in acceptance testing.
- **SC-006**: Staff can complete the primary cleanup path (find → review → confirm remove) without training beyond on-screen labels, on first attempt in walkthrough testing.

## Assumptions

- "Remove them from customer" means clear only the matching bad email address(es) on the contact, not delete the customer, related orders, or unrelated valid emails on the same contact.
- "Not working" / Invalid list for v1 means non-empty primary **or secondary** addresses that fail email-shape validation (malformed or incomplete). Whitespace-only is treated as empty (no email). Live mailbox / bounce probing is out of scope for v1. Staff still confirm before clear; they do not pick arbitrary valid-format emails from a separate browser in this story.
- Cosmetics matching covers the substrings `cosmetic`, `cosmetics`, and `cosmatics` (common typo) case-insensitively anywhere in the email string.
- Insight display change applies to the existing customer insight page email column/field already used by staff: icon + address when present; "-" when absent.
- Cleanup tools are admin/staff features inside the existing dashboard, not customer-facing.
- Existing contact permissions govern who may clear emails; no new public self-service.
- When primary is cleared and valid secondary emails remain, one valid secondary is promoted to primary automatically.
- Audit of email clears reuses the project's normal admin audit expectations where available.
