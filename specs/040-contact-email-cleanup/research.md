# Research: Contact Email Cleanup & Insight Display

**Feature**: `040-contact-email-cleanup`  
**Date**: 2026-08-12

## R1 — What counts as “not working” (v1)

**Decision**: Flag contacts whose **primary or secondary** email (after trim) is non-empty but fails the shared Zod `emailSchema` / equivalent format check (malformed, missing `@`, incomplete local/domain). Whitespace-only is treated as empty (normalize to null on clear path; do not list as “has email”). No SMTP / mailbox probing in v1.

**Rationale**: Spec Assumptions; live probing is slow, costly, and false-negative prone. Existing `lib/validation.ts` `emailSchema` is the project standard.

**Alternatives considered**:
- Maileroo / MX lookup for every address — rejected for v1 scope (Principle V).
- Manual-only “mark bad” without auto list — rejected; staff need a review list (FR-001).

## R2 — Cosmetics / cosmatics pattern

**Decision**: Match case-insensitive substring `cosmetic` **or** `cosmatics` anywhere in the email string. (`cosmetics` is covered by `cosmetic`.) Apply to primary `ContactMaster.email` **and** secondary `ContactEmail.email` rows.

**Rationale**: Spec FR-003; staff company addresses pollute customer mail. Secondary table must be included or cleanup is incomplete (purchase lookup / merge still see bad aliases).

**Alternatives considered**:
- Local-part-only or domain-only match — rejected (user said “any place”).
- Exact company domain allowlist — rejected (over-narrow; pattern is enough for v1).

## R3 — Clear semantics (primary + secondary)

**Decision**: On confirmed remove for a contact id + reason, clear **only address(es) matching the list reason** (invalid format or cosmetics pattern); do not wipe unrelated valid emails on the same contact.

1. If primary email matches the clear reason, set `ContactMaster.email = null`.
2. Delete matching `ContactEmail` rows for that contact (pattern or the exact address being cleared).
3. If primary was cleared and remaining secondary emails exist that are **not** in the clear set, promote the oldest remaining secondary to primary and keep other secondaries.
4. Never delete `ContactMaster` or related orders/history.

**Rationale**: Aligns with `listContactEmails` / merge behavior; avoids orphaning a good secondary behind a cleared primary. Profile update today does not delete secondaries when email set to null — cleanup must explicitly delete bad alias rows.

**Alternatives considered**:
- Null primary only, leave `ContactEmail` — rejected (bad emails remain discoverable).
- Delete all emails on contact when any match — rejected (too aggressive).

## R4 — Schema / migration

**Decision**: **No Prisma migration.** Reuse `ContactMaster`, `ContactEmail`, and `AuditLog` (`writeAuditLog`). Add audit action string `contact_email_cleared` (and optionally keep module `contacts`).

**Rationale**: Constitution I — avoid schema change when existing tables suffice. AuditLog already stores module/action/metadata.

**Alternatives considered**:
- New `ContactEmailCleanupRun` table — rejected (Principle V; audit rows enough).

## R5 — Permissions

**Decision**: List + clear require `contacts.master.manage` **or** `contacts.manage` (same pattern as `app/api/admin/contacts/backfill/route.ts`). Insight display change needs no new permission (existing insight access).

**Rationale**: Bulk email clear is a master-data hygiene action; mirror backfill authZ.

**Alternatives considered**:
- New `contacts.email.cleanup` permission — rejected (extra RBAC surface for one tool).
- Any insight viewer can clear — rejected (too broad).

## R6 — UI placement

**Decision**: New dashboard page under Contacts: `app/(dashboard)/dashboard/contacts/email-cleanup/` with tabs/filters for **Invalid format** and **Cosmetics pattern**, multi-select, confirm dialog, batch clear. Link from Contacts area (same nav patterns as allocation / contact-updates).

**Rationale**: Spec staff-facing review list; keep Insight panel focused on display (P2) only.

**Alternatives considered**:
- Embed only inside Insight — rejected (cleanup is master hygiene, not loyalty workflow).
- One-off CLI script — rejected (staff need ongoing review UI).

## R7 — Insight email display

**Decision**: In `customer-insight-panel.tsx` contact header (and any insight surface that currently omits empty email), **always** render the email row: if non-empty after trim → `Mail` icon + address; else → literal `-` (no icon). Do not hide the row. Filter-result list can optionally show a compact Mail icon / `-` column if email is already in DTO; primary acceptance is the loaded insight header (current gap: empty email renders `null`).

**Rationale**: Spec FR-006–008; code today skips the block when `!insight.contact.email`.

**Alternatives considered**:
- Show “No email” text like phone — rejected (spec mandates `-`).

## R8 — List query & scale

**Decision**: Company-scoped Prisma queries with pagination (`page`, `pageSize` default 50, max 100). Invalid list: primary **or** secondary email non-empty after trim and fails format helper (query contacts with non-null primary and/or related `ContactEmail` rows, filter in app with shared validator). Cosmetics list: `contains` insensitive on primary + `emails.some({ email: { contains, mode: 'insensitive' } })`. Cap select fields to id, name, phone, email, matchedEmail, reason.

**Rationale**: Spec edge case for large lists; matches insight filter paging habits.

**Alternatives considered**:
- Full table dump to client — rejected.

## R9 — Confirmation & audit payload

**Decision**: POST clear body requires `contactIds: string[]` (cuid, max batch e.g. 50) + `reason: "invalid" | "cosmetics_pattern"`. Server re-validates each id still matches reason before clear (stale selection safe). One `writeAuditLog` per contact (or one summary + per-id metadata — prefer **per contact** for FR-011 reviewability) with previous email(s) in metadata.

**Rationale**: FR-005 confirmation UI + FR-011 audit; re-check prevents clearing emails that were fixed between list and confirm.

**Alternatives considered**:
- Blind clear by id without re-check — rejected (race / wrong clear).
