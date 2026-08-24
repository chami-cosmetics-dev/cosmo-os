# Feature Specification: Merchant Call Queue Filters, Assign, Export & Sales Report

**Feature Branch**: `043-call-queue-filters`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "want add filters to this, admins can Assign merchant call queue also when assigning if admins can filter data and assign needed contacts only, also export function with all merchant assignments and updated status, add two filters push to gold (75000>= total <=100000) push paltinum(200000 >= total <= 250000) by filtering this and admin can select all numbers at once and assign, also loyalty filter, last purchase date filter, brand, admin can filter use this filters and assign and take report, when taking report their final target is see how their sale change after contact assigned customers, report should update with this data is good for them,"

## Clarifications

### Session 2026-08-24

- Q: Should Push to Gold / Push to Platinum show the money bands (e.g. 75k–100k) on the filter labels? → A: **No.** Labels are only **Push to Gold** and **Push to Platinum**. Thresholds still apply when filtering; do not display prices/amounts on those controls.
- Q: How should admins pick how many contacts to select? → A: Type a **count** (e.g. 10) to select the **first N** matching numbers in list order. Tick **page** to select only contacts on the **current page**. Select all remains for the full matching set.
- Q: Export format? → A: **Excel** file of all contacts assigned to merchants, with **current status**.
- Q: When should a contact be hidden from the assign load list? → A: **Recently allocated** contacts stay hidden for **2 months** after allocation. If assigned and the merchant **updates** that outreach (any outcome other than **Not Responding**) on/after assign, hide from assign again until **2 months** after that update (example: assign + update on 2026-08-24 → do not offer again until 2026-10-24). If the merchant update is **Not Responding**, the contact **reappears for assign after 1 week**.
- Q: Black List and Wrong Number? → A: Contacts marked **Black List** or **Wrong Number** MUST **never** reappear on the assign load list. No 1-week or 2-month retry.
- Q: Is the 1-week re-assign keyed off loyalty “Not responded” or call-center **Not Responding**? → A: **Not Responding** (Contact Updates / Call Center category). Loyalty outreach “Not responded” does **not** start this retry.
- Q: How long should **Not Interested** stay off the assign load list? → A: Hide **2 months**, then eligible again (not permanent like Black List / Wrong Number; not 1-week like Not Responding).
- Q: Which rows should Excel export include? → A: **All** assignment history (every assign row ever), with **current** status on each row — not active-only and not date-range-only by default.
- Q: Does select-by-count N apply to the full matching set or only the current page? → A: Count N = first N of the **full** filtered matching set in list order (may span pages). **Page** tick remains current-page only.
- Q: When counting N, do already-queued rows count toward N? → A: Count N = first N **eligible to assign** (skip already queued / not assignable). Typing 10 yields up to 10 new assignable contacts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter then assign only the needed contacts (Priority: P1)

An admin on Customer Insight opens **Assign merchant call queue**, picks a merchant, applies filters (Push to Gold, Push to Platinum, loyalty, last purchase date, brand — alone or together), loads matching allocated customers, then assigns only those needed contacts to that merchant’s call list.

**Why this priority**: Today the panel loads allocated customers with merchant as the only control. Admins cannot target near-tier or other outreach slices before bulk assign.

**Independent Test**: With merchant selected, apply each filter alone and common combinations; loaded list matches the band/rules; assign puts only selected matching contacts on that merchant’s call list.

**Acceptance Scenarios**:

1. **Given** an admin with access to Assign merchant call queue, **When** they pick a merchant and load without extra filters, **Then** allocated customers for that merchant still load as today (including allocated labels not on the merchant roster).
2. **Given** Push to Gold is on, **When** they load, **Then** only that merchant’s allocated customers whose lifetime purchase total is between **75,000 and 100,000 inclusive** appear; the control label reads **Push to Gold** with **no** money range shown.
3. **Given** Push to Platinum is on, **When** they load, **Then** only that merchant’s allocated customers whose lifetime purchase total is between **200,000 and 250,000 inclusive** appear; the control label reads **Push to Platinum** with **no** money range shown.
4. **Given** both Push to Gold and Push to Platinum are on, **When** they load, **Then** the list is the union of those two bands (no other totals).
5. **Given** a loyalty filter is set, **When** they load, **Then** only customers matching that loyalty status (Standard / Gold / Platinum, or “not yet assigned” if chosen) appear.
6. **Given** a last-purchase date range is set, **When** they load, **Then** only customers whose latest purchase date falls in that inclusive range appear; customers with no purchase date are excluded from that filtered set.
7. **Given** a brand is selected, **When** they load, **Then** only customers who have purchased that brand appear; brand names are searchable and listed A–Z.
8. **Given** several filters are active together, **When** they load, **Then** a customer must satisfy **all** active filters (Push Gold and Push Platinum together are the exception in scenario 4: those two are OR with each other, AND with other filters).
9. **Given** a filtered list, **When** the admin assigns a subset of checked contacts, **Then** only those contacts are added to the merchant’s call queue; others stay unassigned.

---

### User Story 2 - Count, page, or all selection then assign (Priority: P1)

After filters load a matching set, the admin chooses **how many** to tick: type a count (first N in list order), tick **page** (current page only), or select **all** matching contacts, then assign to the merchant call list.

**Why this priority**: Campaigns need first-N batches, page-sized batches, and full-band assign without hand-checking every row.

**Independent Test**: Load a multi-page filtered set; type 10 → first 10 selected; tick page → only visible page selected; Select all → entire matching set; Assign queues the selected set.

**Acceptance Scenarios**:

1. **Given** a loaded matching list spanning multiple pages, **When** the admin types **10** (or any positive count N) and applies select-by-count, **Then** the **first N eligible** contacts of the **full filtered matching set** in list order are selected (not limited to the current page; already-queued / not-assignable rows are skipped when filling N).
2. **Given** N greater than the count of eligible matching contacts, **When** they apply select-by-count, **Then** all **eligible** matching contacts are selected (no error).
3. **Given** a loaded list spanning more than one page, **When** the admin ticks **page**, **Then** only contacts on the **currently shown page** are selected.
4. **Given** a loaded matching list with more contacts than one page, **When** the admin chooses Select all, **Then** every matching contact in the filtered result is selected, not only the current page.
5. **Given** selected contacts, **When** the admin assigns, **Then** those contacts are queued for the chosen merchant; contacts still in a hide window (see User Story 5) are not offered and are not double-queued.
6. **Given** Select all / page / count then Clear, **When** the admin clears, **Then** no contacts remain selected.
7. **Given** the first 3 matching rows are already queued and the admin types **10**, **When** they apply select-by-count, **Then** 10 **not-yet-queued** eligible contacts are selected (the already-queued rows are not counted toward the 10).

---

### User Story 3 - Export Excel of all merchant assignments with current status (Priority: P1)

Admins download an **Excel** file of **all contacts assigned to merchants** with each row’s **updated status**.

**Why this priority**: Ops need a spreadsheet of who is on whose queue and where that outreach stands.

**Independent Test**: Assign contacts to two merchants, update at least one status, export Excel; file includes every assignment row, merchant, identity, current status, and assignment time.

**Acceptance Scenarios**:

1. **Given** assignments exist across merchants (including completed, Black List, Wrong Number, and old re-assigns), **When** the admin exports, **Then** they receive an **Excel** file with **every** assignment history row for all merchants (not only the merchant currently selected in the panel), unless they explicitly scoped the export to one merchant.
2. **Given** an assignment’s status has changed (e.g. pending → completed / **Not Responding**), **When** they export, **Then** each history row shows the **current** status, not a stale snapshot from assign time only.
3. **Given** a contact was assigned twice (e.g. re-assign after Not Responding + 1 week), **When** they export, **Then** **both** assignment rows appear.
4. **Given** no assignments exist, **When** they export, **Then** they receive an empty Excel file or a clear “no rows” outcome, not an error.
5. **Given** a user without admin call-queue access, **When** they try to export assignments, **Then** they are denied.

---

### User Story 4 - Report sales change after assigned contacts (Priority: P1)

Admins open a report whose purpose is to see **how sales moved after customers were assigned** (and after they were contacted, when contact exists). The report **updates** as new purchases and status changes arrive.

**Why this priority**: Filtering and assigning is only useful if leadership can see whether outreach moved sales.

**Independent Test**: Assign a contact, record a later purchase and a contact outcome; report shows assignment date, status, sales after assignment (and after first contact when present), and refreshes when new sales post.

**Acceptance Scenarios**:

1. **Given** contacts assigned to merchant call queues, **When** an admin opens the report, **Then** each assignment row shows merchant, customer identity, assignment date, current queue/contact status, lifetime total **at or as of assignment**, and **purchase value after assignment**.
2. **Given** a customer is later marked contacted, **When** the report is viewed, **Then** it also shows purchase value **after that contact** (sales after assignment but before contact stay in the after-assignment column only).
3. **Given** new qualifying purchases post after assignment, **When** the admin refreshes or reopens the report, **Then** after-assignment (and after-contact) totals update.
4. **Given** the admin filters the report by merchant, date assigned, status, or Push Gold / Push Platinum band, **When** they apply, **Then** totals and rows match that slice.
5. **Given** a merchant-level summary, **When** they view it, **Then** they see count assigned, count contacted, and summed sales after assignment / after contact for that merchant.

---

### User Story 5 - Hide recently allocated and recently worked contacts from assign (Priority: P1)

When admins load candidates to assign, contacts that were **recently allocated**, or were **assigned and then updated by the merchant**, stay off the list for a cooling period. Call-center **Not Responding** comes back after **1 week** so the admin can re-assign.

**Why this priority**: Re-assigning the same numbers too soon wastes merchant time; **Not Responding** needs a short retry.

**Independent Test**: Allocate a contact today → it does not appear on assign load for 2 months. Assign + merchant update (not **Not Responding**) on 2026-08-24 → hidden until 2026-10-24. Assign + **Not Responding** → hidden for 1 week, then appears again for assign.

**Acceptance Scenarios**:

1. **Given** a contact allocated to a merchant less than **2 months** ago, **When** the admin loads assign candidates for that merchant (even if other filters match), **Then** that contact is **not** listed.
2. **Given** a contact allocated **2 months or more** ago and otherwise matching filters, **When** they load, **Then** the contact **can** appear (unless another hide rule applies).
3. **Given** a contact assigned to the call queue and the merchant updates it with an outcome **other than Not Responding** on 2026-08-24, **When** the admin loads assign candidates before **2026-10-24**, **Then** that contact is **not** listed; **from 2026-10-24** it may appear again.
4. **Given** a contact assigned and the merchant marks **Not Responding**, **When** fewer than **7 days** have passed since that update, **Then** the contact is **not** listed for assign; **after 7 days** it **does** appear again so the admin can re-assign.
5. **Given** a contact assigned but the merchant has **not** updated it yet, **When** the admin loads, **Then** it is treated as already on that merchant’s queue (not offered again) until a hide/reappear rule above applies after an update, or the queue item is no longer active.
6. **Given** both a recent-allocation hide and a Not-Responding-week hide could apply, **When** they load, **Then** the contact stays hidden until **all** active hide windows have ended.
7. **Given** only a loyalty outreach status of “Not responded” (and the call-center category is **not** Not Responding), **When** the admin loads, **Then** the 1-week retry does **not** apply from loyalty status alone.
8. **Given** a contact whose latest call-center category is **Not Interested**, **When** the admin loads within **2 months** of that update, **Then** the contact is **not** listed; **after 2 months** it may appear again (same window as other non–Not-Responding updates).

---

### User Story 6 - Never re-assign Black List or Wrong Number (Priority: P1)

Contacts already marked **Black List** or **Wrong Number** (call-center / contact-update categories already used in the product) must not appear on the assign load list again. Admins must not keep sending the same bad or blocked numbers to merchants.

**Why this priority**: Repeat assign of known-bad numbers wastes merchant time and annoys customers.

**Independent Test**: Mark a matching contact Black List; load assign → absent. Mark another Wrong Number; load assign → absent. After 2 months and after 1 week, still absent.

**Acceptance Scenarios**:

1. **Given** a contact whose current (or latest) call outcome / category is **Black List**, **When** the admin loads assign candidates, **Then** that contact is **not** listed, even if filters, 2-month windows, or the 1-week **Not Responding** retry would otherwise include them.
2. **Given** a contact whose current (or latest) call outcome / category is **Wrong Number**, **When** the admin loads assign candidates, **Then** that contact is **not** listed under the same permanence as Black List.
3. **Given** such a contact was previously assigned, **When** the admin exports Excel or opens the sales report, **Then** historical assignment rows **still appear** with status Black List / Wrong Number — they are only excluded from **new** assign load, not from audit export/report.
4. **Given** Select all / count / page, **When** applied, **Then** Black List and Wrong Number contacts are never among the selected or assigned set.

---

### Edge Cases

- Lifetime total exactly **75,000** or **100,000** is included in Push to Gold; **200,000** or **250,000** is included in Push to Platinum; totals **outside** those two closed bands are excluded from those filters.
- Totals between **100,000 exclusive and 200,000 exclusive** are **not** Push to Gold or Push to Platinum under this feature (unlike the older insight “Push to Gold = 75k–&lt;200k” rule).
- Totals **above 250,000** are not Push to Platinum here (cap at 250,000).
- Customer with no last-purchase date: excluded when last-purchase range is set; included when that filter is off.
- Customer with no phone: still listed if they match filters; assign may proceed with a visible “no phone” warning so admins can skip them.
- Brand filter with no purchases for that brand: empty list, not an error.
- Merchant with no allocated contacts: empty list after load.
- Assign with zero selected: action disabled or no-op with a clear message.
- Same contact allocated under a label alias: still one queue row per contact per merchant, not duplicates.
- Report for a contact with purchases only **before** assignment: after-assignment sales show **0**; row still appears so status can be tracked.
- Cancelled or voided orders do not inflate after-assignment / after-contact sales (same lifetime rules as existing insight totals).
- Select-by-count of **0** or blank: no extra selection (or treat as clear); negative numbers are rejected or ignored.
- Ticking **page** after typing a count: **page** wins for that action (only the visible page is selected), unless the admin then uses Select all or a new count.
- Allocation date missing: treat as not “recently allocated” (eligible for assign if other rules allow).
- 2-month windows are calendar months from the allocation or merchant-update date (same-day example: 24 Aug → 24 Oct).
- 1-week **Not Responding** window is **7 × 24 hours** (or calendar 7 days ending at start of the 8th day — see Assumptions) from the **Not Responding** timestamp.
- Merchant update that is Interested / Busy / **Not Interested** / completed (anything except **Not Responding**, and except permanent omits) starts the **2-month** assign hide, even if it happens the same day as assign.
- **Not Interested** is **not** permanent: after the 2-month window the contact may be assigned again.
- Re-assign after **Not Responding** + 1 week creates a **new** queue assignment; export and report include the new row and keep history of the old one.
- **Black List** and **Wrong Number** never re-enter assign load, including after 1 week or 2 months.
- A contact with an older Black List / Wrong Number that was later changed to another category (e.g. Interested) **may** appear again; **current** category wins.
- Category match is the existing call-center labels **Black List** and **Wrong Number** (same spelling as Contact Updates), not a new status name.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Admins who already may assign merchant call queues MUST be able to filter the load set by Push to Gold, Push to Platinum, loyalty status, last purchase date range, and brand, then assign only selected matching contacts.
- **FR-002**: Push to Gold MUST match lifetime purchase total **≥ 75,000 and ≤ 100,000** (inclusive).
- **FR-003**: Push to Platinum MUST match lifetime purchase total **≥ 200,000 and ≤ 250,000** (inclusive).
- **FR-004**: Push to Gold and Push to Platinum MUST be combinable (union) with each other and MUST combine with loyalty, last purchase, and brand using AND.
- **FR-004a**: Push to Gold and Push to Platinum filter controls MUST show only those names — **no** price, amount, or band text (e.g. no “75k–100k”, “75,000–100,000”) on the assign panel or report filter UI.
- **FR-005**: Loyalty filter MUST restrict to Standard, Gold, Platinum, and/or not-yet-assigned loyalty, using the same Gold/Platinum classification already used on Customer Insight (Gold from 75,000, Platinum from 200,000), independent of the narrower push bands.
- **FR-006**: Last-purchase filter MUST use an inclusive start and end date on the customer’s latest purchase date.
- **FR-007**: Brand filter MUST list brands A–Z with search and include only customers who purchased the selected brand.
- **FR-008**: Merchant picker MUST remain; load still uses that merchant’s allocated contacts (including allocated labels not on the roster).
- **FR-009**: Admins MUST be able to select all contacts in the current filtered matching set in one action, then assign them to the chosen merchant’s call list.
- **FR-009a**: Admins MUST be able to type a positive count N to select the **first N eligible** contacts of the **full** filtered matching set in list order (selection MAY span pages). Already-queued / not-assignable contacts MUST NOT count toward N.
- **FR-009b**: Admins MUST be able to tick **page** to select only contacts on the currently displayed page.
- **FR-010**: Assign MUST skip duplicates for contacts already on that merchant’s active queue and MUST not list contacts that are inside an assign-hide window (FR-018–FR-021).
- **FR-011**: Admins MUST be able to export an **Excel** file of **all** merchant call-queue assignment history (every assign event, not active-only), each row with **current** status, merchant, customer identity (name, phone), assignment time, and last-updated status time when available.
- **FR-012**: Excel export MUST default to all merchants and full history; optional single-merchant scope is allowed. Date-range filtering is out of scope unless added later.
- **FR-013**: A sales-impact report MUST list assigned-queue customers and MUST show sales after assignment and, when a contact event exists, sales after that contact, plus current status.
- **FR-014**: The report MUST update when new qualifying purchases or status changes occur (no frozen-only snapshot as the only view).
- **FR-015**: The report MUST support grouping or summary by merchant (assigned count, contacted count, sales after assignment, sales after contact).
- **FR-016**: Users without Assign merchant call queue / export privilege MUST NOT load, assign, export, or open this report.
- **FR-017**: Combining filters MUST not change the existing “oldest / never contacted first” ordering of the assign list unless the admin explicitly sorts otherwise (default stays current behavior).
- **FR-018**: Assign candidate load MUST hide contacts whose **allocation** to that merchant is newer than **2 months**.
- **FR-019**: Assign candidate load MUST hide contacts that were assigned and then merchant-updated with a call-center category **other than Not Responding**, until **2 months** after that update. This includes **Not Interested**, Interested, Busy, and similar non-permanent outcomes. **Black List** / **Wrong Number** remain a permanent omit per FR-021.
- **FR-020**: Assign candidate load MUST hide contacts whose latest call-center category is **Not Responding** until **1 week** after that update, then MUST show them again for re-assign when other filters match. Loyalty outreach “Not responded” MUST NOT by itself start this 1-week retry.
- **FR-021**: Assign candidate load MUST **permanently** omit contacts whose current call-center category is **Black List** or **Wrong Number**; Select all / count / page / assign MUST NOT include them. Excel export and the sales report MUST still retain historical rows for those assignments.

### Key Entities

- **Call Queue Assignment**: A contact placed on a merchant’s call list; attributes include merchant, contact, assigned at, current status (e.g. pending / completed / **Not Responding**), and whether already queued.
- **Assign Filter Set**: The admin’s active constraints: merchant, Push to Gold band, Push to Platinum band, loyalty status, last-purchase range, brand.
- **Select Count**: Admin-entered N used to tick the first N matching contacts.
- **Assign Hide Window**: Period after allocation (2 months), after a merchant update that is not **Not Responding** (2 months), or after **Not Responding** (1 week) during which the contact is omitted from assign load. **Black List** and **Wrong Number** are a permanent omit, not a timed window.
- **Lifetime Purchase Total**: Same placed-order (non-cancelled) lifetime total used elsewhere on Customer Insight.
- **Sales After Assignment**: Sum of qualifying purchases with purchase date **after** the assignment timestamp.
- **Sales After Contact**: Sum of qualifying purchases with purchase date **after** the first (or latest, per Assumptions) contact event following assignment.
- **Assignment Export Row**: One row per assignment for download: merchant, contact, status, timestamps.
- **Merchant Sales Impact Summary**: Aggregated assignment and post-assign / post-contact sales for one merchant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a review of 15 filter combinations (each push band alone, both bands, loyalty, last purchase, brand, and mixed AND sets), **100%** of loaded lists match the documented bands and AND/OR rules, including exact 75,000 / 100,000 / 200,000 / 250,000 totals.
- **SC-002**: A trained admin can pick merchant, apply Push to Gold, type **10** (or Select all / page), and assign in **under 2 minutes** on a typical weekday list.
- **SC-003**: Excel export of all merchants’ assignments includes **every** current assignment row and **current** status in a spot check of at least 50 rows against the on-screen queue.
- **SC-004**: For a sample of 20 assigned customers with known later purchases, report **after-assignment** (and after-contact when contacted) totals match the qualifying purchase sum in **100%** of the sample.
- **SC-005**: After a new qualifying purchase posts for an assigned customer, the report reflects the new after-assignment total on the **next** open or refresh (no waiting for a next-day-only batch as the only update path).
- **SC-006**: Admins without this access cannot complete assign, export, or report in a permission check (denied 100% of unauthorized attempts in test).
- **SC-007**: In a dated walkthrough (allocate today; assign + update today; **Not Responding** today), **100%** of those contacts are hidden from assign load for 2 months, 2 months, and 1 week respectively, then reappear on the first load after each window ends.
- **SC-008**: After marking sample contacts **Black List** and **Wrong Number**, **0%** of those contacts appear on later assign loads (including after 1 week and after 2 months).

## Assumptions

- Actors are the same admins who already see **Assign merchant call queue** on Customer Insight; merchants do not gain this filtered bulk-assign or all-merchant export.
- Lifetime total is the existing Customer Insight lifetime figure (placed, non-cancelled), not a new total definition.
- Push bands in **this** feature are **narrow targeting windows** (75k–100k and 200k–250k). They do **not** change Gold/Platinum **loyalty classification** (still Gold ≥ 75,000 and &lt; 200,000; Platinum ≥ 200,000) used on insight cards and the loyalty filter.
- Admins see filter names only (**Push to Gold** / **Push to Platinum**); money bands stay internal — no need to show prices on those controls.
- Spec **039** removed Push to Gold / Platinum from the **insight list** filter bar; this feature **does not** put those chips back on the main insight search bar — only on Assign merchant call queue (and the related report filters).
- Loyalty filter means **current loyalty status** (Standard / Gold / Platinum / unassigned), not loyalty-registration date, unless that date is added later.
- Last purchase date uses the same “last purchased” already shown on queue candidate rows.
- Brand means a brand the customer has purchased, consistent with insight brand filter.
- Select all means the **full filtered matching set** for the chosen merchant. **Page** means only the visible page. **Count N** means the first N **eligible** contacts of the **full** matching set in list order (may span pages; already queued skipped when filling N). If volume is too large for one assign, the product still reports how many were assigned vs remaining — no silent truncation.
- Select-by-count uses the **current filtered list order** across the full matching set (oldest / never contacted first unless the admin changed sort), skipping already-queued rows when filling N — not “first N on this page” and not “first N rows including already queued.”
- Export is an **Excel** spreadsheet of **full assignment history** (every assign row), each with current status — not CSV-only unless Excel is also produced; not limited to active/open queue rows.
- “Recently allocated” uses the contact’s **allocation to that merchant** date, not first-ever company allocation if they were moved (latest allocation to the merchant in the picker).
- 2 months = same calendar day two months later (24 Aug 2026 → 24 Oct 2026). If that day does not exist (e.g. 31 Jan → last day of March), use the last valid day of the target month.
- 1 week after **Not Responding** = the contact is eligible again at the start of the calendar day **7 days later** (**Not Responding** Mon → eligible again the following Monday).
- Merchant “update” for hide rules is the call-center / Contact Updates **category** on that assignment (**Not Responding**, Interested, Busy, etc.), not loyalty outreach “Not responded” and not unrelated profile edits.
- Assigned with **no** merchant update yet: stay off the assign list because they are already on the merchant’s active queue.
- **Black List** and **Wrong Number** use the existing Contact Updates / Call Center category names. Latest (current) category on the contact is what assign load uses. Permanent omit from **assign load only**; export/report still list past assignments.
- **Not Interested** uses the same **2-month** assign-hide window as other non–Not-Responding categories; only **Black List** and **Wrong Number** are permanent omits.
- Report “sales change” is **sales after assignment** vs **total at assignment**, plus **sales after contact** when contacted — not a full statistical experiment with a control group.
- “After contact” uses the **first contact after assignment** as the cutover unless product later standardizes on latest contact; first-after-assign is the default so early outreach credit is stable.
- Report lives with Customer Insight / call-queue admin tools, not a separate product.
- Existing queue assign cap and paging stay as operational limits; they must not contradict FR-009 without an explicit on-screen count of how many were assigned vs remaining.
- Currency is the same as existing insight money display (no conversion).
- Insight allocation and ownership rules from prior specs remain in force.
