# August 2026 Work Log — Sasida D. Wijenandana

**Period:** 1 – 31 August 2026  
**Last updated:** 8 August 2026  
**Presentation:** [2026-08-sasida-monthly-presentation.html](./2026-08-sasida-monthly-presentation.html)  
**Repo activity source:** git commits + merged PRs authored by Sasida on `cosmo-os`

> Living document. Re-run / refresh before the September monthly meeting so Aug 9–31 work is included.

---

## Snapshot (as of 8 Aug)

| Metric | Value |
|--------|-------|
| Feature commits (no merges) | 30 |
| Feature PRs merged (excl. pure “Dev to main” releases) | ~25 |
| Major feature specs delivered | 029, 030, 031, 032, 033 (+ rider performance merge) |
| Working days with commits | Aug 3, 4, 5, 7, 8 |

---

## Major features

### 1. Merchant Daily Book Notes (Spec 029) — Aug 3–5

**Why:** Shop merchants need a digital daily sales book (including split payments) so finance can reconcile against ERP / bank.

**What shipped:**
- New **Book Notes** dashboard page + APIs (`page-data`, CRUD, order suggestions, send-to-ERP)
- Payment columns: Cash, Card, KOKO, Bank, **City Pak MOP**
- Invoice typeahead from Cosmo OS orders with amount autofill
- Same-calendar-day edit lock (Asia/Colombo)
- Book note **history** + ERP verification / send flow
- ExcelJS support and workbook-related improvements
- Access helpers and permission wiring
- Fix: include **main company shops** in Book Notes outlet list
- UI polish and date-handling clarifications

**Key PRs:** #743, #745, #747, #751, #756, #761, #765

---

### 2. Customer Insight + Allocation & Loyalty (Specs 032, 033) — Aug 5–7

**Why:** Merchants need to look up a customer’s loyalty and purchase history without exporting/importing full contact lists; allocated merchants get deeper CRM tools.

**What shipped:**
- New **Customer Insight** page (search by phone)
- Lifetime total, loyalty tier (Gold / Platinum / Standard), invoice history
- Charts/series: top items, spend over time, frequency helpers
- Ownership / visibility rules (allocated vs non-allocated merchants)
- Filters: total value, loyalty, birthday (current month), push-to-Gold / push-to-Platinum
- Purchasing **progress bar** toward loyalty milestones
- **Mark Contacted** API + dashboard impact path
- Contact **allocation** (manual / bulk) with permissions
- Auto-allocate new customers to recently purchased merchant when unallocated
- Brand-aware filtering and contact brand-id page-data work
- Phone suffix / lookup improvements for search reliability

**Key PRs:** #767, #769, #771, #777, #780, #783

---

### 3. OSF Supplier Orders (Spec 031) — Aug 4

**Why:** Purchasing needs to allocate OSF reorder quantities across multiple suppliers and download supplier-wise order Excels.

**What shipped:**
- Supplier Orders panel in OSF hub
- Item filters (priority / newly added / VAT / brand) + SKU search
- Multi-supplier qty allocation (partial OK)
- Generate → zip of per-supplier Excel files
- Draft persistence on same browser/device
- Supporting allocate / draft / export / reorder libs + tests
- Related OSF workbook updates

**Key PRs:** #758, #763

---

### 4. Dashboard Sales Filters (Spec 030) — Aug 4

**Why:** Clearer sales date-type filtering and summaries on the admin dashboard.

**What shipped:**
- Sales date-type handling and filter summary UX
- Location/merchant chart + overview shared page-data updates
- Permission-aware date-type options
- Related validation and tests

**Key PR:** #753

---

### 5. Rider App Performance & Incentives — Aug 3

**Why:** Riders were tracking incentives manually from shipping costs; they need in-app pay-period performance visibility.

**What shipped:**
- Feature merge for rider performance / incentives (pay period from configured payday)
- Related settings / performance management work carried into August

**Key PR:** #734

---

## Operations & fulfillment

| Work | Date | Notes |
|------|------|-------|
| Sample “send later” cron | Aug 3 | Auto-advances due samples (`advance-sample-send-later`) |
| Fulfillment bulk invoice complete | Aug 3 | UI/component updates |
| Sales invoice creation / ERP sync | Aug 3 | Logic enhancements in `erpnext-sync` |
| Shopify checkout webhook | Aug 3 | Abandoned checkout handling improvements |
| Payment method change + fulfillment panel | Aug 8 | Labels helper + sample/free-issue panel |
| Abandoned checkouts sync schedule | Aug 7 | Cron + sync lib improvements |
| Abandoned follow-up form | Aug 7 | Constants / form UX |

**Key PRs:** #736, #738, #740, #775

---

## Fixes & stability

| Fix | Date | Notes |
|-----|------|-------|
| Cosmo ERP Standard Selling for non-LWK stickers | Aug 4 | Correct sticker unit prices (#759) |
| City Pak MOP migration / payment mode | Aug 3 | With Book Notes |
| Unblock Vercel TypeScript build errors | Aug 5 | # / commit `8bbe199` |
| Book Notes missing Label import | Aug 3 | Build fix |
| Phone number suffix search | Aug 5 | More reliable contact/order search |
| ERP item-price webhook / sticker price helpers | Aug 7 | Alongside Customer Insight |

---

## Commit checklist (Aug 1–8)

| Date | Commit summary |
|------|----------------|
| 2026-08-03 | Shopify checkout webhook; sample send-later cron; SI creation; bulk invoice; City Pak + Book Notes; book note history; UI fix |
| 2026-08-04 | Book Notes errors/ERP; dashboard sales filters; ExcelJS / OSF; sticker Standard Selling; main company shops; OSF Supplier Orders; Book Notes dates |
| 2026-08-05 | Customer Insight; Book Notes panel; TS build unblock; phone suffix; Insight invoice handling |
| 2026-08-07 | Abandoned sync; contact allocation / Insight filters; follow-up form; bugs |
| 2026-08-08 | Payment method change logic + fulfillment panel |

---

## Still to capture (Aug 9–31)

_Add new rows here as work lands, or ask to refresh this file from git._

| Date | Feature / fix | Business impact | PR / commit |
|------|---------------|-----------------|-------------|
| | | | |

---

## How to present

1. Open `2026-08-sasida-monthly-presentation.html` in Chrome.
2. Press **F** for fullscreen; use **← / →** (or on-screen buttons) to move slides.
3. Deck includes: activity bar chart, work-mix chart, navigate process flows, UI mock images, screenshot drop slots.
4. Optional: print to PDF (`Ctrl+P` → Save as PDF) if the meeting needs a handout.
5. Before September meeting: refresh this log + HTML with remaining August commits + real screenshots.

## Real screenshot drop folder

Put live Cosmo OS captures in `docs/monthly-meetings/assets/`:

| File | Screen |
|------|--------|
| `proof-book-notes.png` | Book Notes page |
| `proof-customer-insight.png` | Customer Insight |
| `proof-osf-supplier-orders.png` | OSF Supplier Orders |
| `proof-dashboard-filters.png` | Dashboard filters |
| `proof-abandoned.png` | Abandoned Orders |
| `proof-rider-performance.png` | Rider performance |

Illustrative mocks already in deck: `book-notes-ui.png`, `customer-insight-ui.png`, `osf-supplier-orders-ui.png`.
