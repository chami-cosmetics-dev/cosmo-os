# Feature Specification: Merchant New Item Requests

**Feature Branch**: `067-merchant-item-requests`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "this is new feature/name idea is now we have lot of brands sometimes we have new requests from customer they want new item from some brands, i want make place for merchants they can collect those data and our purchase department can see those collected data for merchants they can create new item request under brand, on form they can add brand (when they add brand if its already we have suggest it if not its new one (show it new if already we have then it priority status ill upload brand wise priority status file) merchant can select or add new brand to request and description of item, if that item on other online store then its link, and image of requesting item, after merchant create that for purchasing department they should see those requests brand wise in their dashboard, with request count, inside it should show requests for that item with who request it date, and other details, if existing brand then show it if new brand show it, can export for admins (we have to create two new permissions manage and admin, manage can create and read their (only created user can see their requests) requests, admin can see all and export and some times they request already we have item then admin can mark it already have, like wise)"

## Relationship to existing work

This is a **new** place for merchants to capture customer demand for items that are not (or do not appear to be) in the catalogue. It must **not** replace these existing flows:

| Existing capability | What it is | What this feature does instead |
|---------------------|------------|--------------------------------|
| **Item Creation** | Purchasing / digital / SEO / stores create a real SKU in ERP and Shopify | Merchants log demand. Purchasing reads that demand here. Creating the SKU stays on Item Creation as today. This screen does not open or create an Item Creation ticket |
| **Shop item requests** (spec 066) | Shop asks stores for **existing** SKUs to transfer | This feature is for items the customer asked for that merchants believe are **not** in the catalogue yet |
| **OSF / purchasing tools** | Reorder and supplier work on items we already sell | This feature is demand for items we may not sell yet |

## Clarifications

### Session 2026-10-21

- Q: When admin marks already have, is it only a status, or must they pick the existing SKU? → A: **Status only.** No catalogue or SKU match. Merchant sees already have. Admin does not attach an item.
- Q: Does this screen turn a request into an Item Creation ticket? → A: **Inbox only.** Purchasing reads demand here and creates SKUs in Item Creation as they do today. No convert, copy, or auto-create into Item Creation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Merchant logs a customer ask for a new item (Priority: P1)

A merchant hears a customer ask for an item from a brand. They open New Item Requests, start a request, and type the brand. If the company already sells that brand, suggestions appear; choosing one marks the request as an **existing brand** and shows that brand’s **priority status** from the uploaded brand-priority file. If the typed name is not in the list, the merchant can still use it; the request is marked **new brand**. They add a description of the item, optionally a link if they found it on another online store, and optionally a photo of the requested item. Submitting stores the request under their name with the date.

**Why this priority**: Without capture, purchasing never sees the ask. This is the whole point of the feature.

**Independent Test**: As a user with manage access, submit one request against an existing brand (priority visible) and one against a brand name that is not in the list (shown as new). Confirm both save with description, optional link, optional image, creator, and date. Confirm a second manage user cannot see those requests.

**Acceptance Scenarios**:

1. **Given** a user with manage access, **When** they open New Item Requests, **Then** they can start a new request form.
2. **Given** they type part of a brand the company already sells, **When** suggestions appear and they pick one, **Then** the request is an existing brand and the current priority status for that brand is shown.
3. **Given** they type a brand name that is not in the existing brand list, **When** they confirm it, **Then** the request is a new brand and it is labelled new (no priority).
4. **Given** the form is open, **When** they enter an item description, **Then** that description is required before submit.
5. **Given** they found the item on another store, **When** they paste that store’s link, **Then** the link is saved with the request. They can also submit with no link.
6. **Given** they have a photo of the item, **When** they attach it, **Then** the image is saved with the request. They can also submit with no image.
7. **Given** description and brand are filled, **When** they submit, **Then** the request is stored with who created it and the date and time.
8. **Given** a user has only manage access, **When** they look at the list, **Then** they see only requests they created, not other merchants’ requests.
9. **Given** a user has no manage and no admin access, **When** they look for New Item Requests, **Then** they cannot open it and cannot create or read requests.

---

### User Story 2 - Purchasing sees demand brand by brand (Priority: P1)

A purchasing admin opens a dashboard of New Item Requests grouped by brand. Each brand row shows the brand name, whether it is existing or new, the brand priority when it is existing, and how many open requests sit under it. Opening a brand shows each request: who asked, when, description, link, image, and whether that request is still open or already marked as already-have / closed.

**Why this priority**: Purchasing’s job is to see collected demand, not hunt through merchant-by-merchant lists.

**Independent Test**: Create open requests for two existing brands (3 and 1 requests) and one new brand (1 request). As admin, confirm three brand rows, counts 3 / 1 / 1, existing vs new labels, priority on existing brands, and that opening a brand lists each request with creator, date, description, link, and image.

**Acceptance Scenarios**:

1. **Given** an admin opens the purchasing dashboard, **When** open requests exist, **Then** they are grouped by brand with a request count on each brand.
2. **Given** a brand is one the company already sells, **When** it appears on the dashboard, **Then** it is labelled existing and its current priority status is shown when the file has one.
3. **Given** a brand was typed as new, **When** it appears on the dashboard, **Then** it is labelled new and has no catalogue priority.
4. **Given** the admin opens a brand, **When** they look at the list, **Then** each request shows who created it, the date, description, other-store link if any, image if any, and current status.
5. **Given** two merchants requested items under the same brand, **When** the admin opens that brand, **Then** both requests appear as separate rows (they are not merged).
6. **Given** a user has only manage access, **When** they try to open the purchasing brand dashboard, **Then** they cannot see other people’s requests or the all-brand admin view.

---

### User Story 3 - Admin marks “already have” and closes handled demand (Priority: P1)

Sometimes the merchant requested an item the company already sells. The admin marks that request **already have** as a status only — they do not pick a SKU. Requests purchasing has finished with (will source in Item Creation, or will not source) are marked **closed** so the open brand counts stay useful. Open is the default list. This screen never creates an Item Creation ticket.

**Why this priority**: Without an outcome, purchasing cannot tell new demand from items we already stock.

**Independent Test**: As admin, mark one open request already-have and one closed. Confirm they leave the default open list, remain visible when filtering to that status, and the brand’s open count drops. As the merchant who created them, confirm they can see the new status on their own list.

**Acceptance Scenarios**:

1. **Given** an open request, **When** an admin marks it already have, **Then** its status becomes already have, they are not asked to pick a catalogue item or SKU, it leaves the default open list, and the brand’s open count decreases by one.
2. **Given** an open request, **When** an admin marks it closed, **Then** its status becomes closed, it leaves the default open list, and the brand’s open count decreases by one.
3. **Given** a request is already have or closed, **When** the creating merchant opens their list, **Then** they see that status on their request.
4. **Given** a user has only manage access, **When** they try to mark already have or closed, **Then** they cannot change status.
5. **Given** an admin filters to already have or closed, **When** they look at a brand, **Then** those historical requests are still readable with the original details.

---

### User Story 4 - Admin uploads brand priority and exports demand (Priority: P2)

The admin uploads a brand-wise priority status file. Existing-brand suggestions and the purchasing dashboard use that file for priority. The admin can export the request list they are looking at (including who, date, brand, new/existing, priority, description, link, status).

**Why this priority**: Priority tells purchasing which existing brands matter first. Export is how they take the list out of the screen.

**Independent Test**: Upload a priority file that sets Brand A to a known priority. Confirm Brand A suggestions and the dashboard show that priority, and a brand not on the file shows existing with no priority. Export open requests and confirm the file contains the visible request fields. A manage-only user cannot upload or export.

**Acceptance Scenarios**:

1. **Given** an admin has a brand-priority file, **When** they upload it, **Then** it becomes the current priority list (a new upload replaces the previous one).
2. **Given** a brand is both in the catalogue and on the file, **When** a merchant picks that brand or an admin views it, **Then** the priority from the file is shown.
3. **Given** a brand is in the catalogue but not on the file, **When** it is shown as existing, **Then** it has no priority value (it is not treated as new).
4. **Given** an admin is on the request list or brand dashboard, **When** they export, **Then** they receive a file of the requests in the current view, including creator, date, brand, existing/new, priority, description, link, and status.
5. **Given** a user has only manage access, **When** they try to upload the priority file or export, **Then** they cannot.

---

### Edge Cases

- Brand typing is matched without caring about letter case or extra spaces. “The Ordinary” and “the ordinary” are the same existing brand.
- Two different spellings that are not in the catalogue (for example “The Ordinery”) stay as separate new brands until someone picks the real existing name.
- Empty description, or brand left blank, cannot be submitted.
- A link that is not a valid web address is rejected; the merchant can clear it and submit without a link.
- Image that is not a picture, or is too large for a normal photo upload, is rejected; the merchant can remove it and submit without an image.
- A manage user cannot open, edit, or list another user’s request even if they guess the identity.
- A user with both manage and admin access is treated as admin: they see all requests, can export, and can change status. They can still create requests.
- Marking already have or closed twice leaves the request in that status; it is not duplicated.
- After submit, the merchant cannot change brand, description, link, or image. Status changes are admin-only.
- A new-brand request stays labelled new even if that name is added to the catalogue later. Purchasing still sees it was new at the time of the ask. Priority for **existing** brands is always the current file, not a frozen copy.
- Opening a request with no image or no link still shows description, brand, creator, and date.
- Export with zero matching requests produces an empty file with headers, not an error.
- Uploading a priority file that has no usable brand rows is rejected and the previous file stays in force.
- Users with neither permission have no menu entry and no access if they open the address directly.
- Marking already have never asks for, stores, or links a SKU or catalogue item.
- There is no control that creates, opens, or copies a request into Item Creation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST offer a New Item Requests place that is only visible to users with manage access, admin access, or both.
- **FR-002**: Manage access MUST let a user create requests and read only the requests they created. It MUST NOT let them read other users’ requests, see the all-brand purchasing dashboard, export, upload the priority file, or change status.
- **FR-003**: Admin access MUST let a user see every request, use the brand-wise purchasing dashboard, export, upload the brand-priority file, and mark requests already have or closed. Admin access MUST also allow creating requests.
- **FR-004**: A request MUST capture: brand name, whether that brand was existing or new at submit time, item description, optional other-store link, optional item image, creator, and date and time.
- **FR-005**: While the merchant types a brand, the system MUST suggest brands the company already sells. Choosing a suggestion MUST mark the request existing and MUST show that brand’s current priority from the uploaded file when one exists.
- **FR-006**: A brand name that is not in the existing-brand list MUST be allowed. That request MUST be marked new brand and MUST NOT show a catalogue priority.
- **FR-007**: Description and brand MUST be required to submit. Link and image MUST be optional.
- **FR-008**: Purchasing’s default dashboard MUST group **open** requests by brand and MUST show, for each brand: name, existing or new, priority when existing and on file, and open request count.
- **FR-009**: Opening a brand MUST list each request separately with creator, date, description, link, image, existing/new, priority when applicable, and status.
- **FR-010**: Admin MUST be able to mark an open request as already have. Already have is a status only. The admin MUST NOT be required to pick, search, or attach an existing catalogue item or SKU.
- **FR-011**: Admin MUST be able to mark an open request as closed (handled: will source, or will not). Closed and already-have requests MUST leave the default open counts and MUST remain in history filters.
- **FR-012**: Admin MUST be able to upload a brand-wise priority status file. A successful upload MUST replace the previous priority list. Existing-brand views MUST use the current file.
- **FR-013**: Admin MUST be able to export the requests in the current view (open, already have, closed, or a brand drill-in) including creator, date, brand, existing/new, priority, description, link, and status.
- **FR-014**: After submit, the creator MUST NOT change the request’s brand, description, link, or image.
- **FR-015**: This feature is an inbox only. It MUST NOT create a catalogue item, ERP item, Shopify product, or Item Creation record, and MUST NOT offer a control that opens or copies a request into Item Creation. Purchasing creates SKUs in Item Creation as they do today.
- **FR-016**: A user with neither permission MUST NOT create, read, export, or change these requests.

### Key Entities

- **New item request**: One merchant ask for an item. Brand name, existing or new (frozen at submit), description, optional other-store link, optional image, creator, created date and time, status (open, already have, closed), and who changed status when.
- **Brand group (derived)**: Brand name plus existing/new as stored on its requests, current priority from the file when existing, and a count of requests in the current filter (default: open).
- **Brand priority list**: Admin-uploaded mapping of existing brand name to a priority status. One current list at a time; used for suggestions and the dashboard, not for new brands.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A merchant with manage access can submit a complete request (brand, description, optional link, optional image) in under 2 minutes.
- **SC-002**: After submit, 100% of manage-only users see only their own requests; they never see another merchant’s request on the list or by opening it.
- **SC-003**: On the purchasing dashboard, 100% of open requests appear under the brand named on the request, and the brand’s open count equals the number of open requests for that brand.
- **SC-004**: For every existing brand that is on the current priority file, merchants and admins see that priority whenever they view the brand; new brands never show a catalogue priority.
- **SC-005**: An admin can mark a request already have or closed in under 30 seconds, after which the default open brand count no longer includes it and the creating merchant can see the new status.
- **SC-006**: An admin can export the current view and get a file that includes every request in that view with creator, date, brand, existing/new, priority, description, link, and status.
- **SC-007**: Users without manage or admin access cannot reach the feature. Users with only manage access cannot export or change status.

## Assumptions

- “Manage” and “Admin” are two new permissions for this feature only. They are assigned on roles the same way other Cosmo OS permissions are. Typical merchants get manage. Purchasing (and whoever should see all demand) gets admin.
- “Brands we already have” means brands the company already sells in the catalogue (the same brand names merchants would recognise today), not a new brand master.
- Brand matching ignores letter case and extra spaces. Suggestions appear as the merchant types.
- Priority values are whatever the uploaded file contains for that brand name (for example Top Priority Brand / Priority Brand / Standard). The file is a spreadsheet with at least brand name and priority. Exact column layout is an implementation detail as long as admins can upload the file they already use.
- One image per request. One link per request. No customer name or phone on the form — the merchant is recording the item ask, not a customer record.
- Duplicate asks are kept as separate requests so purchasing can see how many people asked and who.
- Default purchasing view is **open** requests. Already have and closed are history filters.
- Closed means purchasing has finished with the row (they will source it in Item Creation, or they will not). It does not create stock, a SKU, or an Item Creation record.
- Already have means “we already sell this.” Status only. No SKU is stored on the request.
- Existing vs new is frozen when the merchant submits. Priority for existing brands is always read from the current uploaded file.
- Merchants cannot edit or delete after submit. Admins do not edit description, brand, link, or image; they only change status and export.
- This feature does not send notifications in v1. Purchasing finds new demand on the dashboard.
- Image storage follows the company’s existing media handling for staff uploads.
- Shop item requests and Item Creation screens stay as they are. This feature does not feed them.
