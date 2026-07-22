# Feature Specification: ERP–OS Item Match

**Feature Branch**: `019-erp-os-item-match`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "i want checkout all items in erp1 and erp2 cosmetics.lk and items in our os are match? and status of those items vat, priority like wise"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See whether ERP1, ERP2, and OS catalogs match (Priority: P1)

A Cosmetics.lk catalog or purchasing admin needs to confirm that every stock item known in ERP1 and ERP2 also exists in Cosmo OS (and vice versa where expected). Today this is a manual, error-prone check across three places. They open a reconciliation view, run a check, and see a clear summary: matched, missing in OS, missing in ERP1, missing in ERP2, and present only in one source.

**Why this priority**: Catalog drift between the two ERPs and OS causes wrong purchasing, stickers, OSF, and sales workflows. Existence match is the foundation before status comparison.

**Independent Test**: Run the check against a known set of SKUs (some in all three sources, some missing from one); verify counts and row classifications match the known set.

**Acceptance Scenarios**:

1. **Given** a SKU that exists in ERP1, ERP2, and Cosmo OS, **When** the reconciliation runs, **Then** that SKU is classified as present in all three sources.
2. **Given** a SKU that exists in ERP1 and/or ERP2 but not in Cosmo OS, **When** the reconciliation runs, **Then** the SKU is listed as missing from OS with which ERP source(s) have it.
3. **Given** a SKU that exists in Cosmo OS but not in ERP1 and/or ERP2, **When** the reconciliation runs, **Then** the SKU is listed as missing from the relevant ERP source(s).
4. **Given** the check completes, **When** the user views the summary, **Then** they see totals for matched, missing-in-OS, missing-in-ERP1, missing-in-ERP2, and ERP1≠ERP2 presence mismatches.

---

### User Story 2 - Compare item status (VAT, priority, and related) across sources (Priority: P1)

For SKUs present in more than one source, the admin needs to know whether **item status** agrees — including VAT-related status, brand/product priority, and related lifecycle statuses (e.g. Continue, Discontinue, Newly Added). They need side-by-side values and a clear match / mismatch flag so they can fix catalog data.

**Why this priority**: Status (VAT, priority, continue/discontinue) drives purchasing and reporting; existence alone is not enough if statuses diverge.

**Independent Test**: Use SKUs with known matching and differing statuses across OS and ERPs; verify match vs mismatch classification and that both (or all) status values are shown.

**Acceptance Scenarios**:

1. **Given** a SKU present in OS and at least one ERP with the same normalized status (e.g. both “VAT - Top Priority Brand”), **When** status comparison runs, **Then** the row is marked status-matched.
2. **Given** a SKU whose OS status differs from ERP1 and/or ERP2 (e.g. OS “Continue” vs ERP “Discontinue”, or priority vs VAT status), **When** comparison runs, **Then** the row is marked status-mismatched and shows each source’s status value.
3. **Given** a SKU missing status in one source but present in another, **When** comparison runs, **Then** it is treated as a status gap (not silently treated as a match).
4. **Given** the user filters to “status mismatches only”, **When** they apply the filter, **Then** only rows with status disagreement or missing status in a source are shown.

---

### User Story 3 - Filter, search, and export the reconciliation result (Priority: P2)

Admins need to work a large catalog: search by SKU or name, filter by mismatch type (missing presence, status mismatch, ERP1 vs ERP2 only), and export the current result set for offline cleanup or sharing with the team.

**Why this priority**: Without filter/export, a full-catalog check is hard to act on day-to-day.

**Independent Test**: Run a check that produces mixed row types; apply each primary filter and an export; verify row counts and export contents match the filtered view.

**Acceptance Scenarios**:

1. **Given** reconciliation results are loaded, **When** the user searches by SKU (or partial SKU), **Then** only matching rows remain.
2. **Given** results include multiple mismatch types, **When** the user filters by a mismatch type, **Then** only that type is shown and the summary count for that filter is accurate.
3. **Given** a filtered result set, **When** the user exports, **Then** the export contains the visible rows with SKU, presence per source, and status per source.
4. **Given** no mismatches for a filter, **When** that filter is selected, **Then** an empty state explains that everything matches for that filter (not a system error).

---

### User Story 4 - Understand when data could not be checked (Priority: P2)

If one ERP is unreachable or credentials are missing, the admin must still see what could be compared and what could not — without inventing “matches” for unchecked sources.

**Why this priority**: A false “all match” when ERP2 was never contacted would be worse than an incomplete check.

**Independent Test**: Simulate one ERP unavailable; verify the UI clearly states which source failed and that rows do not claim a match against that source.

**Acceptance Scenarios**:

1. **Given** ERP1 is available and ERP2 is not, **When** reconciliation runs, **Then** the user sees a clear warning that ERP2 was not checked, and results distinguish “not checked” from “missing”.
2. **Given** Cosmo OS catalog is available, **When** both ERPs fail, **Then** the check fails with a clear error and does not present a fake full match.
3. **Given** a partial check, **When** the user exports, **Then** the export notes which sources were included in the run.

---

### Edge Cases

- Same SKU with different casing or leading/trailing spaces → treated as the same item code after normalization; shown once.
- Item disabled/inactive in an ERP but present in OS → still included in presence comparison; inactive flag shown so it is not confused with “missing”.
- SKU in ERP1 and ERP2 with different item names but same code → presence matched by code; name differences may be shown as informational, not as a presence mismatch.
- Very large catalogs → check completes with progress/feedback; user can still filter and export when done.
- Status labels that differ only by punctuation/spacing but mean the same category (e.g. “VAT - Top Priority Brand” vs “VAT-Top Priority Brand”) → compared as the same normalized status.
- Status present only as free text that cannot be mapped to a known category → shown as-is and flagged as uncategorized / needs review, not forced into a false match.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an authorized Cosmetics.lk admin workspace to run a full-catalog item reconciliation across ERP1, ERP2, and Cosmo OS.
- **FR-002**: System MUST match items primarily by normalized item code / SKU across all three sources.
- **FR-003**: System MUST report, for each SKU, whether it exists in ERP1, ERP2, and Cosmo OS.
- **FR-004**: System MUST report item status for each source where available, covering at least: VAT-related status, brand/product priority statuses, and lifecycle statuses already used in Cosmo OS (e.g. Newly Added, Continue, Discontinue, Uncategorized).
- **FR-005**: System MUST classify each SKU into clear outcomes: present in all sources, missing from one or more sources, and (when comparable) status match vs status mismatch.
- **FR-006**: System MUST normalize status labels for comparison so equivalent wording maps to the same status category before declaring a mismatch.
- **FR-007**: Users MUST be able to filter results by mismatch type and search by SKU (and item name when available).
- **FR-008**: Users MUST be able to export the current (optionally filtered) result set including presence and status per source.
- **FR-009**: System MUST NOT invent status or presence values when a source is unavailable; it MUST surface partial-check or failure states clearly.
- **FR-010**: Only users with appropriate catalog/admin permission for the company MUST be able to run or export the reconciliation.
- **FR-011**: System MUST show a summary of counts (matched presence, presence gaps, status matches, status mismatches) after each run.
- **FR-012**: v1 MUST be read-only reconciliation (report and export). It MUST NOT automatically overwrite OS or ERP status values; fixing mismatches remains a separate manual or existing import workflow.

### Key Entities

- **Catalog Source**: One of ERP1, ERP2, or Cosmo OS for Cosmetics.lk; each contributes item codes and status attributes.
- **Reconciled Item**: A single SKU compared across sources; holds presence flags, status per source, normalized status category, and match/mismatch outcome.
- **Reconciliation Run**: One check execution with timestamp, which sources succeeded, summary counts, and the result set available to filter/export.
- **Item Status**: Business classification such as VAT / Top Priority Brand, Priority Brand / Priority Product combinations, Newly Added, Continue, Discontinue, or Uncategorized.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized user can start a full Cosmetics.lk catalog check and see summary counts within 5 minutes for a typical production catalog size.
- **SC-002**: 100% of SKUs returned in a run are classified with an explicit presence outcome for every source that was successfully checked (no unclassified rows).
- **SC-003**: For SKUs present in OS and at least one checked ERP, status match vs mismatch is determined for at least 95% of rows with mappable status labels (remainder explicitly “needs review”).
- **SC-004**: Users can isolate status mismatches or presence gaps via filter and act on them (export or follow-up list) without manually opening ERP1, ERP2, and OS item-by-item.
- **SC-005**: In a validation sample of at least 20 known SKUs (mix of match, missing, and status mismatch), reconciliation outcomes agree with the known ground truth for all sampled SKUs.
- **SC-006**: When one ERP source is unavailable, users never receive an “all matched” result that implies that source was checked.

## Assumptions

- Scope is **Cosmetics.lk** Cosmo OS and its configured dual ERP instances labeled ERP1 and ERP2 (not Vault OS in v1).
- Primary match key is **item code / SKU**; barcode or name is secondary display only.
- “Status” means the business item-status taxonomy already used in Cosmo OS (VAT, priority brand/product, newly added, continue, discontinue, uncategorized), compared to the corresponding status field(s) maintained on ERP items when available.
- If an ERP item has no status field populated, that is a status gap, not a silent match to OS.
- Inactive/disabled ERP items are still included so the team can see them; they are not excluded from presence checks by default.
- v1 is an audit/report tool; correcting OS status may continue to use existing status import or manual edit flows.
- Only company admins (or equivalent catalog permission holders) need access; warehouse floor users do not.
- Name-only differences without SKU/status issues are informational and do not block a “presence matched” outcome.
