# Feature Specification: Register New Users

**Feature Branch**: `feature/new-user-register`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "want create new feature for register new user..." plus session clarifications (workbook location/date once; admin filter by those locations after badge expires; dump reports exclude OS-only numbers until first purchase).

## Clarifications

### Session 2026-09-24

- Q: Are location and date range entered on every user? → A: **No. Workbook header.** Staff set **location** and **one date range** on the registration page. Per-user fields stay name, phone, email, birthday.
- Q: Discount range and date range both needed? → A: **No. Date range only.** Header is location + one date range. No discount range field.
- Q: Is the header locked for that day / the whole date range? → A: **Not locked.** Date range can span many days (not “today only”). Staff may change location or date range **anytime**. **Only numbers saved after that change** use the new location and date range. Numbers already saved keep the location and date range from the moment they were saved. Example: number A under location1, today–2026-09-27 → badge gone after 27. Then header changes to location2, today–2026-09-30. Number B saved next → location2 badge gone after 30. Number A is unchanged.
- Q: What does Customer Insight admin tools filter? → A: **Location list of newly created numbers only.** Locations typed on the registration page appear as admin filter options. Selecting a location returns **new** OS-created numbers for that location, including after the badge has expired. Export matches that list. **Already-registered** contacts (phone already in Contact Master — including buyers who submit the same details) do **not** appear in the filter result or the export file. They still get the location badge for their date range.
- Q: What happens on already-registered phone? → A: **Alert, then load** (staff form) or **update by phone** (portal). Same Contact Master row. Apply location badge for the header/QR date range even if no profile fields changed. **Do not** show that number in the admin location filter or its export.
- Q: Do these new numbers appear in dump reports? → A: **Not until they have purchased.** OS-created numbers stay out of dump reports until they buy. After first purchase they enter dump reports like other customers.
- Q: Can customers register themselves? → A: **Yes. QR + portal.** Staff create a QR from the registration page. The customer opens the portal, fills **name, email, phone**, and saves. The result appears on the OS registration page. If that phone already exists in OS, update with the customer’s data (match by phone). Staff can still add people on the OS form as well.
- Q: Does the adding page hide already-registered people? → A: **No.** The new-user adding page is a **workbook**. It shows new people and already-registered people captured that day. If their details changed, also mark **updated**. Keep history of prior days.
- Q: How long does the header last? → A: **Today only.** Location + date range set today apply only for that company-local day. Tomorrow the header is empty; staff must select location and date range again before adding or making a new QR. Yesterday’s rows stay in workbook history.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Workbook header, then add users (Priority: P1)

A staff member who holds the new **Register new users** permission opens a dedicated registration page (not the full Contact Master directory). They set the **workbook header**: typeable **location** and **one date range** (the range may cover many days, not only today). There is **no discount range**. Then they add many people using only **name**, **phone number**, **email**, and **birthday**. Each saved person **stamps** the header values that are current **at save time**, is written into Contact Master as a Cosmo OS registration, and stays **unallocated**. The header is **not locked during the day**. Staff may change location or dates today; **only numbers added after that change** get the new location and date range. Already-saved numbers keep their own stamp. The header is **only for today**. Tomorrow staff must select location and date range again.

**Why this priority**: This is the intake path. Location/date sit on the header so staff do not retype them on every row, but each person keeps the location and dates they were saved under.

**Independent Test**: Header location1, date range today–2026-09-27. Save number A. Change header to location2, date range today–2026-09-30. Save number B. A stays location1 and loses badge after 27. B is location2 and loses badge after 30. A user without the permission cannot open or submit the page.

**Acceptance Scenarios**:

1. **Given** a user with the Register new users permission, **When** they open the registration page, **Then** they see a workbook header for location and one date range, plus a per-user form for name, phone, email, and birthday.
2. **Given** the workbook header is filled and a unique phone is valid, **When** they save a user, **Then** one Contact Master record is created with that identity, stores the header location and date range that were current at save time, is marked as an OS-side registration, and is left unallocated.
3. **Given** the workbook header is already set, **When** they add further users without changing the header, **Then** they do not re-enter location or date range on each row; each new save uses the current header values.
4. **Given** staff change the header to a new location and date range and then save another number, **When** both contacts are viewed, **Then** the earlier number still has the old location and old date range, and only the newly saved number has the new location and new date range.
5. **Given** number A was saved under location1 with end date 2026-09-27 and number B under location2 with end date 2026-09-30, **When** 2026-09-28 arrives, **Then** A’s location badge is gone and B’s location badge is still shown (until after 30).
6. **Given** the workbook header is missing or invalid (empty location or end date before start date), **When** they try to save a user, **Then** the system blocks the save and shows a clear header-level message.
7. **Given** a user without the Register new users permission, **When** they try to open or submit the page, **Then** access is denied and no Contact Master record is created.
8. **Given** the header is set, **When** staff add a person on this OS form, **Then** that save works the same whether or not a QR portal is also in use.
9. **Given** staff set location and date range today and add people, **When** the next company-local day starts, **Then** the header is empty and they must select location and date range again before adding more people or creating a new QR. Yesterday’s workbook rows remain in history.

---

### User Story 8 - QR portal: customer fills name, email, phone (Priority: P1)

Staff create a **QR code** on the registration page (header must already have location and date range). The customer scans it, opens a **portal**, and fills **name**, **email**, and **phone number**. On save, Cosmo OS creates or updates Contact Master and the person **shows on the OS workbook**. If the phone **already exists** in OS, the system **updates** that contact (match by phone), the workbook row is visible as **already registered**, and if details changed it is also marked **updated**. No second row. Staff can still add people on the OS form themselves.

**Why this priority**: Event / store signup without staff typing every row. Phone is still the identity. OS-side add stays available.

**Independent Test**: Set header, generate QR. Customer submits a new phone via portal → one unallocated OS contact with that location/date; it appears on the OS today list. Submit an existing OS phone with a new name/email → same row updates; still one contact. Staff can still type a third phone on the OS form.

**Acceptance Scenarios**:

1. **Given** a permitted staff member has set location and date range, **When** they create the QR, **Then** a QR is available that opens the customer portal for that header stamp.
2. **Given** a customer opens the portal from that QR, **When** they submit name, email, and a new phone, **Then** one Contact Master record is created, unallocated, stamped with the QR’s location and date range, and it appears on today’s workbook as a new row.
3. **Given** that phone already exists in OS, **When** the customer submits name, email, and that phone (changed or the same as we already have), **Then** the existing contact is updated if fields changed, the location badge is applied for the QR date range, no second row is created, the number appears on the OS workbook as already registered (and **updated** if details changed), and the number does not appear in the admin location filter.
4. **Given** a customer submits an invalid or empty required field, **When** they try to save, **Then** the portal blocks save and shows a clear message; nothing is written to Contact Master.
5. **Given** staff still use the OS add form after a QR is live, **When** they save a person, **Then** that person is stored the same way as any other OS add (header stamp at save time).
6. **Given** an already-existing OS phone is saved via the portal (details changed or unchanged), **When** an admin filters or exports that location, **Then** that already-registered number is omitted from the filter list and the export file; **When** someone searches that customer on Insight during the date range, **Then** the location badge is shown.
7. **Given** a person was newly created via the portal and has no purchase, **When** dumps run, **Then** they are excluded until they purchase (same dump rule as OS-created numbers).

---

### User Story 2 - Already-registered phone: load, edit, save (Priority: P1)

As soon as the staff member captures a phone that already exists on Contact Master, the form shows an **already registered** alert and **loads the data we already have**: **name**, **email**, and **birthday**. Staff can change those fields and save. The same Contact Master row is updated and attached to the **current header** location and date range. A second row is never created. The location **badge still applies** for the header date range (even if the customer already purchased and submitted the same details). These already-registered numbers **are shown on the new-user adding workbook** (marked already registered, and **updated** if details changed). They are **not** shown in the admin location filter and are **not** in the export file.

**Why this priority**: Phone is the business identity. Staff need to see and correct the existing profile on the workbook. Existing customers must not pollute the admin new-number location list.

**Independent Test**: Enter a phone already on Contact Master (has purchased) with name/email/birthday filled → alert + those fields load. Save with no field changes → same contact, workbook row shows already registered (not updated), location badge on Insight during the date range. Change email and save → same row shows already registered + updated. Admin location filter and export do not include this phone.

**Acceptance Scenarios**:

1. **Given** a phone that already exists on Contact Master (any prior source), **When** the staff member enters or captures that number, **Then** an already-registered alert appears and the form loads that contact’s name, email, and birthday (empty fields stay empty if we have no value).
2. **Given** those fields are loaded, **When** staff change name, email, and/or birthday and save, **Then** the existing contact is updated with the values on the form, is stamped with the current header location and date range, no second contact is created, and the workbook row shows already registered + **updated**.
3. **Given** staff do not change the loaded fields and save, **Then** name, email, and birthday stay as loaded, the contact is still stamped with the current header location and date range, and the workbook row shows already registered without an updated mark.
4. **Given** two contacts could match the same normalized phone, **When** the number is captured, **Then** the alert lists those matches only; staff pick one and that contact’s name, email, and birthday load — the form still does not create a new row.
5. **Given** an already-registered contact (including one who already purchased and submitted the same details) was saved through this page or the portal under a location, **When** an admin opens that location filter or exports it, **Then** that number is **not** in the filter result and **not** in the export file, and **When** the customer is searched on Insight during the date range, **Then** the location badge is shown.

---

### User Story 3 - Workbook list, history, and “updated” (Priority: P1)

The new-user adding page is a **workbook**. It **keeps history**. Today’s sheet lists everyone captured **today** from the OS form or the QR portal: **new** people and **already-registered** people. If an already-registered person’s details were changed, the row also shows **updated**. Allocation does not hide the row from this workbook. The live header (location + date range) is **only for today**. Tomorrow staff must select location and date range again. Prior days remain in history.

**Why this priority**: Staff need one page to see what happened at the event, including existing customers, and to look back later. A new day starts a new header.

**Independent Test**: Today: add new phone A; save already-registered B with no field change; save already-registered C with a new email. Today’s workbook shows A (new), B (already registered), C (already registered + updated). Next day: header empty until location and date range are set again; yesterday’s A/B/C still in history.

**Acceptance Scenarios**:

1. **Given** new and already-registered people were saved today (staff or portal), **When** the adding page loads or refreshes, **Then** all of those today’s rows appear on the workbook with at least name and phone.
2. **Given** an already-registered person was saved today with no field changes, **When** the workbook is viewed, **Then** that row is visible and marked already registered (not updated).
3. **Given** an already-registered person’s name, email, or birthday was changed and saved, **When** the workbook is viewed, **Then** that row is visible and marked already registered and **updated**.
4. **Given** a newly created person later becomes allocated, **When** the workbook is viewed, **Then** that row remains in today’s history (allocation does not remove it).
5. **Given** people were saved on a previous company-local day, **When** staff open the workbook, **Then** those rows remain in history and are not mixed into today’s working sheet as today’s new header work.
6. **Given** a new company-local day has started, **When** staff open the adding page, **Then** location and date range are not carried over; they must select them again before adding or creating a QR.
7. **Given** no one has been captured today, **When** today’s sheet loads, **Then** a clear empty state is shown (not an error); history of other days is still available.

---

### User Story 4 - Temporary location badge on Customer Insight (Priority: P1)

Each successful save **stamps** the header **location** and **date range** that were current at that moment. While today is inside **that contact’s** date range, a **temporary badge** using **that contact’s** location appears on Customer Insight search. After that contact’s end date, **that** badge disappears. Other contacts with a later end date keep their own badge. **Newly created** numbers stay on the admin location list after the badge ends. **Already-registered** numbers get the badge only — they never appear on that admin list.

**Why this priority**: The campaign mark is how merchants and admins recognize these people during each person’s own promo window. The admin location list is for new captures only.

**Independent Test**: New phone A under location1, today–2026-09-27. Already-registered phone C under the same header. Search A and C during the range → both show location1 badge. After 27, both badges gone. Admin filter location1 → A only, never C.

**Acceptance Scenarios**:

1. **Given** a contact was saved under a location whose stamped date range includes today, **When** a permitted user searches that customer on Customer Insight, **Then** the badge appears using that contact’s saved location as the label.
2. **Given** today is after that contact’s end date, **When** the same customer is searched, **Then** the location badge is not shown.
3. **Given** today is before that contact’s start date, **When** the customer is searched, **Then** the location badge is not shown yet.
4. **Given** a merchant who is not the allocated merchant searches by exact phone (existing insight visibility rules), **When** the customer is found, **Then** the active location badge is still visible so the campaign mark is not hidden.
5. **Given** the badge has expired, **When** staff review that contact’s registration location, **Then** the location they were saved under is still stored (badge gone, location membership remains).
6. **Given** staff later change the header location, **When** they search a number saved before that change, **Then** that number still shows its original location badge (if still in its own date range), not the new header location.

---

### User Story 5 - Admin location filter and export (badge may already be gone) (Priority: P1)

On Customer Insight **admin tools**, the admin does **not** get a generic “newly registered users” filter. They get a **location list** built from locations staff typed on the registration page. Picking a location returns **only newly created** numbers for that location — **including after** the temporary badge has expired. Export matches that list. **Already-registered** numbers (phone already in Contact Master, whether they updated details, submitted the same details, or already purchased) are **not** in the filter result and **not** in the export file. They still receive the location badge on Insight search until their date range ends.

**Why this priority**: After the promo window, ops still need a clean list of true new captures. Existing customers only need the temporary badge.

**Independent Test**: Create new phone A under Kandy. Capture already-registered buyer B under Kandy (same details, save). Filter Kandy → A only. Export Kandy → A only. Search B on Insight during the date range → Kandy badge. After the end date, B’s badge is gone; B still not on the filter.

**Acceptance Scenarios**:

1. **Given** one or more locations have been used as workbook headers on the registration page, **When** an insight admin opens admin tools, **Then** those locations appear as filter options.
2. **Given** the admin selects a registration location, **When** results load, **Then** only **newly created** contacts for that location appear, whether or not their badge is still visible.
3. **Given** a location’s date range has already ended, **When** the admin filters by that location, **Then** the newly created numbers for that location still appear and can be exported.
4. **Given** a location has both newly created numbers and already-registered saves, **When** the admin filters or exports, **Then** only newly created numbers appear in the list and the file.
5. **Given** a user who can use Customer Insight but does not have admin tools, **When** they open insight, **Then** they do not see this location list filter or this export.
6. **Given** a newly created contact was saved under a location and later allocated, **When** the admin filters that location, **Then** that contact still appears.
7. **Given** a contact was never created through this registration page or portal (or was already in Contact Master), **When** the admin uses this location filter, **Then** that contact does not appear.
8. **Given** new number A was saved under location1 and new number B under location2 after a header change, **When** the admin filters location1, **Then** only A appears; **When** they filter location2, **Then** only B appears — even after each badge has expired.
9. **Given** already-registered user1 already purchased and submits the same name/email/phone, **When** they save, **Then** only the location badge is applied for the given dates; user1 does not appear in the admin location filter.

---

### User Story 6 - ERP create matches the OS contact, keeps OS email, still allocates (Priority: P1)

These people are first created on **Cosmo OS only**. When a merchant later creates the same person as a customer on the **ERP** side, Cosmo OS must **not** add a second Contact Master row. The existing OS contact is reused (phone match). If the ERP record carries a **merchant or staff mailbox**, the Cosmo OS email **does not change**. Allocation still runs as already planned: if the OS contact is still unallocated, it is allocated to the merchant who created the ERP customer.

**Why this priority**: Duplicate OS+ERP identities break history and ownership. Overwriting a real customer email with a merchant mailbox is a known data-quality failure. Allocation is how the merchant receives the lead they just created in ERP.

**Independent Test**: OS-register phone X with a personal email, unallocated. Merchant creates ERP customer for phone X using the merchant mailbox. After ERP sync: still one Contact Master row; OS email unchanged; assigned merchant is that merchant. Repeat with a contact that was already allocated to someone else → email still unchanged and allocation is not stolen.

**Acceptance Scenarios**:

1. **Given** an OS-registered contact exists for a phone and no Contact Master row is tied to the new ERP customer yet, **When** that customer is created on ERP with the same phone, **Then** Cosmo OS links the ERP customer to the existing contact and does not create a duplicate.
2. **Given** the ERP customer email is a merchant or staff mailbox (shared store/merchant pattern), **When** sync runs against an OS contact that already has an email, **Then** the Cosmo OS email stays the OS value.
3. **Given** the ERP customer email is a merchant or staff mailbox, **When** the OS contact has no email, **Then** Cosmo OS still does not store that merchant mailbox as the customer email.
4. **Given** the OS contact is still unallocated and a merchant created the ERP customer (same allocation safety rules already used for new ERP customers: known merchant, known origin, phone not already owned on another ERP customer), **When** sync completes, **Then** that unallocated contact is allocated to that merchant.
5. **Given** the OS contact is already allocated to a merchant, **When** ERP later creates the same phone, **Then** the existing allocation is kept (not overwritten) and the contact is still not duplicated.
6. **Given** ERP create cannot safely match (no usable phone, or the phone already belongs to a different ERP customer), **When** sync runs, **Then** the system does not invent a merge or steal allocation; staff can resolve through existing contact tools.

---

### User Story 7 - Keep new OS numbers out of dump reports until they purchase (Priority: P1)

Numbers **created** through this OS registration page must **not** appear in dump reports (contact dumps / utility dumps) while they have never purchased. After they buy from the company, that contact number enters dump reports like other customers.

**Why this priority**: These are Cosmo OS–only leads until they become buyers. Dumping them early pollutes contact dumps used for outreach and reporting.

**Independent Test**: Create a new OS registration with no purchase → contact dump files omit that phone. Record a purchase for that phone → later dump includes it. An already-existing Contact Master customer who already had a purchase and is only updated on this page stays in dumps.

**Acceptance Scenarios**:

1. **Given** a contact was newly created through the registration page and has no purchase, **When** staff generate contact / utility dump reports, **Then** that number is absent from those dumps.
2. **Given** that same contact later has at least one purchase from the company, **When** dumps are generated again, **Then** the number is included.
3. **Given** a contact already existed on Contact Master and was already dump-eligible (for example they had purchased before), **When** staff update them through this page, **Then** dump eligibility is not removed.
4. **Given** a new OS-created contact is still unallocated and has no purchase, **When** dumps run, **Then** unallocated status alone does not put them in the dump; purchase is required.

---

### Edge Cases

- Phone entered with spaces, leading zeros, or country-code variation still matches the same Contact Master person and still triggers the already-registered alert.
- Saving the same phone twice on the same day updates the same contact; today list shows one row.
- Badge date range of a single day: badge is visible for that whole company-local calendar day; admin location filter still lists **new** numbers after that day. Live header still resets the next morning.
- Location is free-typed (not limited to a fixed store list); badge text and admin filter label are that saved location.
- Two workbooks that type the same location name (same spelling, after trim) appear as one admin filter option; contacts from both sit under that location.
- Staff cannot save a user until the workbook header is complete (location + date range).
- Header change is not locked to one day, but it is **not retroactive**. Changing location or dates does not rewrite numbers already saved. Only the next saves use the new header.
- Two numbers saved the same day can have different locations and different badge end dates. Each badge expires on its own end date.
- Already-registered load: if Contact Master has no email or no birthday, that field shows empty; staff may fill it on save.
- After load, if staff clear a loaded email or birthday and save, that field is saved empty (they chose to clear it).
- User with Register new users permission but without Contact Master manage can still use this form; they do not gain full Contact Master import/export/directory rights.
- Insight search for a newly created customer whose badge expired must not show a stale location badge; admin location filter still returns that **new** number. Already-registered numbers with an expired badge stay off the filter.
- New OS-created number with no purchase is excluded from every contact / utility dump part (split dumps and full dump).
- ERP customer created without a phone does not match an OS registration and does not auto-allocate via this rule.
- Merchant mailbox variants already treated as shared/staff emails (company domains and known merchant inboxes) never overwrite or fill Cosmo OS customer email.
- Two staff register different names on the same new phone at the same moment: one Contact Master row wins; the other sees already-registered and can update.
- Customer portal and staff form save the same phone at the same moment: one Contact Master row; the later save updates that row.
- Portal does not collect birthday. Existing birthday on an already-registered contact is kept. Staff can fill birthday later on the OS form.
- QR cannot be created until location and date range are set. A QR keeps the location and date range from the moment it was created; a later header change does not rewrite that QR. Staff create a new QR after they change the header if they want the new stamp.
- Portal needs no Cosmo login. Anyone with the QR or its link can submit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dedicated Register new users form available only to users granted a new Contacts permission for this feature (no new named role; admins grant it on the existing permission screen).
- **FR-002**: The registration page MUST separate a **workbook header** (typeable location and one date range start and end) from **per-user fields** (name, phone number, email, birthday). Location and date range MUST be entered on the header, not on every user row. The date range MAY span many days and MUST NOT be treated as today-only. The header MUST NOT include a discount range.
- **FR-003**: Workbook header (location and date range) MUST be complete before any user can be saved or a QR created. Name and phone MUST be required on each user. Email and birthday MUST be accepted on create and used on update when provided. The header MUST remain editable during the same company-local day and MUST NOT carry over to the next day.
- **FR-004**: A successful new save MUST create exactly one Contact Master record that inherits the current workbook header, is marked as created from Cosmo OS registration, and has no allocated merchant.
- **FR-005**: System MUST detect an existing Contact Master record by normalized phone as soon as the number is captured, MUST show an already-registered alert, and MUST load that contact’s name, email, and birthday into the form.
- **FR-006**: Saving against an already-registered phone MUST update that existing contact’s name, email, and birthday with the values on the form (or keep them if unchanged), MUST apply the location badge for the current header/QR date range, and MUST NOT create a second Contact Master row. This MUST apply even when the contact already purchased and submitted the same details.
- **FR-007**: After an already-registered load, staff MUST be able to edit name, email, and birthday before save. Save MUST persist the form values (including a field they cleared).
- **FR-008**: The adding page MUST work as a workbook that keeps history. Today’s sheet MUST list everyone captured today (staff or portal): newly created rows and already-registered rows. Already-registered rows MUST show an already-registered mark. If name, email, or birthday changed on that save, the row MUST also show **updated**. Allocation MUST NOT remove a row from the workbook.
- **FR-009**: System MUST attach a temporary badge whose label is the location **stamped on that contact at save time**, active for **that contact’s** inclusive date range, and MUST hide that contact’s badge after its own end date (and before its start date) without deleting location membership. Other contacts MUST keep their own location and dates.
- **FR-010**: When a permitted user searches the customer on Customer Insight, the system MUST show the active location badge. Expired badges MUST NOT appear on search.
- **FR-011**: Customer Insight admin tools MUST list locations that were entered as workbook headers and MUST filter **only newly created** OS-registration numbers for a selected location, including those whose badge has already expired and those later allocated. Already-registered contacts MUST NOT appear in that filter result.
- **FR-012**: Admins MUST be able to export that same newly-created location list. The filter result and the export file MUST omit already-registered numbers. Merchants without admin tools MUST NOT receive this location filter or this export.
- **FR-013**: When an ERP customer is later created for a phone that already exists on Contact Master, Cosmo OS MUST reuse the existing contact and MUST NOT create a duplicate Contact Master row.
- **FR-014**: When ERP sync brings a merchant or staff mailbox, Cosmo OS MUST NOT change an existing customer email and MUST NOT store that mailbox as the customer email if the OS email is empty.
- **FR-015**: When a merchant creates the ERP customer for an OS contact that is still unallocated, the system MUST allocate that contact to that merchant using the existing ERP-customer allocation safety rules (known merchant, known origin, phone not already owned on another ERP customer).
- **FR-016**: Auto-allocation on ERP create MUST run even when the Contact Master row already existed from OS registration; it MUST NOT require the OS row to be newly created at sync time.
- **FR-017**: Auto-allocation MUST NOT overwrite an allocation that is already set.
- **FR-018**: Users who only hold the Register new users permission MUST NOT gain Contact Master directory, import, or full-list export capabilities from this feature.
- **FR-019**: Phone matching for alerts, updates, and ERP reuse MUST use the same phone-normalization rules already used for Contact Master identity.
- **FR-020**: Contacts newly created through this registration page or the QR portal MUST be excluded from dump reports until they have at least one purchase from the company. After that first purchase they MUST appear in dump reports. Updating an already dump-eligible Contact Master record through this page or the portal MUST NOT remove it from dumps.
- **FR-021**: When staff change the workbook header (location and/or date range) **on the same day**, the system MUST apply the new values only to numbers **saved after** that change on the OS form. Already-saved numbers MUST keep the location and date range stamped at their save time. Insight badges MUST follow each number’s own stamp. Admin location filter membership MUST still include only newly created numbers.
- **FR-027**: At the start of each new company-local day the live header MUST be empty. Staff MUST select location and date range again before adding people or creating a QR that day. Prior days’ workbook rows MUST remain in history.
- **FR-022**: Permitted staff MUST be able to create a QR code from the registration page after location and date range are set. The QR MUST open a customer portal where the customer enters name, email, and phone number only.
- **FR-023**: A portal save for a new phone MUST create one unallocated Contact Master record stamped with the location and date range bound to that QR, and MUST make that person visible on the OS registration page.
- **FR-024**: A portal save for a phone that already exists in OS MUST update that contact with the customer-submitted name and email (match by normalized phone), MUST apply the location badge even if submitted details match what we already have, and MUST NOT create a second row. That contact MUST NOT appear in the admin location filter.
- **FR-025**: Staff MUST still be able to add and update people on the OS registration form while a QR portal is available.
- **FR-026**: Admin location filter and export MUST treat portal already-registered saves the same as staff already-registered saves (omit from list and file) and MUST include newly created portal numbers. Already-registered contacts MUST still receive the location badge on Insight search for their stamped date range.

### Key Entities

- **Registration workbook header**: Live settings on the adding page — location and one date range. No discount range. Used as the stamp for the **next** save that same day only. Does not carry to tomorrow. Changing the header today does not rewrite earlier saves.
- **OS Registration**: A Contact Master person created (or attached) through the Register new users page; carries identity fields plus the location, badge date range, and OS-registration origin **from save time**.
- **Contact Master record**: The single customer identity stored for a phone; may be unallocated or allocated; may later be linked to an ERP customer without becoming a second row.
- **Temporary location badge**: Time-bounded mark on one contact; label is that contact’s saved location; visible on Customer Insight search only while today is inside **that contact’s** date range. Expiry hides that badge only; it does not remove location membership.
- **Registration location (admin filter)**: Distinct locations typed as workbook headers. Admin Insight filter + export of **newly created** numbers under a chosen location, including after badge expiry. Already-registered numbers omitted from list and file; they may still hold a temporary location badge.
- **Registration QR / portal**: Customer-facing form opened from a staff-created QR. Fields: name, email, phone. New phone creates an OS registration; existing phone updates that contact. Result shows on the OS registration page. Staff add on OS remains available.
- **Workbook history**: Day-by-day list on the adding page of everyone captured (new and already-registered). Already-registered rows can also show **updated**. History is kept after the day ends. Live header is today-only.
- **Dump-held contact**: An OS-created number with no purchase yet; omitted from dump reports until first purchase.
- **ERP customer link**: The ERP-side customer created later for the same phone; matched to the existing OS contact; may trigger allocation but must not duplicate the contact or overwrite OS email with a merchant mailbox.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the workbook header is set, a permitted staff member can add a new user (name, phone, email, birthday) in under 1 minute under normal conditions, without re-entering location or date range.
- **SC-009**: In the two-save example (location1 ending 2026-09-27, then location2 ending 2026-09-30), 100% of reviewers see A keep location1 and lose the badge after 27, and B keep location2 and lose the badge after 30. Changing the header alone never retags A.
- **SC-002**: 100% of already-registered phone captures in acceptance testing show the alert, load name/email/birthday, and update the same contact on save; zero second Contact Master rows are created for those phones.
- **SC-003**: After save, today’s workbook shows that person on the adding page (new, already registered, or already registered + updated). Next day, 100% of reviewers find the header empty until location and date range are set again, and yesterday’s rows still in history.
- **SC-004**: For 100% of sampled contacts inside an active date range, Customer Insight search shows the location badge (new creates and already-registered). After the end date, the badge is absent. The admin location filter still returns **newly created** numbers and never returns sampled already-registered numbers.
- **SC-005**: Insight admins can filter and export a location list of newly created numbers after the badge window ends. 100% of sampled already-registered numbers are absent from both the on-screen result and the file.
- **SC-006**: In acceptance cases where an OS-registered unallocated contact is later created on ERP by a merchant with a merchant mailbox, reviewers find exactly one Contact Master row, the original OS email unchanged, and allocation set to that merchant.
- **SC-007**: At least 90% of permitted staff in a pilot correctly recognize “already registered” vs “new save” from the form alone on the first attempt.
- **SC-008**: 100% of sampled contacts newly created through this page or the QR portal with no purchase are absent from dump reports; after a purchase is recorded, 100% of those sampled contacts appear in a subsequent dump.
- **SC-010**: A customer can finish the portal (name, email, phone) in under 2 minutes. Staff see that save on the OS page without adding the person again. Existing OS phones update in place; zero duplicate rows in those cases.

## Assumptions

- “New permission form” means a dedicated registration screen gated by a **new Contacts permission**, granted on the existing permission screen. No new named role is created (same pattern as other Contacts capabilities).
- Identity fields on each user row are name, phone, email, and birthday. Header fields are **location** and **one date range** only. No discount range. Staff do not retype them per user. They may change the header **during today**; **only numbers saved after that change** get the new stamp. Tomorrow they must set the header again.
- The adding page workbook lists today’s captures including already-registered. Admin location filter still excludes already-registered. “Updated” means name, email, or birthday differed from what Contact Master had before that save.
- Date range is that contact’s badge window (can be many days). It is not a lock that freezes the header for the rest of the day, and it is not a single shared clock for every number.
- Phone is the unique business key for this feature. Email is not used as a merge key on this form (merchants reuse mailboxes).
- Location is free-typed text (staff may type a store, city, or campaign site). It is not limited to a dropdown of company warehouses, though typed suggestions from known location names are allowed if already available.
- Date range is inclusive on both company-local calendar days. “Today” on the registration footer uses the same company-local day (Sri Lanka / Colombo, consistent with existing insight allocation-day convention).
- Existing Contact Master create/import tools stay as they are. This form is an additional, narrower intake path.
- Already-registered updates attach the contact to the **current** workbook location and date range (refresh badge window for that contact).
- Contacts never saved through this registration page do not appear when an admin filters by a registration location.
- Dump exclusion applies to contacts **created** on this page who have never purchased. “Purchase” means at least one company placed/completed sale already used for last-purchase on Contact Master. Contacts that were already dump-eligible stay dump-eligible if only updated here.
- Dump reports in scope are the contact / utility dump downloads (split parts and full dump). The adding-page workbook and the insight location filter/export are not dumps.
- ERP matching uses normalized phone, consistent with current Contact Master identity. Merchant/staff mailbox detection reuses the existing shared-merchant email rules (company and known merchant inboxes).
- Existing ERP-customer allocation safety checks remain: allocate only when the creator is a merchant, origin instance is known, the phone is present, and that phone is not already found on another ERP customer.
- If the OS contact is already allocated, ERP create still de-duplicates by phone and still protects email, but does not change the allocated merchant.
- Customer Insight search visibility rules (limited view for non-allocated merchants) stay in force; the location badge is an exception so the campaign mark remains visible on search.
- Merchants without the new permission cannot use the registration form. Insight admin filter/export stay behind existing Insight admin tools.
- Already-registered load fills name, email, and birthday from Contact Master. Staff may edit any of the three and save. If fields are unchanged (including an existing buyer submitting the same details), still apply the location badge only. Admin location filter and export list **new creates only**. Already-registered numbers get the badge and stay off that list.
- Cosmo OS does not create the ERP customer from this form in v1; ERP create remains a merchant/ERP action, after which OS matches and allocates.
- Customer portal fields are name, email, and phone only (no birthday, no location/date — those come from the QR’s header stamp).
- QR is bound to the location and date range at the time staff create it. Changing the live header does not change an already-issued QR.
- Portal is public (no Cosmo login). Staff OS form still requires the Register new users permission.
- “Shows on our side” means the adding-page workbook updates so staff see portal saves (new or already registered / updated) without re-keying them.
- A QR created yesterday stays bound to yesterday’s stamp if still opened; a new day’s work needs a new header and, if staff want today’s stamp, a new QR.
