# Feature Specification: Purchasing Calculator Stacked Layout

**Feature Branch**: `017-purchasing-calc-layout`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "UI modification — list down top of page under search; click a result to load data full screen under the search, not side by side."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search results appear under the search bar (Priority: P1)

A purchasing user opens the Purchasing calculator, types a SKU or product name, and sees matching results in a list **directly below the search controls**, spanning the page width (not in a left column beside the detail panel).

**Why this priority**: The current side-by-side layout squeezes both the result list and the detail/margin panel; stacking results under search matches how buyers scan and pick a SKU.

**Independent Test**: Search for a known term that returns multiple SKUs; confirm the result list sits under the search bar and uses the full content width; no side-by-side split with the detail panel.

**Acceptance Scenarios**:

1. **Given** the Purchasing calculator page is open, **When** the user runs a search that returns results, **Then** the matching SKU list appears below the search field/button across the available page width.
2. **Given** search results are shown, **When** the user views the layout, **Then** there is no persistent left/right split that places results beside the SKU detail panel.
3. **Given** no search has been run (or results are empty), **When** the page is shown, **Then** a clear empty/prompt state appears in the results area under search (same as today in meaning, new position).

---

### User Story 2 - Click a result to load full-width SKU detail below the list (Priority: P1)

After selecting a SKU from the list, the margin calculator, pricing fields, supplier compare, and related detail content load **below the result list**, using the full content width so more of the supplier compare and margin tools are readable without a narrow right column.

**Why this priority**: Detail (especially supplier compare) needs horizontal space; stacking detail under the list is the core layout change requested.

**Independent Test**: Click a result SKU; confirm identity, purchase/cost, margin inputs, and supplier compare appear under the list full-width; selecting another SKU updates that same detail area.

**Acceptance Scenarios**:

1. **Given** search results are listed under search, **When** the user clicks a SKU row, **Then** that SKU’s detail panel (cost, margin, supplier compare, price-change) loads below the list at full content width.
2. **Given** a SKU is already selected, **When** the user clicks a different result, **Then** the detail area updates to the newly selected SKU without returning to a side-by-side layout.
3. **Given** no SKU is selected yet, **When** results are visible, **Then** the detail area shows a clear prompt to select a SKU (or remains empty with guidance) rather than a blank right column.
4. **Given** a SKU is selected, **When** the page is viewed on a typical desktop viewport, **Then** the detail content is not constrained to roughly half the page width as in the previous side-by-side layout.

---

### User Story 3 - Preserve existing calculator behavior after layout change (Priority: P2)

Layout change only; searching, selecting, margin math, original vs discounted price display, supplier compare fetch, and quote compare continue to work as before for users with purchasing-tools access.

**Why this priority**: Avoid regressions while reshaping the page.

**Independent Test**: Select a known SKU; confirm cost/margin/supplier compare still load and update as before (same data and permissions).

**Acceptance Scenarios**:

1. **Given** an authorized purchasing-tools user, **When** they search and select a SKU in the new layout, **Then** purchase/cost, margin fields, and supplier compare still function as before.
2. **Given** a user without purchasing-tools permission, **When** they attempt to use the calculator, **Then** access remains denied as today (layout change does not widen access).

---

### Edge Cases

- Long result lists → list remains scrollable within a reasonable max height so the detail panel below stays reachable without endless page scroll before selection.
- Mobile / narrow viewport → stacked layout remains usable (list then detail); no regression to an unusable horizontal squeeze.
- Rapid re-search while a SKU is selected → results refresh under search; selection may clear or stay if still in results (default: clear selection when a new search runs, so detail does not show a stale SKU).
- Empty search results → list empty state under search; detail area not showing a previous SKU unless still intentionally selected (default: clear selection on new search).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Purchasing calculator MUST present the SKU search result list **below** the search controls, not beside the detail panel.
- **FR-002**: After the user selects a result, SKU detail (identity, purchase/cost, margin/selling inputs, supplier compare, supplier price-change) MUST render **below** the result list using the full content width of the calculator section.
- **FR-003**: The calculator MUST NOT use a persistent side-by-side (list left / detail right) layout for search results and detail.
- **FR-004**: Selecting a result MUST visually indicate the active SKU in the list and load that SKU’s detail in the stacked detail area.
- **FR-005**: Existing purchasing-calculator behaviors (search debounce/min length, margin math, original-price margin rule, supplier compare, session-only quote compare) MUST remain available after the layout change.
- **FR-006**: Long result lists MUST remain usable (scroll within the list region) so users can reach the detail area without losing access to results.
- **FR-007**: Starting a new search MUST clear the current SKU selection so detail does not remain on a SKU that is no longer the focus of the new query.

### Key Entities

- **Search result list**: Ordered set of catalog SKUs matching the query; displayed under search.
- **SKU detail panel**: Full-width block under the list showing cost, margin tools, and supplier compare for the selected SKU.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a desktop viewport (≥1200px wide), the SKU detail area uses the full calculator content width (not a ~50% right column) after selection.
- **SC-002**: Users can search, select a SKU, and see margin or supplier-compare content in under 30 seconds without layout confusion in a 5-person pilot.
- **SC-003**: 100% of existing calculator functions available before the change remain reachable in the new layout (search, select, margin, supplier compare, quote compare).
- **SC-004**: Zero side-by-side list/detail layouts remain on the Purchasing calculator page after release.

## Assumptions

- Scope is the **Purchasing calculator** SKU margin & price-compare panel only (not OSF hub, not abandoned orders).
- Visual styling (colors, badges) stays consistent with the current design system; only structure/layout changes.
- Permissions and APIs are unchanged; this is a presentation change.
- Result list uses a capped scroll height when many rows return so detail stays reachable.
- New search clears selection (documented in FR-007).

## Out of Scope

- Redesigning margin formulas, supplier ranking, or OSF Excel export.
- New permissions or API endpoints.
- Changing search matching rules (min characters, debounce).
