# Data Model: Contact Email Cleanup & Insight Display

**Feature**: `040-contact-email-cleanup`  
**Date**: 2026-08-12

No new Prisma models. Cleanup mutates existing contact email fields and writes audit rows.

## Entities (existing)

### ContactMaster

| Field | Role for this feature |
|-------|------------------------|
| `id` | Contact identity |
| `companyId` | Tenant scope for all lists/clears |
| `name` | Review list display |
| `phoneNumber` | Review list display |
| `email` | Primary customer email; cleared to `null` when removed |
| `emails` | Relation → `ContactEmail[]` secondary aliases |

**Rules**:
- Empty / whitespace primary email ≡ no email for insight display (`-`).
- Invalid-format review: non-empty primary **or secondary** that fails shared email format validation.
- Cosmetics review: primary or any secondary contains `cosmetic` or `cosmatics` (case-insensitive).

### ContactEmail

| Field | Role |
|-------|------|
| `id` | Row id |
| `contactId` | Parent contact |
| `email` | Secondary address; deleted when it matches a clear reason |
| `isPrimary` | Existing flag; prefer promote oldest remaining after primary clear |

**Rules**:
- Clearing a cosmetics/invalid match MUST remove matching secondary rows, not only null the primary.
- After primary clear, if non-matching secondaries remain → promote one to `ContactMaster.email` (see research R3).

### AuditLog (via `writeAuditLog`)

| Field | Value |
|-------|--------|
| `module` | `contacts` |
| `action` | `contact_email_cleared` (new action constant) |
| `metadata` | `{ contactId, previousPrimaryEmail, removedEmails[], reason }` |
| actor / time | Existing audit writer fields |

## Derived (API-only, not persisted)

### SuspectEmailReviewItem

| Attribute | Description |
|-----------|-------------|
| `contactId` | ContactMaster id |
| `name` | Display name |
| `phoneNumber` | Primary phone or null |
| `email` | Current primary (may be null if only secondary matched) |
| `matchedEmail` | The address that triggered the list |
| `reason` | `invalid` \| `cosmetics_pattern` |

### EmailRemovalAction

Confirmed staff POST: batch of `contactIds` + `reason` → clears matching emails → audit per contact.

## State transitions

```text
Contact has email (primary and/or secondary)
        │
        ▼
Appears on Invalid and/or Cosmetics review list
        │
        ▼  staff confirm clear (matching addresses only)
Primary null (if match) + matching ContactEmail rows deleted
        │
        ▼  if valid secondary remains
Promote secondary to primary (FR-012)
        │
        ▼
Insight shows "-" when no remaining email; else icon + primary address
```

## Validation rules

- Batch size: 1–50 contact ids per clear request.
- Each id must belong to caller’s `companyId`.
- Server re-checks reason still applies before mutate.
- Never delete `ContactMaster`.
