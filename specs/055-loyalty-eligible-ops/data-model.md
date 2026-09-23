# Data Model: Loyalty Eligible Ops & Call Queue Enhancements

**Feature**: `055-loyalty-eligible-ops`

## Entities

### ContactMaster (extend)

| Field | Type | Notes |
|-------|------|--------|
| `loyaltyOutreachStatus` | string? | existing |
| `loyaltyAssignedTier` | string? | existing |
| `loyaltyAssignedAt` | DateTime? | existing |
| `loyaltyOutreachUpdatedAt` | DateTime? | **NEW** — last loyalty outreach/assign status change |
| `loyaltyEligibleAt` | DateTime? | **NEW** — first time marked eligible (set once) |

**Write rules**:
- On first transition to `eligible`: set `loyaltyEligibleAt` if null; always set `loyaltyOutreachUpdatedAt = now`.
- On `contacted` / `responded` / `not_responded` / `assigned`: set `loyaltyOutreachUpdatedAt = now`.
- On loyalty tier assign: set `loyaltyAssignedAt` (existing) + `loyaltyOutreachUpdatedAt`.

### ContactInsightCallQueue (existing)

| Field | Use |
|-------|-----|
| `assignedAt` | Assigned-date filter + sales report column |
| `merchantLabel` | Merchant scope |
| `status` | pending / completed |
| `lifetimeTotalAtAssign` | Report / export |

No schema change required for call-queue filters.

### MerchantEligibleSummary (computed DTO — not persisted)

| Field | Meaning |
|-------|---------|
| `merchantLabel` | Allocation / queue merchant key |
| `pending` | Open loyalty-eligible count now |
| `mtdNewlyEligible` | `loyaltyEligibleAt` in current Colombo month |
| `mtdUpdated` | Distinct contacts with worked update or `loyaltyAssignedAt` in MTD |
| `weekNewlyEligible` / `weekUpdated` / `weekPending` | Same for weekly window (`weekPending` = snapshot pending at send, not historical) |

### SalesReportExportRow (computed)

One row per call-queue assignment history entry: identity, `assignedAt`, status, sales after assign/contact (existing report fields).

### WeeklyLoyaltyDigest (computed + send log optional)

v1: may send without a new Prisma log table (mirror simplest call-center path). Optional later: `LoyaltyEligibleWeeklyEmailSendLog` — **out of v1** unless implement needs dedupe; cron Monday once is enough.

## Relationships

```text
Company
  └── ContactMaster (allocated merchant, loyalty fields)
  └── ContactInsightCallQueue (assignedAt, merchantLabel)
  └── User (merchant roster for summary rows)
```

## Validation rules

- Date ranges: ISO `YYYY-MM-DD`, inclusive Colombo; reject `to < from`.
- Multi-brand: 0..N non-empty strings; empty = filter off.
- `notContacted` boolean query; only meaningful with or without assigned range (when alone: all never-contacted assignments for merchant).
- Summary/list/export: Insight admin only; merchant count: merchant dashboard access.

## State transitions (loyalty outreach)

```text
(null) → eligible → contacted → responded → assigned
                 ↘ not_responded
upgrade path: gold assigned + platinum spend → eligible (again) → …
```

Each transition (and eligible auto-mark) stamps `loyaltyOutreachUpdatedAt`; first `eligible` stamps `loyaltyEligibleAt`.
