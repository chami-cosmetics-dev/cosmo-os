# Research: OSF Zip Clear & Priority Cascade Filters

**Feature**: `034-osf-zip-clear-cascade` | **Date**: 2026-08-08

## R1 — When to clear the working table after Generate zip

**Decision**: Clear table + `clearDraft(companyId, userId)` only after the generate HTTP response is **OK** and the client has obtained the zip blob (same success path that triggers download + success toast). Do not clear on validation failure, non-OK response, or thrown errors.

**Rationale**: Spec FR-001/FR-002; users must retry failed generates without rebuilding the draft. Browser “download blocked” after a successful blob is still a successful generate — clear anyway (spec edge case).

**Alternatives considered**:
- Clear only after user confirms download → fragile; browsers don’t expose download completion reliably.
- Clear on button click before request → loses data on failure.
- Server-side draft clear → no server draft exists (031 localStorage-only).

## R2 — How to scope brands by priority

**Decision**: Extend `GET /api/admin/osf/supplier-orders/page-data` with optional `priority` query. When set (trimmed non-empty), return vendors for the company that have **at least one** ProductItem with `sku` not null, `status` not `archived`, and `(erp1ProductPriority = priority OR erp2ProductPriority = priority)` — same match rule as `/items`. When omitted/empty, return all company vendors (current behavior).

**Rationale**: Single bootstrap endpoint already owned by this panel; avoids a second route; keeps auth/permission identical; Prisma `Vendor` ↔ `productItems.some` is indexed on company+priority fields.

**Alternatives considered**:
- Client-side filter of all brands from a full item scan → too heavy / incomplete without paging all SKUs.
- New `/brands` endpoint → unnecessary surface area for one consumer.
- Static brand–priority mapping table → contradicts spec assumption (derive from items).
- Return brands-by-priority map in one payload → larger payload; most users pick one priority at a time.

## R3 — Product list vs priority (already implemented?)

**Decision**: Treat `/items` priority + `vendorId` filtering as **already correct** for FR-007/FR-008. Implementation work is verify + ensure panel refetch on priority/brand change (already `useEffect` when `searchOpen`). No items-contract change unless a bug is found in UAT.

**Rationale**: Current `items/route.ts` applies the same OR priority predicate and optional `vendorId`; panel already passes both query params.

**Alternatives considered**:
- Duplicate product filtering only on client → insecure and incomplete; keep server filter.
- New page-data “products” bundle → worse than existing paginated `/items`.

## R4 — Invalid brand after priority change

**Decision**: After brands refetch for the new priority, if `vendorId` is non-empty and not present in the new brand list, set `vendorId` to `""` (All brands). If still present, keep selection.

**Rationale**: Spec FR-006; prevents empty item searches against a brand that has no items under the new priority.

**Alternatives considered**:
- Always reset brand on any priority change → worse UX when brand remains valid.
- Keep stale brand silently → confusing empty search.

## R5 — Shared priority predicate

**Decision**: Prefer a small shared helper (e.g. in `lib/osf/` or inline duplicate once) for “product item matches priority string” used by `/items` and page-data brand filter. Extract only if both call sites need the same shape; otherwise document identical OR clause in contract and accept brief duplication (constitution simplicity).

**Rationale**: Avoid drift between brand cascade and item filter; don’t over-abstract for two call sites unless tests benefit.

**Alternatives considered**:
- Large shared query builder → overkill for this enhancement.

## R6 — Agent context / branch

**Decision**: Spec directory is `specs/034-osf-zip-clear-cascade`. No `.specify` agent-context update script is present in this repo; skip agent-context rewrite. Git branch may be created later at implement/tasks time; plan artifacts do not require switching branch.

**Rationale**: setup-plan returned empty `BRANCH`; feature.json already points at this directory.
