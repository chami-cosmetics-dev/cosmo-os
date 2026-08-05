# Research: Merchant Customer Insight

**Feature**: `032-merchant-customer-insight`  
**Date**: 2026-08-05

## R1 — Permission model (merchant view-only)

**Decision**: Add a single permission **`contacts.insight.read`**. Gate the Customer Insight page, search API, and insight API with `requirePermission("contacts.insight.read")` only. Do **not** grant merchants `contacts.master.read`, `contacts.master.manage`, `contacts.read`, or `contacts.manage`.

**Rationale**: Contact Master list (`contacts/page-data`), export, and import are already tied to master/legacy contact permissions. Spec FR-009–011 require search/view-only with no directory, export, or import. A dedicated read permission mirrors `book_notes.manage` vs finance `book_notes.read` split (spec 029) without giving write or list tools.

**Default role wiring** (via `DEFAULT_PERMISSIONS` / `DEFAULT_ROLES` in `lib/rbac.ts`):
- Assign `contacts.insight.read` to roles that already receive merchant-facing tools (same cohort as `book_notes.manage` where practical); ops can attach to custom merchant roles.
- Admins/super_admins already pass all permission checks.

**Alternatives considered**:
- Reuse `contacts.master.read` — rejected (enables export API + directory page-data).
- Separate `contacts.insight.manage` — rejected (no writes in v1; Principle V).

## R2 — No new persistence for lifetime total / group

**Decision**: Compute lifetime placed-order total and loyalty tier **on each insight read**. Do not add columns to `ContactMaster` or new loyalty tables in v1.

**Rationale**: Spec displays derived group; assumes no CRM/ERP tag write-back. Single-contact lookup volume is low; Contact Master has no stored lifetime total today (export already computes purchase summary ad hoc). Avoids multi-DB migration for a read feature (Constitution I + V).

**Alternatives considered**:
- Cached `lifetimeTotal` on `ContactMaster` — deferred until performance evidence; would need migrate-create + deploy-all and sync hooks on order/Adapt import.
- Nightly job writing `loyalcs` / `loyalcs2` into Adapt/ERP — out of scope (spec assumption).

## R3 — What counts toward lifetime total

**Decision**: Lifetime total =  
1. Sum of `Order.totalPrice` for company-scoped orders matched to the contact via existing **phone-first** `buildContactOrderLookupOr` / phone variants, **excluding** rows where `cancelledAt` is set;  
2. **Plus** sum of `AdaptPurchaseHistory.ttlAmount` for `contactId` (historical Adapt invoices; no cancel field — include all linked rows).

Currency: treat amounts as LKR display (product convention); do not convert.

**Rationale**: Spec wants placed (non-cancelled) totals for loyalty; Cosmo live history is `Order`; Adapt backfill is the historical invoice store (`AdaptPurchaseHistory`). Existing contacts export `buildPurchaseSummary` does **not** exclude cancelled and ignores Adapt — insight must implement the stricter loyalty rule explicitly rather than reuse export blindly.

**Alternatives considered**:
- Orders only — rejected (understates long-time customers with Adapt history).
- Exclude Adapt — rejected for same reason.
- Exclude void/cancelled Adapt rows — N/A (no status field); document inclusion.

## R4 — Loyalty tier thresholds

**Decision**: Pure function `classifyLoyaltyTier(total: number)`:

| Total (LKR) | Tier key | Display | Business code |
|-------------|----------|---------|---------------|
| `&lt; 100_000` | `standard` | Standard | — |
| `100_000 … 250_000` inclusive | `gold` | Gold | `loyalcs` |
| `&gt; 250_000` | `platinum` | Platinum | `loyalcs2` |

UI shows display name + optional code subtitle and a short threshold legend.

**Rationale**: Matches spec FR-003/004 and inclusive Gold band assumption. Not stored as `ContactMaster.customerType` (that field is allocation taxonomy, not loyalty).

**Alternatives considered**:
- Read ERP `customer_group` — rejected (ERP sync hardcodes `"Individual"`; loyalcs not in app data).
- Map coupon `LOYALCS2` — rejected (discount mapping only, not customer tier).

## R5 — API shape (search-only, no directory)

**Decision**: Two endpoints under `/api/admin/customer-insight/`:

1. **`GET …/search?phone=`** — normalize via `buildPhoneLookupVariants` / contact phone filters; return **at most 10** matches `{ id, name, phoneNumber }` (plus maybe email). Hard reject empty/too-short phone. **No pagination of all contacts.**
2. **`GET …/[contactId]?invoicesPage=&invoicesPageSize=`** — full insight DTO: identity, lifetimeTotal, loyaltyTier, frequency metrics, topItems, chart series, paginated unified invoice history.

Optional: page shell may skip a separate `page-data` if static (thresholds copy can be client constants from shared module).

**Rationale**: Performance pattern prefers aggregated endpoints; lookup UIs (waybill, lookup-by-phone) use search-by-key rather than directory. Caps enforce FR-015 / FR-009.

**Alternatives considered**:
- Extend `contacts/lookup-by-phone` — rejected (wrong permission surface; would tempt reuse of master.read).
- One mega `?phone=` that returns full insight without selecting among matches — weaker when multiple contacts share variants; still support direct insight by id after disambiguation.

## R6 — Unified invoice history

**Decision**: Merge into one chronological list (newest first):

- **Cosmo orders**: `Order` fields → `source: "order"`, date `createdAt` (or invoice-complete date if product prefers — default `createdAt`), reference = `erpnextInvoiceId` || `orderNumber` || `name`, status from cancel/financial/fulfillment, amount `totalPrice`.
- **Adapt invoices**: `AdaptPurchaseHistory` → `source: "adapt"`, date `invoiceDate`, reference `salesInvoiceNo`, status `"adapt"` / paid-historical, amount `ttlAmount`.

Paginate after merge (or fetch both with limits and merge in memory with a max window for v1 — prefer DB skip/take per source then merge if histories are huge; document simple merge+page for typical sizes).

**Rationale**: Spec asks for “all invoices history”; Contact detail already loads both sources in `contacts/[id]/orders`. Merchants need one list.

**Alternatives considered**:
- Two separate tabs only — allowed as UI chrome, but API should still expose both for charts/totals.
- ERP live Sales Invoice fetch — rejected (extra latency/credentials; Adapt + Order already cover Cosmo).

## R7 — Items bought & frequency & charts

**Decision**:
- **Top items**: Aggregate `OrderLineItem` (product name via `productItem` / line title) by quantity and spend for non-cancelled orders; plus Adapt `lineItems` JSON via `adaptLineItemsForPurchaseUi`. Return top N (e.g. 10).
- **Frequency**: `orderCount` (loyalty-eligible docs), `firstOrderAt`, `lastOrderAt` (`ContactMaster.lastPurchaseAt` as hint + computed max), `avgDaysBetweenOrders` when count ≥ 2.
- **Charts** (Recharts / `components/ui/chart.tsx`): (1) monthly spend series from loyalty-eligible amounts; (2) top-items bar or horizontal bar. If loyalty-eligible count &lt; 3, skip trend chart and show factual KPI cards only (SC-006).

**Rationale**: Spec FR-006–008; only `recharts` is in `package.json`; dashboard already uses shared chart wrapper.

**Alternatives considered**:
- New chart library — rejected (Principle V).
- Client-only aggregation from full invoice dump — rejected for large histories; aggregate server-side.

## R8 — UI placement & merchant safety

**Decision**: Route `/dashboard/customer-insight` with sidebar entry visible only when `hasSidebarPermission("contacts.insight.read")`. Panel: search → optional match list → insight layout (header badge, KPIs, charts, invoice table). **No** Import/Export buttons, **no** link that opens Contact Master list. Server page uses `requirePermission` + `PermissionDeniedCard` like book-notes.

**Rationale**: Matches merchant Book Notes pattern; keeps Contact Master admin tools unchanged (spec US5).

**Alternatives considered**:
- Embed inside Contact Master with role-hiding — rejected (easy to leak list/export; wrong mental model).
- Assign merchants `contacts.updates.read` only — insufficient for full history APIs and still not insight-shaped.
