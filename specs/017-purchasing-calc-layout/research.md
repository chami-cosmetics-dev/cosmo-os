# Research: Purchasing Calculator Stacked Layout

## R1 — Layout structure

**Decision**: Vertical stack under the section header:

1. Search input + Search button (unchanged)
2. Full-width result list (`max-h-72 overflow-y-auto rounded-md border`)
3. Full-width detail panel (`space-y-4 rounded-md border p-3`) when content is shown

Remove the wrapper `grid gap-4 md:grid-cols-2` that places list and detail side by side on `md+` breakpoints.

**Rationale**: Spec FR-001–FR-003; matches user request and screenshot intent (list top, detail full width below).

**Alternatives considered**:
- Keep side-by-side on desktop, stack only on mobile — rejected (user asked to end side-by-side).
- Horizontal tabs (Results | Detail) — rejected (extra interaction; not requested).
- Modal detail — rejected (loses at-a-glance compare with list).

## R2 — List scroll height

**Decision**: Keep existing `max-h-72` + `overflow-y-auto` on the result list so long catalogs do not push detail off-screen indefinitely (FR-006).

**Rationale**: Already proven in current UI; satisfies edge case without new design tokens.

**Alternatives considered**: Unbounded list (page scroll only) — rejected (detail hard to reach). Collapse list after selection — rejected (users often switch SKUs among results).

## R3 — Clear selection on new search (FR-007)

**Decision**: At the start of a successful search path when `trimmed.length >= SEARCH_MIN_CHARS`, clear:

- `selected` → `null`
- supplier list / loading / error state
- optionally reset margin/quote inputs when clearing selection (same as “no SKU selected”)

Also clear selection when search is aborted early because query is below min length and `items` are cleared.

Debounced auto-search (on `q` change) counts as a new search and clears selection the same way.

**Rationale**: Spec default; prevents stale detail under a new result set.

**Alternatives considered**: Keep selection if SKU still in new results — rejected (spec default is clear). Clear only on explicit Search button — rejected (debounce is the primary search path).

## R4 — Detail empty state

**Decision**: When results exist but nothing is selected, show the existing prompt (“Select a SKU to calculate.”) in the full-width detail region under the list (not a blank right column).

**Rationale**: FR-002 / User Story 2 scenario 3; reuses current copy.

## R5 — Scope boundary

**Decision**: Touch only `purchasing-sku-calculator.tsx` markup/state for layout + clear-on-search. Do not change APIs, OSF formulas, supplier ranking, or permissions.

**Rationale**: Spec Out of Scope + Constitution V.

**Alternatives considered**: Extract list/detail into new molecules — rejected (YAGNI for a one-file layout tweak).

## R6 — Verification approach

**Decision**: Manual quickstart UAT on desktop (≥1200px) and a narrow viewport; confirm no `md:grid-cols-2` list/detail split remains. No new Vitest file.

**Rationale**: Layout/CSS; visual acceptance is the success path (SC-001, SC-004).
