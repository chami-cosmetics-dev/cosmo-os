# Feature Specification: OSF Column Visibility by User

**Feature Branch**: `013-osf-column-visibility`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "we have to break down OSF columns user wise, cus some are dont show some users, want build proper method"

## Clarifications

### Session 2026-07-21

- Q: Who does “user-wise” column visibility apply to? → A: Cosmo users via permission process — not OSF buyer sheets. Buyer-sheet-based column visibility is out of scope for this feature.
- Q: How are column groups assigned? → A: **Revised** — Per Cosmo **user** via a small UI on the OSF tab (not column groups attached to roles). New permission `purchasing.osf.permission` gates who can open that UI. Earlier “per role” choice is superseded by this explanation.
- Q: How do multiple roles / grants combine, and what is the assigner UX? → A: Add `purchasing.osf.permission`. Holders see a small UI inside the OSF tab listing users who have purchasing permissions; they mark which columns each listed user may receive when that user downloads the OSF file **or** the reorder-only OSF file. Effective Excel columns come from those per-user marks (not from buyer sheets).
- Q: Who gets the full unrestricted Excel when they download? → A: Both `purchasing.osf.manage` and `purchasing.osf.permission` always get the full standard column set; everyone else follows their per-user marks (default core only) (Option B).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Assign OSF Excel columns per purchasing user (Priority: P1)

A Cosmo user who has **`purchasing.osf.permission`** opens the OSF tab and uses a small column-access UI. The UI lists Cosmo users who already have purchasing permissions. The assigner marks which column groups each of those users may include when they download OSF (full or reorder-only). Sensitive columns (e.g. margins, cost) appear only for users who were marked for those groups.

**Why this priority**: This is the proper method to replace hard-coded “some users don’t see some columns” behavior.

**Independent Test**: User Admin has `purchasing.osf.permission`. User A is marked for margins; User B is not. Each downloads OSF (and reorder-only); only A’s files include margin columns.

**Acceptance Scenarios**:

1. **Given** a user with `purchasing.osf.permission`, **When** they open the OSF tab, **Then** they see a small UI of users who have purchasing permissions and can mark column groups per user.
2. **Given** User A is marked for Cosmetics/OGF margins and User B is not, **When** each downloads the main OSF Excel, **Then** only User A’s file includes those margin columns.
3. **Given** the same marks, **When** each downloads reorder-only OSF, **Then** the same column restrictions apply to the reorder file.
4. **Given** marks are saved, **When** an assignee next downloads, **Then** the file reflects the new column set without a code deploy.
5. **Given** a user without `purchasing.osf.permission`, **When** they open the OSF tab, **Then** they do not see the column-assignment UI.

---

### User Story 2 - Manage / permission holders get full columns; download rights unchanged (Priority: P1)

Users with **`purchasing.osf.manage`** or **`purchasing.osf.permission`** always receive the complete standard OSF column set on download (full OSF and reorder-only). Column marks restrict other purchasing users only. Separately, column marks never replace existing download permissions (`purchasing.osf.read`, tools permissions, etc.).

**Why this priority**: Assigners and OSF managers must not lock themselves out; security for who may download stays on existing purchasing permissions.

**Independent Test**: Manage and permission users download full columns while a marked-restricted user gets a subset; a user without download permission still cannot download.

**Acceptance Scenarios**:

1. **Given** a user with `purchasing.osf.manage` or `purchasing.osf.permission`, **When** they download OSF or reorder-only OSF, **Then** their Excel includes the full standard column set.
2. **Given** other purchasing users have restrictive marks, **When** those others download, **Then** only their files are restricted — manage/permission holders’ files are not.
3. **Given** a user lacks OSF/reorder download permission, **When** they try to download, **Then** they are denied regardless of any column marks.
4. **Given** a user can download but is not manage/permission and has no extra column groups marked, **When** they download, **Then** they receive the documented default (operational core only).

---

### User Story 3 - Retire hard-coded buyer-name column rules (Priority: P2)

Hard-coded rules such as “Cosmetics/OGF margins only for Inoka and Dilrukshi buyer sheets” are removed. Equivalent access is expressed by marking those Cosmo users for the margin column groups in the OSF column-access UI.

**Why this priority**: Maintainability; depends on P1 UI and persistence.

**Independent Test**: Generate path has no buyer-name hard-coding; marked users see margins; unmarked do not.

**Acceptance Scenarios**:

1. **Given** Cosmo users Inoka and Dilrukshi are marked for margin groups (others not), **When** they download OSF, **Then** margins appear only for them, without buyer-sheet name checks in code.
2. **Given** hard-coded buyer-name column checks previously existed, **When** this feature ships, **Then** downloads use only per-user column marks, with full columns for `purchasing.osf.manage` and `purchasing.osf.permission` holders.

---

### Edge Cases

- User loses `purchasing.osf.permission` but keeps `purchasing.osf.manage`: they still get full columns on download and may still manage OSF content; they lose the column-assignment UI unless manage is later defined to include it (assignment UI requires `purchasing.osf.permission` only).
- User loses `purchasing.osf.permission`: they can no longer open the assignment UI; existing marks for other users remain until changed by someone who still has the permission.
- Listed user loses all purchasing permissions: they drop out of the assignable list; their marks are ignored or cleaned up safely; they can no longer download.
- Unknown / new column group: fail closed for restricted users until an assigner marks them for it.
- Restricted downloader with no marks: operational core columns only (identity + stock/ROP/order).
- Concurrent edits to the same user’s marks: last successful save wins.
- Buyer sheets are not used for column visibility.
- Reorder-only and full OSF downloads both honor the same per-user column marks (or full set for manage/permission holders).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST introduce permission **`purchasing.osf.permission`**, visible/assignable with other purchasing permissions (alongside `purchasing.osf.read` / `.manage` and `purchasing.tools.*`).
- **FR-002**: Users with `purchasing.osf.permission` MUST see a small column-access UI on the OSF tab that lists Cosmo users who have purchasing permissions.
- **FR-003**: From that UI, the assigner MUST be able to mark which OSF **column groups** each listed user may receive in their downloaded Excel.
- **FR-004**: System MUST apply the downloading user’s marked column groups when generating **both** the main OSF download and the reorder-only OSF download, except that holders of `purchasing.osf.manage` or `purchasing.osf.permission` MUST always receive the full standard column set.
- **FR-005**: System MUST define a clear set of **column groups** for marking (at minimum: identity/stock/ROP/order core; pricing & cost; Cosmetics/OGF margins; sales units; and other purchasing-only groups as used on the full workbook today). Core stock/ROP/order columns MUST remain in every permitted download.
- **FR-006**: System MUST persist per-user column-group marks so they survive regenerate and redeploy.
- **FR-007**: System MUST default unmarked downloaders (who are not manage/permission holders) to core columns only (no pricing/cost/margin groups) until marked.
- **FR-008**: System MUST remove hard-coded buyer-sheet / buyer-name checks that control OSF column visibility.
- **FR-009**: Users without `purchasing.osf.permission` MUST NOT use the column-assignment UI.
- **FR-010**: Column visibility MUST only include or exclude columns — it MUST NOT invent prices/stock.
- **FR-011**: OSF **buyer sheets** MUST NOT be the mechanism for column visibility; visibility is per Cosmo user marks (with manage/permission full-column exception).
- **FR-012**: Download/generate MUST still enforce existing OSF/reorder download permissions; column marks are an additional filter on columns, not a substitute for download rights.
- **FR-013**: Holders of `purchasing.osf.manage` or `purchasing.osf.permission` MUST receive the full unrestricted standard column set on their own downloads regardless of any marks.

### Key Entities

- **Cosmo user**: Logged-in account that may download OSF if they hold the required purchasing download permissions.
- **`purchasing.osf.permission`**: Permission that unlocks the OSF-tab UI to mark column groups for other purchasing users.
- **Column group**: Named bundle of related OSF Excel columns controlled together for visibility.
- **User column-group mark**: Saved set of column groups a given Cosmo user may receive on OSF / reorder-only download.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For at least 3 purchasing users with different column marks, each user’s OSF and reorder-only downloads match their marks 100% (no extra sensitive columns, no missing marked groups).
- **SC-002**: A user with `purchasing.osf.permission` can grant or revoke Cosmetics/OGF margin columns for another purchasing user in under 2 minutes from the OSF tab UI, without a code change for name lists.
- **SC-003**: After release, zero hard-coded buyer-name checks control OSF Excel column visibility.
- **SC-004**: Users with `purchasing.osf.manage` or `purchasing.osf.permission` always receive the full standard column set on download in acceptance testing; users without `purchasing.osf.permission` never see the column-assignment UI.
- **SC-005**: Users with download rights who are not manage/permission holders and have no column marks never receive cost/supplier/margin groups until marked (verified for at least one such user in UAT).

## Assumptions

- Assignment target list = Cosmo users who already have **any purchasing permission** (`purchasing.osf.*` and/or `purchasing.tools.*`); exact filter can be refined in planning if needed.
- Holders of `purchasing.osf.manage` or `purchasing.osf.permission` always get the full column set on download; only `purchasing.osf.permission` unlocks the assignment UI.
- Column visibility is managed in **groups** (not every Excel header independently) for v1.
- Buyer-sheet maintenance is **not** part of this visibility feature.
- Same per-user marks apply to **full OSF** and **reorder-only** downloads (full set for manage/permission holders).
- Brand row filtering (if still present elsewhere) remains a separate concern from column marks.
