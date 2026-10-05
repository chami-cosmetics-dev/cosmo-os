# Research: Register New Users

**Feature**: `061-register-new-users`  
**Date**: 2026-09-24

## R1 — Permission (no new role)

**Decision**: Add Contacts permission **`contacts.register`**. Gate the adding page, staff save/lookup/QR APIs, and sidebar. Do **not** create a named role. Do **not** grant it on `contacts.master.manage` or `contacts.manage` by implication. Admins tick it on the existing permission screen.

**Rationale**: Spec FR-001 / FR-018; same pattern as `contacts.merge` (039).

**Alternatives considered**:
- Reuse `contacts.master.manage` — rejected (grants Contact Master import/export/directory).
- New role “Registrar” — rejected (spec: no new role).

## R2 — Workbook header (today-only)

**Decision**: Live header (location + date range) lives in the **browser for the current Colombo calendar day** only (session key includes that date). Server does **not** persist “today’s header.” At the next Colombo day the client key misses → header empty. Staff must set location + dates again before save or QR. History is **capture rows**, not the header.

**Rationale**: FR-027. Avoid a server “open workbook” row that could leak yesterday’s location.

**Alternatives considered**:
- Persist header on Company / user — rejected (must reset tomorrow).
- Cookie without date in key — rejected (would survive midnight).

## R3 — Capture history vs Contact Master

**Decision**: New table **`OsRegistrationCapture`**: one row per successful staff or portal save. Fields: contact, location, badge start/end, Colombo capture date, source (`staff` | `portal`), outcome (`created` | `already_registered` | `updated`), actor user (staff only). Workbook today + history query this table. Allocation never deletes these rows.

**Rationale**: FR-008. Contact Master is one row per phone; workbook must show already-registered + **updated** and keep days.

**Alternatives considered**:
- Only stamp Contact Master — rejected (no per-day history, no updated mark).
- Reuse `ContactAllocationUpdate` — rejected (wrong meaning).

## R4 — Badge + “newly created” on Contact Master

**Decision**: Add nullable stamp fields on `ContactMaster`:
- `osRegistrationCreated` boolean, default `false` — **true only if this feature created the row**
- `osRegLocation`, `osRegBadgeStart`, `osRegBadgeEnd` — current badge window (inclusive Colombo dates)

Every save (create or already-registered) writes the current header/QR location + dates onto those badge fields. Insight search shows the badge iff today ∈ [start, end]. Admin location filter / export use **`osRegistrationCreated = true` AND `osRegLocation = selected`**. Already-registered stay `osRegistrationCreated = false` so they never enter that list.

**Rationale**: FR-009–012, FR-026. Insight load stays one-row; no join required for badge.

**Alternatives considered**:
- Derive badge from latest capture only — possible but slower on insight search; stamp on CM is enough and simple.

## R5 — Phone match

**Decision**: Reuse `buildPhoneLookupVariants` / `findMatchingContacts` (phone-first). Email is not a merge key.

**Rationale**: FR-019; existing Contact Master identity.

## R6 — QR + public portal

**Decision**: Table **`OsRegistrationQr`**: unguessable `token`, `companyId`, location, badge start/end, `createdByUserId`, `createdAt`. Staff POST creates it after header is valid. Portal is public at `/register/[token]` (same family as `/invite/activate`). Customer POST name, email, phone (Zod). QR image: staff API returns portal absolute URL; dashboard renders QR with a small **`qrcode`** helper (data URL). Issued QR is **immutable**; header change today does not rewrite it. New header → new QR.

**Rationale**: FR-022–024. Token in DB matches invite pattern. No Cosmo login on portal.

**Alternatives considered**:
- Encode location in the QR query string only — rejected (tamperable; no company bind).
- Google Chart QR — rejected (network, branding).

## R7 — Dump exclusion

**Decision**: Contact / utility dump queries exclude rows where `osRegistrationCreated = true` AND no company purchase yet (`lastPurchaseAt` is null **and** `purchaseOrderCount = 0`). After first purchase, existing dump path includes them. Updating an already dump-eligible contact does not set `osRegistrationCreated`.

**Rationale**: FR-020. Purchase signal already maintained on Contact Master.

**Alternatives considered**:
- Exclude all captures forever — rejected (after they buy they belong in dumps).

## R8 — ERP duplicate + allocate + email

**Decision**:
- Keep phone-first `syncContactMasterSafely` (no second row).
- Keep `isSharedMerchantEmail` — never write merchant mailbox onto OS email; never overwrite an existing OS email with one.
- Change `shouldAutoAllocateErpCustomer` so allocation may run when `syncStatus` is `created` **or** `enriched` **or** `unchanged`, still requiring merchant MER, merchant role, known origin, phone present, `otherErpPhoneCheck === "clear"`. Existing `updateMany` already requires empty `assignedMerchant` (FR-017).

**Rationale**: FR-013–017. Today allocation is skipped unless status is `created`, which is the bug for OS-first contacts.

**Alternatives considered**:
- Always allocate on ERP customer webhook — rejected (would steal allocated contacts; overwrite guard stays).

## R9 — Insight admin location filter

**Decision**: Add optional admin-only query `osRegLocation` (string). Options = distinct `osRegLocation` from contacts with `osRegistrationCreated` (or from capture locations that have at least one created row). Filter + existing export reuse `filterAllocatedContacts` extra AND. `contacts.insight.admin_view` (same as other admin filters).

**Rationale**: FR-011–012. No new export route.

## R10 — Agent context script

**Decision**: Skip. Repo has no `.specify` `update-agent-context` script (same as 041–060).

## R11 — Migration

**Decision**: New Prisma models + Contact Master columns via `npm run db:migrate:create` then `npm run db:deploy:all` when the user asks. Never `prisma migrate dev` / `db push` on shared DBs.

**Rationale**: Constitution I.
