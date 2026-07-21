# Research: OSF Column Visibility by User

## R1 — Permission key and gate

**Decision**: Add `purchasing.osf.permission` to `DEFAULT_PERMISSIONS` in `lib/rbac.ts` (Purchasing category, alongside `purchasing.osf.read` / `.manage`). Assignment UI and `GET`/`PUT` column-access APIs require this key via `requirePermission` / `hasPermission`. Download rights stay on existing `purchasing.osf.read` (full) and `purchasing.tools.read` (reorder-only) as today.

**Rationale**: Matches user clarification and existing Roles UI chip pattern; keeps assign capability separate from content manage and from tools.

**Alternatives considered**: Reuse `purchasing.osf.manage` alone — rejected (user asked for a dedicated permission). Role-attached column permissions — superseded by clarify session (per-user marks UI).

## R2 — Storage for per-user marks

**Decision**: New Prisma model `OsfUserColumnAccess` with `companyId`, `userId`, `columnGroups` (`String[]` of group ids), unique `(companyId, userId)`. Upsert on save from assignment UI. Missing row ⇒ default **core only** for restricted downloaders.

**Rationale**: Simple, company-scoped, one row per assignee; aligns with “persist across redeploy.” Array of known group ids avoids a join table for v1.

**Alternatives considered**: Store marks on Role — rejected by clarify. JSON blob on User — weaker company isolation. Per-header boolean matrix — too heavy for v1 (spec: groups).

## R3 — Column group catalog

**Decision**: Fixed catalog in `lib/osf/column-groups.ts` (code const + Zod enum). Groups:

| Group id | Includes (workbook headers / bands) | Default for unmarked restricted user |
|----------|-------------------------------------|--------------------------------------|
| `core` | Identity, stock locations, Total/Common stock, ROP, % of ROP / 70% cues, order qty / TOTAL / Common reorder | Always on (cannot unmark) |
| `pricing` | Cosmetics MRP, Discounted Price, OGF Price | Off |
| `cost` | Latest Cost, Latest supplier, Last Purchase Qty/Date, Days Since, Purchased (last 30d) | Off |
| `margins` | Cosmetics Margin %, OGF Margin % | Off |
| `sales` | Sales Units (month) | Off |

`core` is always included for any permitted download. UI only toggles `pricing`, `cost`, `margins`, `sales` (and any future optional groups).

**Rationale**: Maps cleanly onto existing `pricing` flags in `build-workbook`; matches FR-005.

**Alternatives considered**: Free-form header pickers — rejected (UX + drift). Separate group per warehouse column — out of scope.

## R4 — Effective groups at download time

**Decision**: Helper `resolveEffectiveOsfColumnGroups(context)`:

1. If user has `purchasing.osf.manage` **or** `purchasing.osf.permission` → all groups.
2. Else load `OsfUserColumnAccess` for `(companyId, userId)`; start from `{ core }` ∪ marked groups; ignore unknown ids.
3. Pass resolved set into `buildOsfWorkbookBuffer` to filter column defs on **Main** (and any other sheets in that download).

**Rationale**: Implements FR-004 / FR-013 server-side; cannot trust client.

**Alternatives considered**: Filter only after XLSX write — harder. Client-only hide — insecure.

## R5 — Buyer sheets vs hard-coded margins

**Decision**: Remove `BUYERS_WITH_MARGIN_COLUMNS`, `buyerMargin`, and `buyerSeesMarginColumns`. Buyer sheets (if still generated) continue to exclude all pricing-flagged columns (stock/ROP/order only) — they are **not** the visibility mechanism. Restricted users’ downloads use Main filtered by their marks; full-access downloads keep Main with all columns + existing buyer sheets for brand views.

**Rationale**: Spec FR-008 / FR-011; stops Inoka/Dilrukshi name hard-coding. Equivalent access = mark those Cosmo users for `margins`.

**Alternatives considered**: Put margins only on buyer sheets for marked users — conflicts with “not buyer sheets.” Drop buyer sheets entirely in this feature — out of scope (leave brand sheets as-is for full-access files).

## R6 — Assignment UI user list

**Decision**: List company users who hold any of: `purchasing.osf.read`, `purchasing.osf.manage`, `purchasing.osf.permission`, `purchasing.tools.read`, `purchasing.tools.manage`. Show name/email + current marks. Exclude deactivated users if the app has that flag.

**Rationale**: Matches assumption “any purchasing permission”; small list for Cosmo.

**Alternatives considered**: Only `purchasing.osf.read` — too narrow (tools users download reorder-only). All company users — noisy.

## R7 — API shape

**Decision**:

- `GET /api/admin/osf/column-access` — require `purchasing.osf.permission`; returns `{ groups, users: [{ id, name, email, columnGroups }] }`.
- `PUT /api/admin/osf/column-access` — same auth; body `{ userId, columnGroups: string[] }` (or batch array); validates cuid + group enum; does not allow removing `core` (server always adds it).

Generate unchanged URL; internally resolves groups for `getCurrentUserContext()`.

**Rationale**: Aggregated page-data style optional later; single resource is enough for the small UI.

## R8 — Migration of current margin behavior

**Decision**: No automatic seed of Inoka/Dilrukshi marks (names may not match Cosmo accounts). Quickstart documents: assigner marks those users for `margins` after deploy. Hard-coded path deleted in same change set.

**Rationale**: Avoid brittle name matching; explicit UAT step.
