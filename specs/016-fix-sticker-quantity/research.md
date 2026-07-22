# Research: Fix Sticker Batch Quantity Print

## 1. Where quantity is lost today

**Decision**: Treat the bug as a Sticker Print client defect, not a data or API gap.

**Rationale**: `GET /api/admin/sticker-batches/[id]` already returns `quantity` on each item. `sticker-print-client.tsx` maps `detail.items` once into `.sticker-sheet` and `handlePrint` clones that sheet, so one DOM card → one printed label. “Sticker Count” uses `stickers.length` (line items), not sum of quantities.

**Alternatives considered**:
- Changing batch save to duplicate rows per quantity — rejected (violates FR-007; bloated data).
- Expanding quantity in the API response into N item objects — rejected (breaks preview 1:1 requirement; heavier payloads).

## 2. Preview vs print rendering

**Decision**: Dual behavior from the same batch payload:
- **Preview (screen)**: one sticker card per line item; show Quantity as a visible number (badge/label) outside or overlaid with `no-print` so it never appears on physical labels.
- **Print**: expand each line item into `quantity` identical sticker cards in the print document.

**Rationale**: Spec explicitly forbids N preview cards; print must still emit N labels. Current print clones `.sticker-sheet`, so print must use an expanded sheet (or build expanded HTML at print time), not the 1:1 preview DOM alone.

**Alternatives considered**:
- Always render N cards in a hidden print-only sheet in React — works but costly for large quantities kept mounted; acceptable only if quantities stay small; prefer expand-on-print to keep preview DOM light.
- Browser `window.print()` with CSS `copies` — not available for per-item copy counts; rejected.

## 3. How to expand for print

**Decision**: Add a pure helper `expandItemsByQuantity(items)` that returns a flat list of `{ item, copyIndex }` of length `sum(quantity)`. On Print, render/build sticker cards from that list into the print window (clone each line’s preview card node `quantity` times, or render an expanded fragment). Use `totalStickerCount(items)` for the summary metric.

**Rationale**: Pure functions are easy to unit-test (Constitution III) and keep React logic thin. Cloning the already-correct Cosmo/Vault card markup preserves label fidelity (FR-005).

**Alternatives considered**:
- Inline `Array.from({ length: qty })` only in JSX with no helper — rejected for weak test surface.
- Server-side PDF generation — out of scope; existing flow is browser print of HTML stickers.

## 4. Quantity number UI placement

**Decision**: Show quantity as a small screen-only number adjacent to each preview card (wrapper in `sticker-print-client`), not as permanent text inside the yellow sticker artwork.

**Rationale**: Printed labels must stay identical to today’s design; quantity is a preview affordance, not label content. Wrapper avoids forking Cosmo vs Vault card internals.

**Alternatives considered**:
- Put “×5” inside the sticker card component — risk of leaking into print clones unless carefully stripped; more invasive.
- Only show total count in the header — insufficient for FR-003 (per-item quantity visible).

## 5. Scope boundaries

**Decision**: No Prisma migrations, no batch editor changes, no new permissions, no print-driver work. Both Cosmo (`StickerPreviewCard`) and Vault (`VaultStickerPreviewCard`) paths updated the same way in the shared print client.

**Rationale**: Matches Assumptions and Constitution V (simplicity).

**Alternatives considered**: None material; batch entry already stores quantity correctly.
