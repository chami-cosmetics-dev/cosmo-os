# Feature Specification: Loyalty SMS Templates

**Feature Branch**: `070-loyalty-sms-templates`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "we have process potential customers update to gold and platinum loyalty levels, no i want sen sms when they update to loyalty customer wishing them for beign loyalty also their discount level they can got gold = 10% plat = 15% with allocated merchant contact office contact number contact merchant name, numbers for you next order like wise, we can take that mercahnt phone nuber from here, also we have email templates part as like it we can create sms template for our future usgaes, i want create 4 different sms templates 2 for gold 2 for platinum wishings, and we can show those templates in our system we can edit them and save also that 2 gold and 2plat smsm send for customers randomly not same for all, also we can add new template there,"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Wish SMS on Gold / Platinum loyalty update (Priority: P1)

When a potential (or other) customer is updated to Gold or Platinum loyalty, the system sends them a congratulatory SMS. The message wishes them well as a loyalty customer, states their discount (Gold = 10%, Platinum = 15%), and includes the allocated merchant’s name, the merchant’s mobile number (from Staff mobile), and an office contact number so they know who to call for the next order.

**Why this priority**: This is the customer-facing outcome — loyalty upgrades become a personal welcome with clear discount and contact details.

**Independent Test**: Assign a contact with a valid phone to Gold; confirm one SMS is queued/sent with Gold 10% wording and merchant/office details. Repeat for Platinum with 15%.

**Acceptance Scenarios**:

1. **Given** a contact with a valid customer phone who is not yet Gold, **When** they are updated to Gold loyalty, **Then** the system sends exactly one loyalty-wish SMS for that upgrade using a Gold template and the text includes 10% discount.
2. **Given** a contact with a valid customer phone who is not yet Platinum, **When** they are updated to Platinum loyalty, **Then** the system sends exactly one loyalty-wish SMS for that upgrade using a Platinum template and the text includes 15% discount.
3. **Given** a contact upgraded to Gold or Platinum who has an allocated merchant with a Staff mobile number, **When** the SMS is built, **Then** it includes that merchant’s known/display name and that mobile number.
4. **Given** a contact upgraded to Gold or Platinum, **When** the SMS is built, **Then** it includes the configured office contact number for next-order help.
5. **Given** a contact upgraded to Gold or Platinum with no usable customer phone, **When** the update completes, **Then** loyalty assignment still succeeds and no SMS is sent; the miss is recorded for staff review.
6. **Given** a contact already Gold who is later updated to Platinum, **When** the Platinum update completes, **Then** a Platinum wish SMS is sent (Gold wish is not re-sent for that Platinum event).

---

### User Story 2 - Random Gold / Platinum template selection (Priority: P1)

The business ships four loyalty-wish templates: two for Gold and two for Platinum. When a customer is upgraded, the system picks one of the active templates for that tier at random so not every customer gets the same wording.

**Why this priority**: Random variation is an explicit business rule so messages feel personal and less identical across customers.

**Independent Test**: With two active Gold templates, run several Gold upgrades and confirm both templates appear across sends; never use a Platinum template for Gold (and vice versa).

**Acceptance Scenarios**:

1. **Given** two active Gold wish templates, **When** multiple contacts are updated to Gold, **Then** each send uses one of those Gold templates chosen at random, and over several sends both templates are eligible (not hard-locked to one).
2. **Given** two active Platinum wish templates, **When** multiple contacts are updated to Platinum, **Then** each send uses one of those Platinum templates chosen at random.
3. **Given** only one active template for a tier, **When** a customer is upgraded to that tier, **Then** that single template is used.
4. **Given** no active template for the target tier, **When** a customer is upgraded to that tier, **Then** loyalty assignment still succeeds, no SMS is sent, and the miss is recorded for staff review.
5. **Given** inactive or wrong-tier templates exist, **When** selection runs, **Then** they are never chosen for that send.

---

### User Story 3 - Manage SMS templates like Email Templates (Priority: P1)

Authorized staff open an SMS Templates area (same settings family as Email Templates / SMS Notifications). They see existing templates, open one to edit name, key/tier, body text (with placeholders), and save. They can create new templates for future use, including additional Gold or Platinum wish variants beyond the initial four.

**Why this priority**: Without editable templates, marketing/ops cannot tune wording or add variants without a code change.

**Independent Test**: Open the SMS Templates screen, edit a Gold body and save, confirm reload shows the new text; create a new Platinum template and confirm it appears in the list and becomes eligible for random Platinum sends when active.

**Acceptance Scenarios**:

1. **Given** an authorized user opens SMS Templates, **When** the page loads, **Then** they see a list of templates (including the four seeded Gold/Platinum wish templates) with name and key/tier visible.
2. **Given** the user selects a template, **When** they change the body (and allowed fields) and save, **Then** the changes persist and a later send for that tier can use the updated text.
3. **Given** the user chooses New, **When** they enter name, tier (or purpose key), body, and save, **Then** the new template appears in the list and can be edited later.
4. **Given** a template body uses placeholders for merchant name, merchant phone, office contact number, discount, tier, and/or customer name, **When** a loyalty SMS is sent, **Then** those placeholders are replaced with the real values for that contact.
5. **Given** a user without template-manage permission, **When** they try to open or change SMS Templates, **Then** they are refused.
6. **Given** a live preview (or sample render) is shown while editing, **When** sample values are applied, **Then** the user can see roughly how the SMS will read before saving.

---

### User Story 4 - Seeded four wish templates ready on day one (Priority: P2)

On first use, the system provides four distinct loyalty-wish SMS templates: two Gold and two Platinum. Bodies congratulate the customer, state the correct discount, and leave room for merchant name, merchant mobile, and office number for the next order.

**Why this priority**: Ops can go live without drafting from scratch; they can still edit afterward.

**Independent Test**: Fresh company (or first open of SMS Templates) shows exactly two Gold and two Platinum wish templates with distinct wording and correct discount text.

**Acceptance Scenarios**:

1. **Given** SMS Templates has not been customized yet, **When** an authorized user opens the list, **Then** four loyalty-wish templates are present: two Gold (10%) and two Platinum (15%).
2. **Given** those seeded templates, **When** staff edit and save, **Then** custom text replaces the seed for future sends without losing the tier assignment.
3. **Given** staff add a fifth Gold wish template and leave it active, **When** Gold random selection runs, **Then** all active Gold wish templates (including the new one) are in the pool.

---

### Edge Cases

- Customer phone missing, invalid, or unusable → no SMS; loyalty update still succeeds; miss recorded.
- Allocated merchant missing → SMS still sends with available fields; merchant name/phone placeholders omit or use a safe fallback (e.g. office-only contact line); miss of merchant details recorded.
- Allocated merchant exists but Staff mobile is empty → merchant name may still appear; phone placeholder omitted or office number emphasized; miss recorded.
- Office contact number not configured → SMS still sends other content; office placeholder omitted or a clear internal miss is recorded so ops can fix config.
- Duplicate loyalty update to the same tier (already Gold, set Gold again) → no second wish SMS for the same tier.
- SMS provider failure → loyalty update is not rolled back; failure is logged/visible for retry or ops follow-up using existing SMS ops patterns.
- Template body empty or over carrier-safe length guidance → save is refused or warned; empty active templates are not selected for send.
- Very high volume of upgrades same day → each eligible upgrade still gets one independent random pick; sends do not block the loyalty UI for staff.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST send a loyalty-wish SMS when a contact’s loyalty level is updated to Gold or to Platinum (including potential-customer conversion and other existing upgrade paths that result in Gold/Platinum).
- **FR-002**: Gold wish SMS content MUST communicate a 10% discount; Platinum wish SMS content MUST communicate a 15% discount (via template text and/or substituted discount placeholder).
- **FR-003**: Loyalty-wish SMS MUST include, when available: allocated merchant name, allocated merchant mobile (from that merchant’s Staff mobile), and configured office contact number for next-order contact.
- **FR-004**: System MUST resolve merchant mobile from the Staff record linked to the allocated merchant (same mobile staff maintain on Staff Management).
- **FR-005**: System MUST choose the SMS body by randomly selecting one active loyalty-wish template matching the target tier (Gold pool for Gold upgrades; Platinum pool for Platinum upgrades).
- **FR-006**: System MUST seed four distinct loyalty-wish templates (two Gold, two Platinum) available for edit without a code deploy.
- **FR-007**: Authorized users MUST be able to list, open, edit, and save SMS templates (name, identifier/key, tier or purpose, body, active flag) in a settings experience consistent with Email Templates.
- **FR-008**: Authorized users MUST be able to create additional SMS templates (including more Gold/Platinum wish variants) for future use.
- **FR-009**: Template bodies MUST support placeholders for at least: customer name (or known name), loyalty tier, discount percent, merchant name, merchant phone, and office contact number.
- **FR-010**: System MUST NOT send a second wish SMS when a contact is re-saved at the same loyalty tier they already hold.
- **FR-011**: System MUST send a Platinum wish SMS when a Gold contact is upgraded to Platinum.
- **FR-012**: Loyalty assignment MUST succeed even if SMS cannot be sent (missing phone, no active template, provider error); failures MUST be visible to ops through the existing SMS logging/notification patterns.
- **FR-013**: Random selection MUST ignore inactive templates and templates not belonging to the target tier’s wish pool.
- **FR-014**: Access to manage SMS templates MUST be limited to users with the appropriate settings permission (same class of control as Email Templates / SMS settings).
- **FR-015**: System MUST keep a configurable office contact number used when filling the office-number placeholder in loyalty-wish SMS.
- **FR-016**: SMS Templates UI SHOULD show a sample preview of the rendered message while editing.

### Key Entities

- **SMS Template**: Named reusable message body with key/identifier, loyalty tier or purpose (e.g. Gold wish / Platinum wish / future uses), active flag, and placeholder-capable text; company-scoped like email templates.
- **Loyalty Wish Send**: Record of an attempt to congratulate a contact on Gold or Platinum (contact, tier, template used, outcome, time); supports “already wished for this tier” and ops troubleshooting.
- **Allocated Merchant Contact Details**: Merchant name and Staff mobile resolved from the contact’s current allocation and Staff Management mobile field.
- **Office Contact Number**: Company-level phone number inserted into templates for next-order office contact.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a successful Gold or Platinum loyalty update with a valid customer phone and at least one active matching template, the customer receives (or the system records a successful send of) a wish SMS within 2 minutes in normal operating conditions.
- **SC-002**: In a sample of 20 Gold upgrades with two active Gold templates, both templates are used at least once (random pool working; not a single fixed message for all).
- **SC-003**: 100% of successful Gold wish SMS bodies state 10% discount; 100% of successful Platinum wish SMS bodies state 15% discount (verified by spot-check of sent content or preview with real placeholders).
- **SC-004**: Authorized staff can open SMS Templates, edit a seeded template, and confirm the saved text on reload in under 2 minutes.
- **SC-005**: Authorized staff can add a new Gold or Platinum wish template and have it eligible for random selection on the next upgrade without a developer change.
- **SC-006**: When merchant Staff mobile and office number are configured, at least 95% of successful wish SMS include both contact numbers (or clearly labeled contact lines) in the rendered message.
- **SC-007**: Loyalty updates never fail solely because SMS sending failed; ops can identify missed sends from logs/status within the same working day.

## Assumptions

- “Update to loyalty” covers any path that sets a contact to Gold or Platinum (eligible assignment, potential-customer flow, and manual override), not only one screen.
- Discount rates are fixed for this feature: Gold 10%, Platinum 15%, unless template text is edited; placeholders default to those values by tier.
- Merchant phone is the Staff **Mobile** field for the allocated merchant (as shown on Staff Management / Edit staff), not the customer’s phone.
- Office contact number is a company setting (one primary office number for SMS placeholders), editable by authorized staff alongside or within SMS template settings.
- SMS delivery reuses the organization’s existing SMS provider and logging approach (same family as Daily Sales SMS / SMS Notifications).
- SMS Templates live in Cosmo OS settings beside Email Templates / SMS Notifications; Vault OS is out of scope unless later requested.
- Seeded four templates are company-visible defaults; edits are per company.
- Random selection is uniform among active templates in the tier’s wish pool; fairness over large volume is enough (no need for “avoid last used” logic in v1).
- Customer-facing language is English unless staff edit templates to another language.
- Character-length guidance may warn editors; multi-part SMS is allowed if the provider already supports it for other OS SMS.
- Future non-loyalty SMS templates may share the same SMS Templates area; v1 only automates send for Gold/Platinum loyalty wishes.
