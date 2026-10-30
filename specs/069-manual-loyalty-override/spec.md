# Feature Specification: Manual Loyalty Override

**Feature Branch**: `069-manual-loyalty-override`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "want place to mark contacts loyalty to gold or plat for uneligible contacts, some times we want level up contacts standard to loyalty even they not meet eligiblr limit, this is new permission level amins and permission allowed users only can do this, for that we have to give reason why we loyalty them, we can create reason templates also already create reasons 1.potentiol customer, 2.cosmetics loyalty customer(for vault os only) 3.supplementvault loyalty customer(for cosmo os only) and add reason, if we add new reason its save as template in both os, when we see that contact in customer insight that contact card show who make loyalty it, and reason and date"

## Clarifications

### Session 2026-10-29

- Q1: New staff-created reason templates — **A: Both OS.** A reason added on Cosmo OS is saved as a template on Vault OS too, and the reverse. Seeded OS-only reasons stay OS-scoped (Cosmetics loyalty customer on Vault only; Supplementvault loyalty customer on Cosmo only).
- Q2: After override — **A: ERP + Shopify too.** Apply ERP customer group and Shopify loyalty tags the same way eligible assignment does.
- Q3: Gold contact below Platinum spend — **A: Yes.** Allowed user may override Gold → Platinum with a reason.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Override Gold or Platinum on an ineligible contact (Priority: P1)

An admin, or a user granted the new manual-loyalty permission, opens a contact on Customer Insight who is still Standard and has not reached the Gold or Platinum spend limit. They choose Gold or Platinum, must pick or type a reason, and save. The contact becomes that loyalty tier even though spend is below the usual limit. Users without the permission never see the action and cannot perform it.

**Why this priority**: This is the whole feature — level up a contact the business wants as loyalty before they hit the spend bar.

**Independent Test**: Open an ineligible Standard contact as an allowed user, assign Gold with a seeded reason, confirm the Insight card shows Gold. Repeat as a user without the permission and confirm the action is hidden and refused.

**Acceptance Scenarios**:

1. **Given** a Standard contact whose lifetime spend is below the Gold limit, **When** an admin or permitted user chooses Gold, supplies a reason, and saves, **Then** that contact is Gold on Customer Insight.
2. **Given** a Standard contact whose lifetime spend is below the Platinum limit, **When** an allowed user chooses Platinum, supplies a reason, and saves, **Then** that contact is Platinum on Customer Insight.
3. **Given** a contact who already meets the spend rule for the chosen tier (or who is already in the normal Responded assignment queue for that tier), **When** an allowed user opens Insight, **Then** the existing eligible assignment path is used and this override control is not offered for that same tier.
4. **Given** a user who is not an admin and does not have the new permission, **When** they open the same ineligible contact, **Then** they cannot see or complete the override.
5. **Given** an allowed user tries to save Gold or Platinum with no reason, **When** they submit, **Then** the system refuses and the contact stays Standard.
6. **Given** a contact already Platinum, **When** an allowed user opens Insight, **Then** override is not offered.

---

### User Story 2 - Reason required, with templates (Priority: P1)

When overriding, the user must give a reason. They pick a saved template or type a new reason. Typing a new reason saves it as a template so it can be reused. Three templates ship from the start:

1. **Potential customer** — available on Cosmo OS and Vault OS.
2. **Cosmetics loyalty customer** — available on Vault OS only.
3. **Supplementvault loyalty customer** — available on Cosmo OS only.

A new staff-created template is saved for reuse (scope in FR-004).

**Why this priority**: Business will not grant loyalty without a recorded why; templates keep reasons consistent.

**Independent Test**: Assign with each seeded reason on the matching OS; type a new reason and confirm it appears in the list on the next assign; confirm Cosmetics reason is absent on Cosmo OS and Supplementvault reason is absent on Vault OS.

**Acceptance Scenarios**:

1. **Given** an allowed user starts an override, **When** the reason list opens on Vault OS, **Then** they see **Potential customer** and **Cosmetics loyalty customer**, and they do not see **Supplementvault loyalty customer**.
2. **Given** an allowed user starts an override, **When** the reason list opens on Cosmo OS, **Then** they see **Potential customer** and **Supplementvault loyalty customer**, and they do not see **Cosmetics loyalty customer**.
3. **Given** the user selects a template reason and saves, **When** the assignment completes, **Then** that template text is stored as the reason for this contact.
4. **Given** the user types a reason that is not yet a template and saves, **When** the assignment completes, **Then** the contact is assigned and that text is stored as a reusable template according to the dual-OS rule in FR-004.
5. **Given** a template already exists with the same wording, **When** the user types that wording again, **Then** a second duplicate template is not created.
6. **Given** a user without the override permission, **When** they try to add or change templates, **Then** they are refused.

---

### User Story 3 - Insight card shows who, reason, and date (Priority: P1)

Anyone who can open the contact on Customer Insight sees, on the contact card, who made the contact loyalty, the reason, and the date. This is true for a manual override. Eligible assignments that already show who and when keep that display; they show a reason only when one was recorded.

**Why this priority**: Staff must see why an ineligible contact is Gold or Platinum without opening a separate log.

**Independent Test**: After a manual Gold assign, open the same contact on Insight as another permitted viewer and read actor, reason, and date on the card.

**Acceptance Scenarios**:

1. **Given** a contact was manually assigned Gold or Platinum, **When** any user who can open that Insight card views it, **Then** the card shows the assignee’s name, the reason text, and the assignment date and time.
2. **Given** a contact was assigned through the existing eligible (Responded) path, **When** the card is viewed, **Then** it still shows who assigned and when; reason is shown only if a reason exists for that assignment.
3. **Given** a contact received Gold or Platinum from ERP with no OS user, **When** the card is viewed, **Then** it still shows ERP as the source and the date; reason is blank unless a later OS override recorded one.
4. **Given** a later allowed override upgrades Gold to Platinum with a new reason, **When** the card is viewed, **Then** it shows the new tier, the new actor, the new reason, and the new date (not the previous Gold override).

---

### User Story 4 - Permission is separate from normal loyalty assign (Priority: P1)

Admins can always override. Other users can override only when an admin ticks the new Contacts permission on their role. Holding Contact Master assign permission alone is not enough. No new named role is created.

**Why this priority**: Override bypasses the spend rule; it must stay narrower than everyday loyalty assignment.

**Independent Test**: Admin succeeds. User with only Contact Master assign fails. User with only the new permission succeeds. User with neither fails.

**Acceptance Scenarios**:

1. **Given** a company admin or super admin, **When** they open an ineligible Standard contact on Insight, **Then** override is available.
2. **Given** a non-admin whose role has the new permission, **When** they open the same contact, **Then** override is available.
3. **Given** a non-admin who can assign eligible loyalty but does not have the new permission, **When** they open an ineligible contact, **Then** override is hidden and any direct attempt is denied.
4. **Given** an admin ticks the new permission on an existing role, **When** a user with that role signs in, **Then** override becomes available without creating a new role.

---

### Edge Cases

- Spend is in the Push-to-Gold or Push-to-Platinum band (close but not eligible): override is allowed; those contacts are still ineligible.
- Contact is Gold (by spend or by earlier assign) and spend is still below Platinum: allowed user may override to Platinum with a reason.
- Contact is already Gold or Platinum: override to the same tier is refused (no duplicate stamp); user may not set Standard.
- Contact has incomplete profile, has not been marked Responded, or was marked Not interested: override is still allowed because this path is for ineligible / exception cases, not the merchant outreach queue.
- Reason text is only whitespace: treated as missing; save is refused.
- Two allowed users submit override on the same contact at the same time: one assignment wins; the card shows a single actor, reason, and date.
- Seeded OS-only reasons never appear on the other OS, even if someone pastes the same words as a custom reason on that other OS (custom wording is allowed; the seeded item itself stays OS-scoped).
- Merchant dashboard eligible cards and the Responded assignment queue do not gain this override; merchants without the new permission cannot use it.
- Existing eligible assign (Responded + spend band + complete profile) is unchanged for contacts who already qualify.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Customer Insight MUST offer a Gold or Platinum override on a contact who is not spend-eligible for the chosen tier, visible only to admins and users granted the new Contacts permission.
- **FR-002**: The new permission MUST live in the existing Contacts permission group. Admins MUST have it by default. No new named role MAY be created. Contact Master assign permission alone MUST NOT grant override.
- **FR-003**: Override MUST require a non-empty reason before Gold or Platinum is stored.
- **FR-004**: Users MUST be able to pick a saved reason template or type a new reason. A new reason MUST be saved as a reusable template on both Cosmo OS and Vault OS. Seeded OS-only reasons stay OS-scoped.
- **FR-005**: The product MUST ship these templates: **Potential customer** (both OS); **Cosmetics loyalty customer** (Vault OS only); **Supplementvault loyalty customer** (Cosmo OS only).
- **FR-006**: After a successful override, the Insight contact card MUST show who assigned, the reason, and the date and time, for every viewer who can open that card.
- **FR-007**: Override MUST set the contact’s registered loyalty to the chosen Gold or Platinum tier so the Insight badge matches that choice, not remaining spend.
- **FR-008**: Override MUST NOT be offered to set a tier the contact already holds, and MUST NOT offer a path back to Standard.
- **FR-009**: Users without the permission MUST NOT see the control and MUST be refused if they invoke the action directly.
- **FR-010**: Eligible loyalty assignment (spend limit + Responded queue) MUST keep working unchanged for contacts who meet those rules.
- **FR-011**: Duplicate template wording MUST NOT create a second template.
- **FR-012**: Override MUST record actor, reason, tier, and timestamp so the Insight card and audit history can show them later.
- **FR-013**: After override, Gold or Platinum MUST also be applied on ERP customer group and Shopify loyalty tags the same way eligible assignment does.

### Key Entities

- **Manual Loyalty Override**: One recorded decision that a permitted user set Gold or Platinum on a contact who did not meet the spend limit; attributes are contact, chosen tier, actor, reason text, and date/time.
- **Loyalty Reason Template**: Reusable reason wording. Seeded templates have an OS scope (both, Cosmo only, or Vault only). Staff-created templates follow the chosen dual-OS rule in FR-004.
- **Contacts Permission (manual override)**: New capability under the existing Contacts group; admins hold it automatically; others receive it only when ticked on their role.
- **Registered Loyalty Assignment**: Existing Gold/Platinum badge on the contact (who, when). This feature adds reason when the assignment was a manual override.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A trained allowed user can open an ineligible Standard contact on Customer Insight and finish Gold or Platinum override with a reason in under 2 minutes.
- **SC-002**: In a permission drill of admin, permitted non-admin, Contact Master without the new permission, and a merchant with neither, 100% of unauthorized attempts are blocked and 100% of authorized attempts succeed.
- **SC-003**: After override, 100% of Insight card views for that contact show assignee name, reason text, and assignment date (spot check of at least 10 contacts, including Gold and Platinum).
- **SC-004**: On Vault OS, 100% of override reason lists include Potential customer and Cosmetics loyalty customer and exclude Supplementvault loyalty customer; on Cosmo OS the reverse holds for the two OS-only seeded reasons.
- **SC-005**: Eligible contacts who already meet the spend and Responded rules still complete the existing assignment path with no extra reason step required (0 extra fields on that path).
- **SC-006**: Staff who type a new reason once can pick that same wording from the template list on the next override without typing it again.

## Assumptions

- Override lives on the Customer Insight contact card, not on merchant dashboard eligible cards and not on Contact Master list rows.
- Current spend limits stay as they are today (Gold at 100,000 LKR lifetime total, Platinum at 250,000 LKR). Override is the exception when spend is below the chosen tier’s limit.
- “Uneligible” means the contact does not currently qualify for the chosen tier by spend. Push-to-Gold / Push-to-Platinum near-miss contacts count as ineligible.
- Allowed users may choose Gold or Platinum in one step from Standard (Platinum does not require a prior Gold badge).
- Gold → Platinum below the Platinum spend limit is in scope (Q3 A).
- Downgrade to Standard is out of scope.
- Override skips merchant outreach gates (eligible stamp, Informed, Responded, complete profile). Permission plus reason is enough on OS.
- ERP customer group and Shopify loyalty tags update the same way as eligible assignment (Q2 A). Failure handling matches today’s eligible assign (tell the user; do not leave OS and storefront silently different).
- Reason is required only on this override path. The existing eligible assign path does not start asking for a reason.
- Seeded labels use corrected spelling **Potential customer** (user wrote “potentiol”).
- No new named role. Admins tick the new Contacts permission onto existing roles for non-admin users.
- Company isolation stays as today: each OS deployment has its own contacts; override on Cosmo OS does not change the same person’s Vault OS contact, and the reverse. Only reason *templates* are shared across OS (Q1 A).
- Audit Trail already logs loyalty assignment; override is logged as a loyalty assignment with reason included in the summary.
