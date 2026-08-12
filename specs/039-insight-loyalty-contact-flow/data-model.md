# Data Model: Insight Filters, Merchant Dash & Loyalty Contact Flow

**Feature**: `039-insight-loyalty-contact-flow`  
**Date**: 2026-08-12

## Entities

### ContactMaster (extend)

Existing CRM contact. New/updated fields:

| Field | Type | Notes |
|-------|------|--------|
| `loyaltyAssignedTier` | `String?` | `gold` \| `platinum` \| null |
| `loyaltyAssignedAt` | `DateTime?` | Registration timestamp for filter |
| `loyaltyAssignedByUserId` | `String?` | FK → User, SetNull on delete |
| `loyaltyOutreachStatus` | `String?` | `eligible` \| `contacted` \| `responded` \| `not_responded` \| `assigned` \| null |

Existing: `birthYear` / `birthMonth` / `birthDay`, `lastPurchaseAt`, `assignedMerchant`, `category`, profile `remarks` (CRM blob — not per-event contact remark).

**Relations**: optional `loyaltyAssignedBy` → `User`.

---

### ContactAllocationUpdate (extend) — contact event history

Append-only call-center / contact event log.

| Field | Type | Notes |
|-------|------|--------|
| `id` | cuid | existing |
| `companyId` | string | existing |
| `contactId` | string | existing |
| `merchantId` | string? | actor / merchant user |
| `merchantName` | string? | denormalized |
| `category` | string? | call-center category or legacy `Contacted` / `allocation` |
| `remark` | `String?` | **NEW** — per-event remark (max ~2000) |
| `outcome` | `String?` | **NEW** — e.g. `loyalty_informed`, `responded`, `not_responded`, `general` |
| `createdAt` | DateTime | immutable event time |

**Rules**: Never UPDATE existing rows for a new contact; INSERT only. Last contacted = latest row where `category != 'allocation'`.

---

### Loyalty outreach (derived + persisted status)

Not a separate table. Derived eligibility:

- `assignedMerchant` matches merchant
- lifetime total ≥ `LOYALTY_GOLD_MIN` (100_000)
- `loyaltyAssignedTier` is null

Persisted `loyaltyOutreachStatus` drives queue membership (`responded` → master queue).

---

### Loyalty Assignment (persisted on ContactMaster)

When `contacts.master.manage` assigns:

- Set `loyaltyAssignedTier`, `loyaltyAssignedAt`, `loyaltyAssignedByUserId`
- Set `loyaltyOutreachStatus = assigned`
- Insert history row + audit

**Validation**: Gold only if `LOYALTY_GOLD_MIN ≤ total < LOYALTY_PLATINUM_MIN`; Platinum only if `total ≥ LOYALTY_PLATINUM_MIN`.

---

### Permission

| Key | Purpose |
|-----|---------|
| `contacts.merge` | **NEW** — Merge Contact |
| `contacts.master.manage` | Assign Gold/Platinum; process responded queue |
| `contacts.master.read` | View master/queue (read) |
| `contacts.updates.manage` / `.read` | Contact Updates page + history visibility where gated |
| `contacts.insight.read` | Insight page |

---

### AuditLog

No schema change. New **module** string values: `customer-insight`, `merchant-dashboard`. New **action** strings listed in contracts.

---

## State transitions — loyalty outreach

```text
(null / eligible) --[on-read or mark eligible]--> eligible
eligible --[merchant: loyalty informed]--> contacted
contacted --[Responded]--> responded
contacted --[Not responded]--> not_responded
not_responded --[merchant contacts again / Responded]--> contacted | responded
responded --[master assign Gold|Platinum]--> assigned
assigned --[terminal for v1]--> (no auto-revert)
```

---

## Validation rules

- Birthday range: both ends optional as a pair; if set, require valid month-day; year-wrap allowed.
- `minTotal` optional; `maxTotal` optional; if only min → `total ≥ min`.
- Item filter: optional `itemKey` / product identity; brand optional scope for options only.
- Merge: source ≠ target; same company; actor has `contacts.merge`.
- Remark: optional, trimmed, max 2000.
- Outcome: enum allow-list.

## Migration notes

1. `npm run db:migrate:create` — add ContactMaster loyalty fields + ContactAllocationUpdate.remark/outcome + indexes if needed (`loyaltyAssignedAt`, `loyaltyOutreachStatus`).
2. `npm run db:deploy:all` before considering complete (Constitution I).
3. Backfill: leave loyalty fields null; existing history rows have null remark/outcome (still valid).
