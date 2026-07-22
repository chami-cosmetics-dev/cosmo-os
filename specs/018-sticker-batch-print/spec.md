# Feature Specification: Unified Sticker Batch & Print

**Feature Branch**: `018-sticker-batch-print`

**Created**: 2026-07-22

**Status**: Draft

**Input**: User description: "now we dont need two pages for sticker printing combine both to one page batch&print in sticker item name dispay defult with item name why that display we dont need default part, also sticekr address should our main company cosmetics.lk address for cosmo os, we added vault os address already, when we add MFD like 20260703 or 03072026 it automatically get as defaut format, also want set EPD automatically set mfd + 3years can be edit anytime, i saw issue in unit price it takes discounted price need get original price for that, LWK(ogf) have different price no whrn we select location to LWK in sticker print unit price should change for LWK price,"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Single Batch & Print Workspace (Priority: P1)

A warehouse user prepares sticker batches and prints labels in one place. Today they must switch between separate Batch and Print pages. They need one combined Batch & Print page where they can add/edit items, see preview, and print without navigating away.

**Why this priority**: Splitting the workflow across two pages is the main daily friction for sticker work.

**Independent Test**: Open the combined Sticker Batch & Print page; create or load a batch, edit items, preview, and print without visiting a second sticker page.

**Acceptance Scenarios**:

1. **Given** a user with sticker permissions, **When** they open Stickers navigation, **Then** they reach one Batch & Print workspace (not two separate primary pages for batch vs print).
2. **Given** the combined page, **When** the user adds items and prints, **Then** they can complete the flow on that page without opening a second sticker screen.
3. **Given** existing saved batches, **When** the user opens Batch & Print, **Then** they can still load history/saved batches and print from the same page.

---

### User Story 2 - Clean Item Names Without “Default” Suffix (Priority: P1)

When a product name includes a “Default” / “Default Title” style suffix, stickers and batch rows show that clutter. Users want the displayed item name without that default part.

**Why this priority**: Wrong or noisy names print on every physical label.

**Independent Test**: Select a product whose catalog name includes a default-title suffix; confirm batch row and sticker preview/print show the cleaned name only.

**Acceptance Scenarios**:

1. **Given** a product whose name ends with a default-title style suffix (e.g. “Product (Default Title)”), **When** it is added to a sticker batch, **Then** the displayed and printed item name omits that default part.
2. **Given** a product name with no default suffix, **When** added to a batch, **Then** the full meaningful name is unchanged.

---

### User Story 3 - Cosmo Stickers Use Main Cosmetics.lk Company Address (Priority: P1)

On Cosmo OS stickers, the address on the label must be the main Cosmetics.lk company address (not a secondary/location-specific address). Vault OS already has the correct address behavior and must not regress.

**Why this priority**: Printed labels must show the correct legal/trading address for Cosmo.

**Independent Test**: On Cosmo OS, preview/print a sticker and confirm the address matches the main Cosmetics.lk company address; on Vault OS, confirm existing address behavior still works.

**Acceptance Scenarios**:

1. **Given** Cosmo OS, **When** a user previews or prints a sticker, **Then** the address on the sticker is the main Cosmetics.lk company address.
2. **Given** Vault OS, **When** a user previews or prints a sticker, **Then** the existing Vault address behavior remains correct (no regression).

---

### User Story 4 - MFD Auto-Format and EPD = MFD + 3 Years (Priority: P1)

When entering manufacture date (MFD) as compact forms such as `20260703` or `03072026`, the system normalizes to the standard sticker date format. Expire date (EPD) automatically becomes MFD + 3 years, and the user can still edit EPD afterward anytime.

**Why this priority**: Manual date entry and expire calculation are error-prone and slow.

**Independent Test**: Type MFD as `20260703` and as `03072026`; confirm both normalize to the standard format and EPD becomes MFD + 3 years; then manually change EPD and confirm the override sticks until the user changes it again.

**Acceptance Scenarios**:

1. **Given** an empty or editable MFD field, **When** the user enters `20260703`, **Then** MFD displays in the standard sticker date format for that calendar day.
2. **Given** the user enters `03072026` as MFD, **When** the value is accepted, **Then** it normalizes to the same standard format for 3 July 2026 (day-month-year reading).
3. **Given** a valid MFD is set or changed, **When** auto-EPD runs, **Then** EPD is set to MFD + 3 years in the standard format.
4. **Given** EPD was auto-filled, **When** the user edits EPD to another valid date, **Then** the edited EPD is kept (not immediately overwritten) until MFD changes again (at which point EPD may re-default to the new MFD + 3 years).

---

### User Story 5 - Unit Price Uses Original (Non-Discounted) Price (Priority: P1)

Sticker unit price currently picks up a discounted/sale price. Stickers must show the original (regular/list) price instead.

**Why this priority**: Incorrect shelf/label pricing misleads staff and customers.

**Independent Test**: Add an item that has both a regular and a discounted catalog price; confirm sticker unit price uses the original/regular price, not the discount price.

**Acceptance Scenarios**:

1. **Given** a product with an original/regular price and a lower discounted selling price, **When** it is added to a Cosmo sticker batch (non-LWK location), **Then** unit price is the original/regular price.
2. **Given** a product with only one price (no separate discount), **When** added to a batch, **Then** that price is used.

---

### User Story 6 - LWK (OGF) Location Uses LWK Price (Priority: P1)

LWK (OGF) has a different price. When the user selects location LWK for a sticker line, unit price must switch to the LWK/OGF price for that item.

**Why this priority**: Wrong price on LWK labels causes operational errors for that channel.

**Independent Test**: Select a non-LWK location and note price; switch the same line’s location to LWK and confirm unit price updates to the LWK/OGF price; switch away and confirm non-LWK original-price behavior returns.

**Acceptance Scenarios**:

1. **Given** a product with a distinct LWK/OGF price, **When** the user sets the sticker line location to LWK, **Then** unit price becomes the LWK/OGF price.
2. **Given** a line currently on LWK with LWK price, **When** the user changes location to a non-LWK location, **Then** unit price returns to the original/regular Cosmo sticker price rule (User Story 5).
3. **Given** LWK is selected but no LWK/OGF price exists for the item, **When** price is resolved, **Then** the user sees a clear empty/missing price state or safe fallback that does not silently use the wrong discount price (per Assumptions).

---

### Edge Cases

- Ambiguous compact MFD strings that are not valid calendar dates are rejected or left unnormalized with clear feedback (not silently wrong dates).
- Changing MFD after a manual EPD edit re-applies EPD = new MFD + 3 years (user can edit EPD again).
- Combined page must preserve existing quantity-to-print behavior (quantity N prints N labels; preview shows one card + quantity number) if already delivered.
- Item names that only consisted of the default suffix after stripping must show a sensible placeholder rather than blank garbage.
- Vault OS: name cleaning and date helpers apply where Vault uses those fields; Vault address path unchanged.
- Permissions: users who could access batch and/or print before can use the combined workspace according to existing sticker permission rules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a single Sticker Batch & Print workspace that covers batch create/edit, preview, and print (replacing the need for two separate primary pages).
- **FR-002**: Navigation MUST direct users to the combined workspace instead of requiring separate Batch and Print destinations as the primary sticker flow.
- **FR-003**: Displayed and printed item names MUST omit default-title style suffixes (e.g. “(Default Title)” / similar “default” catalog suffixes) while preserving the rest of the name.
- **FR-004**: On Cosmo OS, sticker address content MUST use the main Cosmetics.lk company address.
- **FR-005**: On Vault OS, existing sticker address behavior MUST remain correct.
- **FR-006**: MFD entry MUST accept compact inputs such as `YYYYMMDD` (e.g. `20260703`) and `DDMMYYYY` (e.g. `03072026`) and normalize them to the standard sticker date display format when valid.
- **FR-007**: When MFD is set or changed to a valid date, EPD MUST default to MFD + 3 years in the standard format.
- **FR-008**: Users MUST be able to edit EPD at any time after auto-fill; a subsequent MFD change MAY refresh EPD to the new MFD + 3 years.
- **FR-009**: For non-LWK Cosmo sticker lines, unit price MUST resolve to the item’s original/regular price, not the discounted selling price when both exist.
- **FR-010**: When sticker line location is LWK (OGF), unit price MUST resolve to that item’s LWK/OGF price.
- **FR-011**: Changing location between LWK and non-LWK MUST recalculate unit price according to FR-009 / FR-010.
- **FR-012**: Existing saved batches MUST remain loadable and printable from the combined workspace.

### Key Entities

- **Sticker Batch**: Saved set of sticker lines (name, date, supplier, items) prepared for labeling.
- **Sticker Batch Item**: Line with item identity, cleaned name, quantity, MFD, EPD, location, and unit price.
- **Company Address (Cosmetics.lk)**: Main Cosmo company address used on Cosmo stickers.
- **Location (incl. LWK)**: Fulfillment/sales location on a line; LWK selects LWK/OGF pricing.
- **Catalog Price**: Original/regular price vs discounted selling price vs LWK/OGF price for the same item.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users complete add-item → preview → print without opening a second sticker page in 100% of standard sticker runs in UAT.
- **SC-002**: 100% of sampled item names that previously showed a default-title suffix print without that suffix.
- **SC-003**: 100% of Cosmo sticker prints in UAT show the main Cosmetics.lk company address; Vault address checks remain at 100% pass.
- **SC-004**: Valid compact MFD inputs (`YYYYMMDD` and `DDMMYYYY`) normalize correctly in ≥95% of tester attempts on first try; EPD auto-sets to MFD + 3 years in 100% of those cases.
- **SC-005**: For items with both regular and discount prices, non-LWK sticker unit price matches the original/regular price in 100% of test cases.
- **SC-006**: Selecting LWK updates unit price to the LWK/OGF price in 100% of items that have an LWK/OGF price configured.
- **SC-007**: Testers report the combined workflow as clearer than the two-page flow (majority “agree” in informal UAT).

## Assumptions

- “Default” in item names refers to catalog suffixes such as “(Default Title)” (and equivalent), already cleaned on Vault preview in some cases; Cosmo batch/print must apply the same cleaning consistently.
- Standard sticker date format remains the existing Cosmo sticker date display convention (day/month/year style already used in sticker batch).
- Compact MFD `03072026` is interpreted as DDMMYYYY (3 July 2026); `20260703` as YYYYMMDD.
- When MFD changes, refreshing EPD to MFD + 3 years is desired even if EPD was manually edited earlier (user can edit again).
- Original/regular price means the non-sale list price when a separate compare/list price exists; otherwise the sole catalog price.
- LWK is identified by the existing location reference/code used in the product (commonly “LWK”); LWK price is the OGF/LWK price maintained for that item in Cosmo catalog data.
- If LWK/OGF price is missing, do not invent a discount price; leave price blank or keep prior value only with clear user-visible indication — prefer blank/require attention over wrong price.
- Combining pages retires separate Batch and Print as primary nav entries (redirects or single nav item are acceptable); deep links to old paths should land on the combined workspace.
- Quantity print behavior from the recent sticker-quantity fix remains in scope to preserve, not redesign.
- Out of scope: new label template redesign, printer driver changes, Vault address redesign, non-sticker pricing elsewhere in the OS.
