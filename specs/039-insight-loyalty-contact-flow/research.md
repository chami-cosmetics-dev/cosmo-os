# Research: Insight Filters, Merchant Dash & Loyalty Contact Flow

**Feature**: `039-insight-loyalty-contact-flow`  
**Date**: 2026-08-12

## R1 — Permissions: roles vs existing Contacts keys

**Decision**: No new roles. Add `contacts.merge` to `DEFAULT_PERMISSIONS` in `lib/rbac.ts`. Gate merge on that key only (`contacts.manage` does **not** imply merge). Loyalty assignment queue/actions require `contacts.master.manage` (read queue may use `contacts.master.read`). Contact update writes continue to use `contacts.updates.manage` / allocated-merchant insight contacted path as today.

**Rationale**: Live UI already exposes `contacts.master.*`, `contacts.updates.*`, `contacts.insight.read`, etc. User confirmed reuse.

**Alternatives considered**: New Contact Manager / Contact Master roles — rejected; duplicates permission UI.

---

## R2 — Loyalty Gold / Platinum numeric thresholds

**Decision**: Keep **production code** thresholds for computed tier and master assignment validation: Gold ≥ **100,000**, Platinum ≥ **250,000** (`lib/customer-insight/loyalty-tier.ts`). Outreach card eligibility = lifetime total ≥ Gold min and no persisted master assignment yet. Do **not** silently switch to 033’s clarified 75k/200k in this feature.

**Rationale**: Live code, tests, and progress bar still use 100k/250k; push filters (75k–100k / 200k–250k) are being removed. Changing thresholds mid-feature would surprise merchants. Spec FR-021’s 75k/200k reflected an unimplemented 033 clarification.

**Alternatives considered**: Adopt 75k/200k per 033/039 text — deferred until product explicitly re-requests a threshold change as its own task.

---

## R3 — Contact history + remark (append-only)

**Decision**: Extend `ContactAllocationUpdate` with optional `remark String?` and `outcome String?` (e.g. `contacted`, `loyalty_informed`, `responded`, `not_responded`). Every contact mark creates a **new row**; never update prior rows. `lastContactedAt` = max(`createdAt`) excluding `category: "allocation"`. Expose history via insight GET history endpoint. Contact Updates page should show remark column from the same rows when listing recent updates.

**Rationale**: Table already powers call-center charts and last-contacted; note today only lives in audit metadata and is lost as a first-class history field. Profile `ContactMaster.remarks` stays a single CRM field — distinct from per-event contact remark.

**Alternatives considered**: Separate `ContactContactHistory` table — rejected (duplication). Store remark only in AuditLog — rejected (audit modules change; history UX needs structured list).

---

## R4 — Persisted master loyalty assignment vs computed tier

**Decision**: Add on `ContactMaster`: `loyaltyAssignedTier` (`gold` | `platinum` | null), `loyaltyAssignedAt`, `loyaltyAssignedByUserId`, `loyaltyOutreachStatus` (`null` | `eligible` | `contacted` | `responded` | `not_responded` | `assigned`). Insight detail card shows **assigned** tier + who/when when set; progress bar may still show computed spend tier separately or align label to assigned when present (prefer: badge = assigned when set, else computed). Registration-date filter uses `loyaltyAssignedAt`.

**Rationale**: Spec requires who/when and registration-date filter; computed-only tiers cannot support that.

**Alternatives considered**: Assignment-only table — workable but Principle V prefers fields on contact + audit/history rows unless third use case appears.

---

## R5 — Loyalty outreach state machine

**Decision**:

1. Eligible: allocated, lifetime ≥ Gold min, `loyaltyAssignedTier` null → appear on merchant loyalty card; status `eligible` (lazy or nightly/on-read mark).
2. Merchant marks loyalty informed → history row + status `contacted`.
3. Merchant sets Responded → status `responded` → visible in master queue.
4. Not responded → status `not_responded`; stays on merchant card for follow-up; not in master queue.
5. User with `contacts.master.manage` assigns Gold/Platinum if lifetime in band → status `assigned`, set tier fields, audit + history.

**Rationale**: Matches clarified product flow without inventing a separate workflow engine.

**Alternatives considered**: Auto-assign tier on Responded — rejected; spec requires master human step.

---

## R6 — Merge Contact

**Decision**: New `POST /api/admin/customer-insight/merge` requiring `contacts.merge`. Body: `sourceContactId`, `targetContactId` (survive = target). Server merges phones/emails into target, re-points dependent FKs where safe (`ContactAllocationUpdate`, Adapt history, etc.), soft-archives or deletes source per existing contact-delete patterns, writes audit under `customer-insight` module. UI only on insight for permitted users.

**Rationale**: Spec gates merge; no merge exists today. Exact FK list finalized at implement from Prisma relations on `ContactMaster`.

**Alternatives considered**: Client-only merge — rejected (authZ). Reuse contacts.manage bulk tools — rejected (too broad).

---

## R7 — Insight filter changes

**Decision**:

| Filter | Approach |
|--------|----------|
| Birthday range | Match `birthMonth`/`birthDay` to inclusive from–to (month-day); support year-wrap |
| Min total only | Already possible if max omitted — ensure Zod treats max optional and filter does not invent upper bound |
| Remove push + loyalty quick filters | Drop from Zod + UI |
| Last contacted range | Filter by latest non-allocation `ContactAllocationUpdate.createdAt` |
| Brand A–Z + search | Sort `filter-options` ascending; client search box |
| Item ± brand | New options endpoint/params; filter contacts who purchased item (Cosmo lines + Adapt); brand scopes item list |
| Loyalty registration date | Filter on `loyaltyAssignedAt` |
| No-purchase date range | Replace exclusive 3\|6 with optional `noPurchaseFrom`/`noPurchaseTo` (or single range meaning no purchase in window) |

Keep AND semantics + sort by lifetime total desc (brand spend sort only when brand filter alone, matching current brand behavior where applicable).

**Rationale**: Maps 1:1 to spec; builds on `filters.ts` / `filter-options`.

---

## R8 — Merchant dashboard cards, call center, date range

**Decision**:

- Default: hide Daily Customer + Top Lifetime cards; query flag / UI toggle `showCustomerLists=true` restores them.
- Add loyalty-outreach card mirroring nearest-birthdays layout + contact/respond actions.
- Embed merchant-scoped Call Center Performance (reuse `GET .../contacts/allocation/performance` with merchant identity + from/to).
- Add from/to date range for merchant graphs that are period-based (sales/history/call-center); main dashboard already has from/to — ensure both stay consistent (Colombo day bounds). Merchant MTD peer boards may remain month-scoped unless range explicitly drives them (prefer: range drives call-center + sales history charts first; peer MTD stays calendar month unless cheap).

**Rationale**: Spec asks call center on merchant dash and date range for both graph contexts; main already ranged.

**Alternatives considered**: Full Overview clone on merchant — rejected (037 already personalizes; this adds missing call-center + range).

---

## R9 — Audit Trail modules

**Decision**: Add audit modules `customer-insight` and `merchant-dashboard` to `AUDIT_LOG_MODULES` + action group entries. Actions e.g. `contact_merged`, `insight_contacted`, `loyalty_responded`, `loyalty_assigned`, `merchant_loyalty_contacted`. Continue writing legacy `contacts` / `contact_follow_up_contacted` only where backward compatibility needed; new insight/merchant flows use new modules.

**Rationale**: Spec requires distinct Audit Trail modules; `module` is a free string with typed const today.

---

## R10 — Agent context script

**Decision**: Skip — `.specify/scripts` has no update-agent-context script in this repo. Context for agents is this `plan.md` + `research.md` + contracts.

**Rationale**: Skill step cannot run a missing script.

---

## Resolved NEEDS CLARIFICATION

All Technical Context unknowns resolved via codebase inspection + session clarification (permissions). Threshold conflict resolved in R2 (keep live 100k/250k).
