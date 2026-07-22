# UI Contract: Purchasing Calculator Stacked Layout

**Surface**: Purchasing calculator — “SKU margin & price compare” panel  
**Component**: `components/organisms/purchasing-sku-calculator.tsx`  
**APIs**: Unchanged (`GET /api/admin/purchasing/sku-pricing`, `GET .../suppliers`)

## Layout contract

```text
┌─────────────────────────────────────────────┐
│ Section title + help text                   │
├─────────────────────────────────────────────┤
│ [ Search input .................... ] [Go]  │
├─────────────────────────────────────────────┤
│ Result list (full width, max-height scroll) │
│  · SKU + title rows                         │
│  · Selected row visually highlighted        │
├─────────────────────────────────────────────┤
│ Detail panel (full width)                   │
│  · Empty: “Select a SKU…”                   │
│  · Or: cost, margin, supplier compare, …    │
└─────────────────────────────────────────────┘
```

## MUST

| ID | Rule |
|----|------|
| L-1 | Result list is **below** search controls |
| L-2 | Detail panel is **below** the result list |
| L-3 | Neither list nor detail is placed in a persistent left/right column pair for this panel |
| L-4 | Detail uses the full content width of the calculator section on desktop |
| L-5 | Active list row remains visually distinct |
| L-6 | Starting a new search (debounce or button) clears selection so detail does not show a stale SKU |

## MUST NOT

| ID | Rule |
|----|------|
| X-1 | Use `md:grid-cols-2` (or equivalent) to put list beside detail |
| X-2 | Change search/select API payloads or permissions as part of this feature |

## Nested grids allowed

Inner grids inside the detail panel (e.g. supplier row metadata `sm:grid-cols-2`, margin input pairs) remain allowed — they are content layout, not the list/detail shell.
