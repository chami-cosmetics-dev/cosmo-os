# Feature Specification: Fix Sticker Batch Quantity Print

**Feature Branch**: `016-fix-sticker-quantity`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "we have sticker printing function on our OS, problem is when we add quantity in batch -> Sticker Batch Items -> Quantity if we give quantity as 5, when we print 5 stickers should print for that item, now only one print. Clarification: preview should not display that count of previews; show the number instead."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Print Multiple Stickers per Quantity (Priority: P1)

A warehouse or purchasing user creates a sticker batch, adds an item with quantity 5, then opens Print and prints the batch. They expect five identical stickers for that item so each physical unit can be labeled. Today only one sticker prints.

**Why this priority**: Incorrect sticker count blocks labeling workflows and forces manual workarounds (re-printing or duplicating rows). This is the core defect.

**Independent Test**: Create a batch with one item at quantity 5, open Sticker Print, confirm preview shows one card with quantity indicated as 5, then print and confirm 5 physical labels are produced for that item.

**Acceptance Scenarios**:

1. **Given** a saved sticker batch with one item whose Quantity is 5, **When** the user prints that batch, **Then** exactly 5 sticker labels are produced for that item (same SKU / item details repeated on each printed label).
2. **Given** a batch whose item quantities sum to N (e.g. item A qty 3 and item B qty 2), **When** the user prints, **Then** exactly N sticker labels are produced (3 for A and 2 for B).
3. **Given** a batch item with Quantity 1, **When** the user prints, **Then** exactly one sticker is printed for that item (no regression).

---

### User Story 2 - Preview Shows One Card Plus Quantity Number (Priority: P1)

When reviewing a batch before printing, the user sees one preview sticker per line item (not N repeated cards). The quantity for each item is shown as a number so they know how many labels will print, without cluttering the screen with duplicate previews.

**Why this priority**: Large quantities (e.g. 50+) would make a repeated-preview UI unusable; users need a clear count without N visual copies on screen.

**Independent Test**: Load a batch with one item at quantity 5; verify exactly one preview sticker is shown and the quantity number 5 is visible; sticker count summary (if shown) reflects total labels to print.

**Acceptance Scenarios**:

1. **Given** a batch item with Quantity 5, **When** the batch is loaded on Sticker Print, **Then** the on-screen preview shows one sticker preview for that item and displays the quantity as the number 5 (not five duplicate preview cards).
2. **Given** a batch with items quantities 5, 2, and 1, **When** the batch is loaded on Sticker Print, **Then** the preview shows three sticker previews (one per line item), each showing its own quantity number, and any total sticker count shown equals 8 (labels that will print).
3. **Given** a batch item with Quantity 1, **When** previewed, **Then** one preview card is shown with quantity indicated as 1.

---

### User Story 3 - Batch Entry Quantity Still Means Labels Needed (Priority: P2)

On Sticker Batch, the Quantity field on each row continues to mean “how many stickers to print for this item.” Saving and editing quantity remains unchanged; print honors that value while preview only displays the number.

**Why this priority**: Confirms existing batch data entry stays meaningful once print is fixed; no change to how users enter quantities.

**Independent Test**: Edit quantity on a batch item, save, reload print view, confirm preview still shows one card with the updated number, and a print run produces that many labels.

**Acceptance Scenarios**:

1. **Given** a batch item currently at quantity 2, **When** the user changes Quantity to 4 and saves, **Then** Sticker Print preview shows one card with quantity 4, and printing produces 4 stickers for that item.

---

### Edge Cases

- Quantity of 1: one preview card showing 1; one printed sticker.
- Large quantities (within existing allowed limits): preview still shows a single card with the number; print produces that many copies (may span multiple pages/sheets).
- Batches with multiple line items: one preview per line item, each with its quantity number; print expands each line by its own quantity.
- Empty batches or batches with no items still show the existing empty state.
- Changing quantity after a previous print must affect the next preview number and the next print run (uses current saved quantity).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When printing a sticker batch, the system MUST produce one sticker label copy for each unit of Quantity on each batch item (Quantity N → N identical printed stickers for that item).
- **FR-002**: On-screen preview MUST show exactly one sticker preview per batch line item, regardless of Quantity (must not render N duplicate preview cards for quantity N).
- **FR-003**: On-screen preview MUST display the Quantity for each line item as a visible number so the user can see how many labels will print for that item.
- **FR-004**: Any on-screen total sticker count for the loaded batch MUST equal the sum of all batch item quantities (total labels that will print), not merely the count of distinct line items.
- **FR-005**: Each printed copy for a given batch item MUST carry the same item identity and label content as that item’s single-copy sticker (SKU, name, location/supplier fields as already shown today).
- **FR-006**: A batch item with Quantity 1 MUST continue to produce exactly one printed sticker, with preview showing one card and quantity 1.
- **FR-007**: Existing Sticker Batch create/edit flows for entering and saving Quantity MUST remain usable without requiring users to duplicate rows to get multiple labels.

### Key Entities

- **Sticker Batch**: A saved set of items prepared for label printing (date, supplier context, and line items).
- **Sticker Batch Item**: One product line on a batch, including Quantity (how many sticker copies are required for that product).
- **Sticker Label Copy**: One printable label instance derived from a batch item; quantity N yields N printed copies. Preview shows one representation plus the quantity number, not N on-screen copies.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any batch item with Quantity N (1–100 in typical warehouse use), a print run produces exactly N stickers for that item on 100% of test runs.
- **SC-002**: For the same item with Quantity N, on-screen preview shows exactly one sticker card and clearly displays the number N (0% of cases show N duplicate preview cards).
- **SC-003**: For mixed-quantity batches, the total printed sticker count matches the sum of item quantities with zero missing or extra labels in verification checks.
- **SC-004**: Users no longer need to add duplicate rows or re-print the same item to get multiple labels; a single row with Quantity N is sufficient.
- **SC-005**: Single-quantity (N = 1) batches continue to preview and print correctly with no increase in wrong-count incidents for that case.

## Assumptions

- Quantity on Sticker Batch Items already means “number of stickers to print for this item”; the defect is that print ignores that value and emits one sticker per row.
- Preview and print behavior intentionally differ: preview = one card + quantity number; print = N physical labels.
- No change to maximum allowed quantity validation is required beyond honoring existing saved values.
- Label content per printed copy stays the same as today’s single sticker for that item (no per-copy serial numbers or unique IDs unless already present).
- Both Cosmo and Vault sticker layouts (if both exist) must honor quantity the same way for print, and show the quantity number on preview.
- Out of scope: redesigning batch entry UI, changing print hardware drivers, or adding new label templates.
