# Quickstart: Purchasing Calculator Stacked Layout

## Prerequisites

- Cosmo env with purchasing tools access
- User with `purchasing.tools.read`
- Browser desktop width ≥ 1200px for SC-001 checks; also spot-check a narrow viewport

No database migration.

## Validation scenarios

### 1. Stacked list under search

1. Open Purchasing calculator.
2. Search a term that returns multiple SKUs (e.g. a known brand prefix).
3. Confirm the result list appears **directly under** the search field, full width.
4. Confirm there is **no** left column / right column split of list vs detail.

### 2. Full-width detail under list

1. Click a result row.
2. Confirm detail (SKU title, purchase/cost, margin, supplier compare) appears **below** the list.
3. Confirm detail spans the calculator content width (not ~half page).
4. Click a second row → detail updates; layout stays stacked.

### 3. Empty / prompt states

1. With results visible and nothing selected (after a fresh search), confirm detail shows select-SKU guidance under the list.
2. With no results, confirm empty list message under search.

### 4. Clear selection on new search

1. Select a SKU so detail is visible.
2. Change the query enough to trigger a new search (or press Search).
3. Confirm selection clears (detail returns to prompt / empty) and the new result list is under search.

### 5. Long list scroll

1. Search a broad term with many hits.
2. Confirm the list scrolls inside a capped height and detail remains reachable below without endless pre-selection page scroll.

### 6. Regression — behavior preserved

1. Select a SKU with cost and suppliers.
2. Confirm margin fields and supplier compare still load as before.
3. Confirm quote/session compare still works.
4. User without purchasing-tools access still cannot use the calculator.

## Expected outcomes

- SC-001 / SC-004: stacked full-width layout only
- SC-003: all prior calculator functions still reachable
- FR-007: no stale selected SKU after a new search
