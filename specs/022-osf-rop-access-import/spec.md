# Feature Specification: OSF Full Column Access, Shop ROPs & ROP Import

**Feature Branch**: `022-osf-rop-access-import`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "in OSF this is not enough for give access i think we need al column then we can assign who allowed to see when they download OSF from OS,also fro item wise we can set rop no, cosmatics lk have shops want show those shops also here, can add rop to them,  we need to buil process to import ROP s and update OSF rops, 1st of all we have to create template and users can download it and update and upload to OS, tamplate contain sku,barcode,location wise ROP, shop wise ROP, download it and update and upload then we can updae our OSF according to that, fro template, download with all skus. in OSF we calculate TOTAL ORDER QTY now it count without minus numbers i think, i want get sum with minus numbers if result minus then no need to reorder, total should show \"0\""

## Clarifications

### Session 2026-07-23

- Q: How should the assigner pick columns per user (wide group checkboxes vs another pattern)? → A: Keep the **user list** (name + email). Per user, open an **Access** dropdown/multi-select that lists **all OSF download column names**. Assigner can **search by column name** and mark columns; that user may see **only** the marked columns on OSF download (plus always-included core identity columns). Replaces the coarse four-group checkbox matrix as the assignment UX.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Per-user Access dropdown with searchable full column list (Priority: P1)

A Cosmo user with OSF column-permission rights opens the OSF column-access panel and sees the existing **list of purchasing users** (display name + email). For each user, the assigner opens an **Access** control (dropdown / multi-select). That control lists **every downloadable OSF column name** (not only the old four groups). The assigner can **search** within the list by column name and **mark** the columns that user is allowed to see. On download, that user receives **only** the marked columns (plus always-included core identity columns such as SKU / barcode / product name). Unmarked columns are omitted from their file.

**Why this priority**: Current four-group checkboxes are not fine-grained enough; a per-user searchable Access dropdown is the agreed way to grant column-by-column visibility.

**Independent Test**: For User A, open Access, search and mark “Purchasing cost” and one location/shop column; leave User B with none marked; each downloads OSF; only A’s file includes those columns; B still gets core identity columns only.

**Acceptance Scenarios**:

1. **Given** an assigner with OSF column-permission rights, **When** they open the column-access UI, **Then** they see the purchasing-user list and, per user, an Access control whose options include **all** non-core OSF download column names (including location and shop stock/ROP/order-related columns once those exist on OSF).
2. **Given** the Access list is open for a user, **When** the assigner types a column-name search, **Then** the list filters to matching column names so they can find and mark columns without scrolling the full set only.
3. **Given** User A has columns X and Y marked in Access and User B does not, **When** each downloads full OSF (and reorder-only OSF), **Then** only User A’s file includes X and Y; User B’s file omits them.
4. **Given** Access marks are saved, **When** an assignee next downloads, **Then** the file reflects the new column set without a code deploy.
5. **Given** a downloader who is not an unrestricted full-access role and has no columns marked in Access, **When** they download, **Then** they receive core identity columns only.
6. **Given** holders of OSF manage or column-permission roles, **When** they download, **Then** they still receive the full standard column set (unchanged privilege exception from the prior column-visibility feature).

---

### User Story 2 - Set per-SKU ROP for Cosmetics.lk shops (Priority: P1)

When editing an item’s OSF ROP values, the “ROP by column” area shows **Cosmetics.lk shops** as well as the existing location/company columns (e.g. Cosmetics.lk aggregate, LMJ, LWK, MNK, …). A purchasing manager can enter a ROP for each shop the same way they set ROP for other columns. Those shop ROPs participate in OSF stock/order calculations for the corresponding shop columns when the workbook is generated.

**Why this priority**: Cosmetics.lk operates multiple shops; without shop-level ROP fields, buyers cannot plan reorders per shop.

**Independent Test**: Open a known SKU; confirm Cosmetics.lk shop columns appear under ROP by column; save a shop ROP; regenerate OSF and verify that shop’s ROP/order columns use the saved value.

**Acceptance Scenarios**:

1. **Given** Cosmetics.lk has configured shops for OSF, **When** a manager opens item-wise OSF ROP editing, **Then** each Cosmetics.lk shop that is in scope for OSF appears as its own ROP input alongside other ROP columns.
2. **Given** a shop ROP is saved for a SKU, **When** OSF is generated, **Then** that shop’s ROP (and derived order qty when stock is available) uses the saved value.
3. **Given** a shop has no ROP set for a SKU, **When** OSF is generated, **Then** that shop’s ROP/order cells behave like other missing-ROP columns today (blank / no invented ROP).
4. **Given** shops are added or deactivated in OSF column configuration, **When** a manager next edits ROP, **Then** the ROP-by-column list matches the active shop/location ROP columns.

---

### User Story 3 - Download ROP template, edit offline, upload to update OSF ROPs (Priority: P1)

A purchasing manager downloads an ROP import **template prefilled with all SKUs**. The template includes SKU, barcode, **location-wise ROP** columns, and **shop-wise ROP** columns. The manager updates quantities offline, uploads the file back to Cosmo OS, and the system updates OSF ROPs from the file. Successful rows overwrite the corresponding SKU + column ROP values used by OSF.

**Why this priority**: Item-by-item ROP entry does not scale; bulk import is the operational path to keep location and shop ROPs current.

**Independent Test**: Download template → change two location ROPs and one shop ROP for known SKUs → upload → confirm those three ROPs updated in item editor and on next OSF generate; other SKUs unchanged.

**Acceptance Scenarios**:

1. **Given** a user with OSF manage rights, **When** they download the ROP template, **Then** the file contains all catalog SKUs in OSF scope, with SKU, barcode, one column per location ROP target, and one column per Cosmetics.lk shop ROP target (aligned with active ROP columns).
2. **Given** a valid updated template, **When** the user uploads it, **Then** the system updates OSF ROPs for the SKU + column pairs present with valid quantities and reports how many rows succeeded / failed.
3. **Given** a row with an unknown SKU or unrecognized column header, **When** upload is processed, **Then** that row (or cell) is rejected with a clear reason and does not partially corrupt other SKUs’ ROPs beyond the failed cells.
4. **Given** a cell left blank in the upload, **When** import runs, **Then** the existing ROP for that SKU + column is left unchanged (blank means “no change,” not clear-to-zero).
5. **Given** a user without OSF manage rights, **When** they try to download the template or upload updates, **Then** they are denied.

---

### User Story 4 - TOTAL ORDER QTY sums signed warehouse qtys, floored at zero (Priority: P1)

On generated OSF, per-location/shop order quantities remain signed (ROP − stock, including negatives for surplus). **TOTAL ORDER QTY** is the **sum of those signed values** (including negatives). If the signed sum is **less than zero**, TOTAL ORDER QTY displays **0** (no net reorder). The same floor-at-zero rule applies to Common SKU Reorder buy totals that previously used positive-only summing, so surplus can reduce (but not go below zero) the buy signal.

**Why this priority**: Stakeholders want net demand after surplus transfers, not a positives-only buy total; negative net means no reorder.

**Independent Test**: Fixture order qtys +10, +3, −15 → TOTAL ORDER QTY = 0 (signed sum −2 → floored to 0). Fixture +10, +3, −5 → TOTAL = 8.

**Acceptance Scenarios**:

1. **Given** warehouse/shop order qtys +10, +3, −15, **When** OSF is generated, **Then** each column still shows its signed qty, and TOTAL ORDER QTY shows **0** (not 13 and not −2).
2. **Given** warehouse/shop order qtys +10, +3, −5, **When** OSF is generated, **Then** TOTAL ORDER QTY shows **8**.
3. **Given** all warehouse/shop order qtys are positive, **When** OSF is generated, **Then** TOTAL ORDER QTY equals their full sum.
4. **Given** Common SKU Reorder aggregates that previously used positive-only sums, **When** OSF is generated, **Then** they follow the same signed-sum-then-floor-at-zero rule as TOTAL ORDER QTY.

---

### Edge Cases

- Assignable Access column list grows when new OSF columns or Cosmetics.lk shops are activated; new columns default to unmarked (hidden) for restricted downloaders until marked in Access (fail closed).
- Access search with no matches shows an empty filtered list; clearing search restores the full column list.
- Shop with no stock source configured: ROP can still be stored; order qty / stock cells follow existing missing-stock behavior.
- Template download with a very large SKU catalog: file still includes all SKUs; upload may be processed in a single job with progress/result summary (exact delivery mechanism is planning detail).
- Duplicate SKU rows in an upload: last successful row for that SKU wins, or the upload reports a duplicate error — either is acceptable if documented in the import result; default = reject duplicate SKU rows as errors and apply none of that SKU’s changes.
- Non-integer or negative ROP values in upload: reject that cell with a clear error; do not store negative ROP.
- Unrestricted full-access downloaders continue to ignore restrictive marks for their own downloads.
- Column marks never grant download rights to users who lack OSF/reorder download permission.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST present the OSF column-access UI as a **list of purchasing users**; each user MUST have an **Access** dropdown/multi-select that lists **all non-core downloadable OSF column names** (not only the previous four optional groups).
- **FR-001a**: The Access control MUST support **search/filter by column name** so assigners can find and mark columns from the full list.
- **FR-001b**: Marking columns in Access MUST be the sole grant mechanism for restricted users: that user MUST see **only** marked columns on download (plus always-included core identity columns).
- **FR-002**: System MUST apply those per-user Access marks on both full OSF and reorder-only downloads for restricted users; manage / column-permission holders MUST continue to receive the full standard column set.
- **FR-003**: Core identity columns required to identify the item (at minimum SKU, and barcode when present on the workbook) MUST remain included for every permitted downloader and MUST NOT need to be marked in Access.
- **FR-004**: System MUST show Cosmetics.lk **shops** as ROP-by-column targets on item-wise OSF ROP editing whenever those shops are configured as active OSF ROP columns.
- **FR-005**: System MUST persist per-SKU ROP quantities for shop columns the same way it does for existing location columns, and MUST use those values when generating OSF.
- **FR-006**: System MUST provide a downloadable ROP import template that includes **all SKUs** in OSF scope, with columns for SKU, barcode, each location ROP target, and each Cosmetics.lk shop ROP target.
- **FR-007**: System MUST accept an uploaded ROP template and update OSF ROPs for valid SKU + column cells; blank cells MUST mean “leave existing ROP unchanged.”
- **FR-008**: System MUST validate upload rows (known SKU, recognized ROP column headers, non-negative integer quantities) and return a clear success/failure summary without applying invalid cells.
- **FR-009**: Only users with OSF manage rights MUST be able to download the ROP template or upload ROP updates.
- **FR-010**: TOTAL ORDER QTY MUST equal the sum of per-column signed order quantities (including negatives), then show **0** when that sum is negative; it MUST NOT use positive-only summing.
- **FR-011**: Common SKU Reorder buy aggregates that previously used positive-only summing MUST use the same signed-sum-then-floor-at-zero rule as TOTAL ORDER QTY.
- **FR-012**: Per-location/shop order quantity cells MUST continue to show signed ROP − stock values (including negatives); only the total/aggregate is floored at zero.
- **FR-013**: Column visibility MUST only include or exclude columns — it MUST NOT invent prices, stock, or ROPs.
- **FR-014**: Download/generate MUST still enforce existing OSF/reorder download permissions; column marks are an additional filter, not a substitute for download rights.

### Key Entities

- **OSF download column**: A distinct column (or stable column key) that can appear on the generated OSF workbook and may be marked visible or hidden per user.
- **User Access marks**: Saved set of OSF column names marked for a Cosmo user via the per-user Access dropdown (beyond always-included core identity columns).
- **OSF ROP column**: A location or Cosmetics.lk shop target for which a per-SKU reorder point can be stored.
- **Shop ROP**: Per-SKU reorder point for a Cosmetics.lk shop column.
- **ROP import template**: Spreadsheet containing all SKUs with SKU, barcode, location-wise ROP columns, and shop-wise ROP columns for offline edit and re-upload.
- **TOTAL ORDER QTY**: Net suggested buy quantity for a SKU row after summing signed per-column order qtys and flooring negative nets at zero.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For at least 3 purchasing users with different Access marks spanning former sensitive columns and at least one location/shop column, each user’s OSF download matches their marks 100% (no extra columns, no missing marked columns).
- **SC-002**: A manager can open a SKU and see every in-scope Cosmetics.lk shop under ROP by column, set a shop ROP, and see that value on the next OSF generate within one edit–download cycle.
- **SC-003**: A manager can download the ROP template (all SKUs), update at least 10 ROP cells across locations and shops, upload, and have 100% of valid cells reflected in OSF ROPs with zero silent skips of valid rows.
- **SC-004**: On a fixture with order qtys +10, +3, −15, TOTAL ORDER QTY is **0**; on +10, +3, −5, TOTAL ORDER QTY is **8**; per-column signed values remain unchanged.
- **SC-005**: Users without OSF manage cannot download or upload the ROP template; users without download permission still cannot download OSF regardless of column marks.
- **SC-006**: An assigner can open a user’s Access dropdown, search a column name, mark or unmark it, save, and have that change apply on the next download in under 2 minutes, without a code change for column name lists.

## Assumptions

- Assignment UX is **user list → per-user Access dropdown** with searchable full column-name list and multi-mark; this replaces the prior four-group checkbox matrix for granting visibility.
- “All columns” in Access means every non-core column that can appear on the OSF download (including location/shop stock, ROP, and order-related columns once shops are on OSF); core identity columns stay always visible and are not required in Access marks.
- Cosmetics.lk shops for ROP are the shops already (or newly) represented as active OSF ROP columns for Cosmetics.lk — typically shop locations / warehouse targets under that company — not every unrelated Cosmo location.
- Blank cells on ROP upload mean “do not change”; clearing a ROP to empty remains available via the item-wise editor (or a future explicit clear convention), not via blank import cells in v1.
- Duplicate SKU rows in an upload are rejected as errors for that SKU; other valid SKUs still import.
- Negative ROP values are invalid on import and in the editor.
- TOTAL ORDER QTY signed-sum-with-floor-at-zero **replaces** the prior positives-only buy total from the OSF purchasing suite (012).
- Common SKU Reorder buy totals follow the same new total rule for consistency.
- ROP template download and upload are gated by existing OSF manage permission; column-access assignment continues to use the existing column-permission gate.
- Template format is a spreadsheet users can open in Excel/compatible tools; exact file type is a planning choice.
- Existing OSF column configuration remains the source of which location/shop columns are active; this feature surfaces shops in ROP UI, template, and Access marks when they are configured as OSF columns.
