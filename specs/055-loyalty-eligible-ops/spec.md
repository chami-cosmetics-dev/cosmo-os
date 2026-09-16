# Feature Specification: Loyalty Eligible Ops & Call Queue Enhancements

**Feature Branch**: `055-loyalty-eligible-ops`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "in customer insight page we have to show admins loyalty eligible count list also in merchant dashboard count should visible for merchants in admin tool want show merchant wise eligble list count MTD updated count and pendng count also weekly mail should send merchant wise weekle and mtd loyalty eligible count showdown gimme template ill confirm it, assigned merchant call queue new filter by assigned date also not contacted date range want filter not contacted contacts in given range, also posible for multiple brand selecting sales report should exportable, in sa;es report new column for assigned date"

## Clarifications

### Session 2026-09-16

- Q: Weekly email body/layout? → A: **Confirmed.** Subject OK. Columns OK (pending / newly eligible / updated). **Mail to admins only** — no per-merchant send. Body is the **all-merchant** weekly + MTD showdown table.
- Q: Who receives the weekly loyalty email? → A: **Same Cosmetics.lk admin set already used for call-center performance email** (`CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS`): Asitha, Chamodi, Teshani, Chamindya (chami@), **and careers@cosmetics.lk** — reuse that full list.
- Q: Full team rank table in merchant email? → A: **N/A** — merchants do not receive this mail. Admins get the full merchant-wise table.
- Q: Merchant Dashboard Loyalty eligible — list or count? → A: **Count only** required for merchants on that card/section (existing contact cards may remain as today; this feature’s merchant ask is the visible count).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin loyalty-eligible counts on Customer Insight (Priority: P1)

An admin opens **Customer Insight** and sees a clear **loyalty-eligible** summary: how many allocated customers are currently eligible for a loyalty action (new Gold/Platinum or Gold→Platinum upgrade), plus a way to open or scan the list behind those counts. Counts are company-scoped for Insight admins.

**Why this priority**: Ops cannot manage loyalty outreach without a company-wide eligible tally next to existing Insight tools.

**Independent Test**: Seed known eligible vs ineligible contacts → admin Insight view shows matching eligible total and list membership.

**Acceptance Scenarios**:

1. **Given** an admin with Customer Insight admin access, **When** they open Customer Insight, **Then** they see a loyalty-eligible count (and list or drill-down) for currently eligible allocated customers.
2. **Given** contacts that are spend-eligible but already fully assigned (e.g. Platinum, or Gold with no upgrade pending), **When** counts load, **Then** those contacts are **not** included in the eligible open count.
3. **Given** a contact newly crosses the Gold spend threshold and is still Standard, **When** counts refresh, **Then** that contact appears in the eligible list/count.
4. **Given** a user without Insight admin access, **When** they open Customer Insight, **Then** they do not see the company-wide admin eligible list (merchant-scoped views remain per existing rules).

---

### User Story 2 - Merchant dashboard loyalty-eligible count (Priority: P1)

A merchant opens **Merchant Dashboard → Loyalty eligible** and sees a clear **count** of allocated customers who still need a loyalty action. Merchants do **not** need a new admin-style eligible list here — the count is the required addition. Existing per-contact cards/actions may stay as today.

**Why this priority**: Merchants already work the Loyalty eligible section; the open-queue size must be obvious at a glance.

**Independent Test**: As merchant A with 3 eligible allocated contacts → dashboard shows count 3; merchant B sees only B’s count.

**Acceptance Scenarios**:

1. **Given** a merchant with allocated loyalty-eligible contacts, **When** they open Merchant Dashboard Loyalty eligible, **Then** a visible **count** reflects only their open eligible allocations.
2. **Given** zero eligible contacts for that merchant, **When** the dashboard loads, **Then** the count shows zero (or empty state) without error.
3. **Given** an admin viewing another merchant’s dashboard (existing “view as” / GM patterns), **When** they select that merchant, **Then** the eligible count matches that merchant’s portfolio, not the admin’s personal allocation.

---

### User Story 3 - Admin merchant-wise eligible table (MTD updated + pending) (Priority: P1)

In an **admin** Customer Insight / admin loyalty tool view, the admin sees a **merchant-wise** table. Each merchant row shows at least:

- **Eligible / pending count** — contacts still awaiting loyalty action (open queue).
- **MTD updated count** — contacts whose loyalty-eligible outreach status advanced during the current calendar month (Asia/Colombo), e.g. contacted, responded, not responded, or loyalty assigned/upgraded in MTD.

Company totals row optional but preferred.

**Why this priority**: Leadership needs per-merchant progress (pending vs worked this month), not only a single company number.

**Independent Test**: Two merchants with known pending and MTD status changes → table rows match hand counts for pending and MTD updated.

**Acceptance Scenarios**:

1. **Given** merchants with mixed pending eligible contacts, **When** the admin opens the merchant-wise eligible view, **Then** each merchant with at least one relevant contact appears with a pending count.
2. **Given** a merchant contacted or completed loyalty action on three eligible contacts this month, **When** MTD updated loads, **Then** that merchant’s MTD updated count is 3 (each contact counted once for the month).
3. **Given** a status change last month only, **When** viewing current MTD, **Then** that contact does not inflate MTD updated (may still appear in pending if still open).
4. **Given** a merchant with pending > 0 and MTD updated > 0, **When** the admin reads the row, **Then** both figures are shown distinctly (not a single ambiguous “eligible” number).

---

### User Story 4 - Weekly admin loyalty email showdown (Priority: P2)

Once per week, **admins only** (Asitha, Chamodi, Teshani, Chamindya, and **careers@** — full `CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS` list) receive one email with the **full merchant-wise** weekly and MTD loyalty-eligible counts (pending / newly eligible / updated). **Merchants do not receive this mail.** Subject: `Loyalty eligible showdown · Week of {week_start}–{week_end}`.

**Why this priority**: Leadership needs a weekly merchant showdown without opening the app; reuse the known admin inbox set.

**Independent Test**: Trigger/preview weekly job → only the shared admin recipient list is addressed; body merchant rows match hand-checked weekly + MTD figures; no merchant user mailboxes receive the message.

**Acceptance Scenarios**:

1. **Given** the weekly send runs, **When** recipients resolve, **Then** mail goes to the full call-center performance recipient list (Asitha, Chamodi, Teshani, Chamindya / chami@, **careers@**), not to merchant users.
2. **Given** multiple merchants with pending/updated activity, **When** admins open the mail, **Then** they see one table covering **all** merchants for week + MTD with the confirmed columns.
3. **Given** a dry-run / preview, **When** preview runs, **Then** content and recipient set match what would send.
4. **Given** Appendix A as confirmed, **When** implementation ships, **Then** live mail matches subject, columns, and admin-only full-table scope.

---

### User Story 5 - Call queue filter by assigned date (Priority: P1)

On **Assign merchant call queue**, the admin can filter by **assigned date** range (when the contact was placed on the merchant call queue). Combines with existing filters using AND.

**Why this priority**: Ops need to re-work or audit a specific assign batch by date.

**Independent Test**: Assign contacts on known dates → filter from–to returns only those assignment dates.

**Acceptance Scenarios**:

1. **Given** assignments on different dates, **When** the admin sets assigned-from and assigned-to, **Then** only contacts whose call-queue assignment date falls in that inclusive range appear (for the selected merchant / load context).
2. **Given** assigned-date filters are cleared, **When** they load, **Then** behavior matches today’s non-date-assign filters.
3. **Given** invalid range (end before start), **When** they load, **Then** validation blocks misleading results.

---

### User Story 6 - Filter not-contacted contacts in a date range (Priority: P1)

Admins can filter the assign / call-queue load to **not-contacted** contacts whose relevant window falls in a **date range**: contacts that still have **no contact outcome** (not yet contacted on that assignment), and whose **assignment date** (or last-eligible window — see Assumptions) falls within the selected from–to. Purpose: pull people who were assigned in a period but never contacted.

**Why this priority**: Follow-up campaigns target assigned-but-never-called lists.

**Independent Test**: Assign 5 contacts on day D; contact 2 of them → not-contacted + date range covering D returns the 3 untouched.

**Acceptance Scenarios**:

1. **Given** assigned contacts some contacted and some not, **When** the admin enables not-contacted + date range covering those assigns, **Then** only still-not-contacted contacts in that range load.
2. **Given** a contact contacted after assign, **When** not-contacted filter is on, **Then** that contact is excluded.
3. **Given** not-contacted filter off, **When** they load, **Then** contacted and not-contacted both remain eligible under other filters.
4. **Given** not-contacted with a date range that matches no rows, **When** they load, **Then** empty list, not an error.

---

### User Story 7 - Multiple brand selection on assign filters (Priority: P2)

Brand filter on Assign merchant call queue supports **selecting multiple brands**. A contact matches if they have purchased **any** of the selected brands (OR across brands), still AND with other active filters.

**Why this priority**: Campaigns often target a brand family, not one SKU brand at a time.

**Independent Test**: Select Brand X and Brand Y → list is union of purchasers of X or Y for that merchant’s filtered set.

**Acceptance Scenarios**:

1. **Given** multiple brands selected, **When** load runs, **Then** contacts who purchased at least one selected brand appear.
2. **Given** one brand selected, **When** load runs, **Then** behavior matches today’s single-brand filter.
3. **Given** no brands selected, **When** load runs, **Then** brand filter is inactive.
4. **Given** brands A and B selected plus Push to Gold, **When** load runs, **Then** contact must be in the push band **and** have purchased A or B.

---

### User Story 8 - Sales report export + assigned-date column (Priority: P1)

The existing call-queue **sales report** (sales after assign / after contact) is **exportable** (Excel preferred, consistent with assignment export). Report UI includes a dedicated **Assigned date** column. Export includes the same assigned-date field on every row.

**Why this priority**: Ops already use the live report; they need spreadsheet handoff and an unambiguous assign-date column for analysis.

**Independent Test**: Open report with known assigns → Assigned date column visible and correct; export file contains same dates and sales columns.

**Acceptance Scenarios**:

1. **Given** assignment rows in the sales report, **When** the admin views the report, **Then** each row shows an **Assigned date** column (date of call-queue assignment).
2. **Given** the report is loaded, **When** the admin exports, **Then** they receive a downloadable spreadsheet with the same rows including assigned date and sales-after-assign / after-contact fields already on the report.
3. **Given** no rows, **When** they export, **Then** empty file or clear empty outcome, not an error.
4. **Given** a user without report access, **When** they try export, **Then** they are denied.

---

### Edge Cases

- Merchant with allocations but zero loyalty-eligible: counts show 0; still appear in admin email table with zeros for active merchant roster.
- Contact eligible for upgrade (Gold assigned, Platinum spend): counts as eligible/pending until upgrade completed.
- Contact in Black List / Wrong Number: excluded from assign load per existing rules; still counted in historical sales report/export if previously assigned.
- Time zones: all MTD, weekly, and date-range boundaries use **Asia/Colombo** calendar days.
- Weekly email at boundary (month roll): MTD resets on 1st; weekly window is previous 7 calendar days ending at send cutoff (document exact cutoff in Assumptions).
- Multi-brand with many brands: empty intersection with other filters yields empty list.
- Duplicate assigns over time: assigned-date filter uses the assignment row(s) in scope for the load; sales report keeps one row per assignment history entry with that row’s assigned date.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Customer Insight admin view MUST show company-scoped loyalty-eligible **count** and access to the **list** of currently pending loyalty-eligible allocated contacts.
- **FR-002**: Merchant Dashboard Loyalty eligible MUST show the viewing merchant’s open loyalty-eligible **count** (merchant-scoped). Merchants are not required to get a new company-wide or merchant-wise admin list on that surface.
- **FR-003**: Admin merchant-wise loyalty view MUST list merchants with **pending** eligible count and **MTD updated** count as distinct metrics.
- **FR-004**: **Pending** MUST mean contacts with an open loyalty suggestion (new assign or upgrade) that are not yet completed to the suggested tier assignment.
- **FR-005**: **MTD updated** MUST count contacts (per merchant) whose loyalty outreach / assignment status advanced at least once during the current calendar month (Asia/Colombo); each contact counts at most once per merchant per month.
- **FR-006**: System MUST support a **weekly email to admins only** with the **full merchant-wise** weekly and MTD counts (columns: pending, newly eligible, updated). Subject confirmed. Merchants MUST NOT receive this mail.
- **FR-007**: Weekly loyalty email recipients MUST reuse the full Cosmetics.lk call-center performance email recipient set (Asitha, Chamodi, Teshani, Chamindya, **careers@**). Weekly email MUST be previewable before or alongside go-live.
- **FR-008**: Assign merchant call queue MUST support filtering by **assigned date** from–to (inclusive).
- **FR-009**: Assign merchant call queue MUST support filtering to **not-contacted** contacts within a **date range** (assigned in range and still without a contact outcome on that assignment).
- **FR-010**: Brand filter MUST allow **multiple** brand selections; match is OR across selected brands, AND with other filters.
- **FR-011**: Call-queue sales report MUST display an **Assigned date** column for every assignment row.
- **FR-012**: Call-queue sales report MUST be **exportable** to a spreadsheet including assigned date and the report’s sales columns.
- **FR-013**: Existing call-queue hide rules (Black List, Wrong Number, retry windows) MUST remain in force for assign load; this feature does not weaken them.
- **FR-014**: Users without the relevant Insight admin / merchant / report privileges MUST NOT see company-wide lists, other merchants’ emails, or export the sales report.

### Key Entities

- **Loyalty Eligible Contact**: Allocated contact with a pending loyalty suggestion (new Gold/Platinum or Gold→Platinum upgrade).
- **Merchant Eligible Summary**: Per-merchant pending count, MTD updated count, weekly snapshot counts for email.
- **Call Queue Assignment**: Link of contact to merchant queue with assigned-at timestamp and contact outcome state.
- **Sales Report Row**: Assignment-scoped row with assigned date, status, and sales after assign / after contact.
- **Weekly Loyalty Digest**: Scheduled admin-only message using confirmed template (full merchant-wise week + MTD table; recipients = call-center performance admin list).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a fixture of ≥20 contacts across ≥3 merchants, admin eligible list/count and merchant dashboard counts match hand-checked pending eligibility **100%**.
- **SC-002**: Merchant-wise pending and MTD updated figures match hand audit for a sample month within **100%** for at least 3 merchants.
- **SC-003**: Assigned-date and not-contacted date-range filters return the expected set in **10/10** scripted cases (including empty and invalid range).
- **SC-004**: Multi-brand OR matching is correct in **10/10** cases (single brand, two brands, brand + push band).
- **SC-005**: Sales report on-screen Assigned date and exported spreadsheet assigned-date column match for **100%** of rows in a ≥30-row sample.
- **SC-006**: Weekly preview/send for a test week shows correct all-merchant weekly + MTD numbers; recipients are only the shared admin set (**0** merchant user addresses in the To list).
- **SC-007**: Unauthorized users are denied admin list and sales export in permission checks (**100%** deny).

## Assumptions

- Loyalty eligibility rules stay aligned with existing Customer Insight / Merchant Dashboard loyalty outreach (Gold minimum spend; upgrade path Gold→Platinum); this feature is visibility, filtering, reporting, and mail — not a new tier formula.
- **Pending** = open loyalty suggestion not yet completed; **MTD updated** = at least one loyalty outreach/assignment status advance in the current Colombo month.
- **Not-contacted date range** keys off **call-queue assignment date** + still no contact outcome on that assignment (not “never contacted in life” unless assignment is the only window).
- **Weekly window** = previous 7 Asia/Colombo calendar days ending at the scheduled send day; send day/time to follow existing company notification schedule patterns once chosen at plan time.
- Weekly loyalty mail is **admin-only**; merchants see counts in Merchant Dashboard, not via this email.
- Recipients = full call-center performance list: `asitha@cosmetics.lk`, `chami@cosmetics.lk`, `careers@cosmetics.lk`, `teshani.cosmetics@outlook.com`, `chamodi.cosmetics@outlook.com`.
- Multi-brand match = purchased **any** selected brand (OR), consistent with “campaign brand family” use.
- Sales report export format = **Excel**, consistent with existing call-queue assignment export.
- Appendix A is the admin company digest template (subject + columns + full merchant table).

## Out of Scope

- Changing Gold/Platinum spend thresholds or Push-to-Gold/Platinum money bands.
- Replacing Merchant monitoring (046) portfolio/recency PDF with this feature.
- SMS or in-app push for weekly showdown (email only unless later requested).
- Merchant self-serve bulk assign of call queues.

## Appendix A — Weekly email template (CONFIRMED — admins only)

**To**: Full call-center performance list — Asitha, Chamodi, Teshani, Chamindya, **careers@** (`CALL_CENTER_PERFORMANCE_EMAIL_RECIPIENTS`)

**Subject**: `Loyalty eligible showdown · Week of {week_start}–{week_end}` ✅

**Preheader**: `Merchant-wise weekly & MTD loyalty-eligible counts`

---

Hi team,

Loyalty eligible showdown for **{company_name}**.

### Company totals

| Period | Pending (open) | Newly eligible | Updated (worked) |
|--------|----------------|----------------|------------------|
| This week ({week_start} → {week_end}) | {week_pending} | {week_newly_eligible} | {week_updated} |
| MTD ({month_name} {year}) | {mtd_pending} | {mtd_newly_eligible} | {mtd_updated} |

### Merchant-wise (sorted by MTD pending, high → low)

| Merchant | Week pending | Week newly eligible | Week updated | MTD pending | MTD newly eligible | MTD updated |
|----------|--------------|---------------------|--------------|-------------|--------------------|-------------|
| {m1} | … | … | … | … | … | … |
| {m2} | … | … | … | … | … | … |
| … | | | | | | |

### What to do next

1. Open **Customer Insight** admin loyalty / merchant-wise view for drill-down.
2. Merchants work **Merchant Dashboard → Loyalty eligible** (count + existing cards).

—
Cosmo OS · Customer Insight  
Sent {sent_at_colombo} (Asia/Colombo)

**Not sent to merchants.**
