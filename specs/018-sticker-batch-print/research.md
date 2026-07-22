# Research: Unified Sticker Batch & Print

## 1. Unify pages: merge into batch vs keep two routes

**Decision**: Make `/dashboard/sticker-batch` the single Batch & Print workspace. Redirect `/dashboard/sticker-print` (and `?batchId=`) to the batch page. Collapse sidebar to one Stickers entry (“Batch & Print”).

**Rationale**: Batch client already owns create/edit/history and a floating preview; print client’s unique value is quantity-aware sheet + print window. Merging print into batch avoids dual maintenance and matches FR-001/002. Redirect preserves bookmarks.

**Alternatives considered**:
- New third route `/sticker-batch-print` — unnecessary extra path churn.
- Keep two pages with shared components only — fails “one page” requirement.

## 2. Item name: strip Default Title

**Decision**: Shared `cleanStickerItemName()` strips trailing `(Default Title)` (case-insensitive) when building `itemName` on catalog select and when displaying Cosmo stickers. Align with existing Vault preview cleaner.

**Rationale**: Today batch builds `` `${productTitle} (${variantTitle})` ``, so Default Title is persisted and printed on Cosmo. Cleaning at write + display prevents dirty stored and shown names.

**Alternatives considered**:
- Display-only strip on Cosmo card — leaves dirty `itemName` in DB/history.
- Strip all parenthetical suffixes — too aggressive.

## 3. Cosmo sticker address = main company address

**Decision**: Cosmo `StickerPreviewCard` uses `companyAddress` for the address line (do not prefer `locationAddress`). Vault card unchanged (no address line today).

**Rationale**: Spec requires Cosmetics.lk main company address; current Cosmo card uses `locationAddress || companyAddress`, so location wins. Company record address is already returned by batch detail API.

**Alternatives considered**:
- Hardcode cosmetics.lk string — brittle; company record is source of truth.
- Change API to omit location address — unnecessary if UI stops preferring it.

## 4. MFD compact input + EPD = MFD + 3 years

**Decision**: Extract `lib/sticker-dates.ts`: accept `YYYYMMDD`, `DDMMYYYY` (8 digits), and progressive `DD/MM/YYYY` typing; normalize to `DD/MM/YYYY`. On valid MFD set/change, set EPD to MFD + 3 calendar years. Manual EPD edits allowed; next MFD change refreshes EPD. API continues to receive `DD/MM/YYYY` (existing parsers).

**Rationale**: Matches acceptance scenarios; keeps server contract stable; pure helpers are unit-testable.

**Alternatives considered**:
- Server-side only normalization — still need client UX for typing.
- Never overwrite manual EPD on MFD change — contradicts spec assumption that MFD change re-defaults EPD.

## 5. Original price vs discount; LWK → OGF price

**Decision**:
- Non-LWK: sticker unit price = `compareAtPrice` if present and > 0, else `price` (same idea as list/MRP elsewhere / `originalSellingPrice` with MRP = compare-at).
- LWK: detect via `CompanyLocation.locationReference` matching `LWK` (case-insensitive trim). Unit price = `ProductOsfProfile.ogfPrice` for that SKU when set; if missing, leave blank / clear rather than silently using discount `price`.
- Recalculate on item select and on location change.
- Batch page catalog must load `compareAtPrice` and an SKU→ogfPrice map from `ProductOsfProfile`.

**Rationale**: Today only `ProductItem.price` is loaded and applied — that is the discounted sell price. OGF/LWK price is not on `ProductItem`; it lives on `ProductOsfProfile.ogfPrice`.

**Alternatives considered**:
- Location-scoped Shopify `ProductItem.price` for LWK only — may still be sale price and is not the maintained OGF field.
- Store both prices on batch item — out of scope; one `unitPrice` field is enough if recalculated on location change.

## 6. Preserve 016 print quantity behavior

**Decision**: Reuse `lib/sticker-print-quantity.ts` in the unified client: preview one card per line + quantity badge; print expands via `expandItemsByQuantity`.

**Rationale**: Spec assumes quantity behavior remains; helpers already tested.

**Alternatives considered**: Re-implement print expansion inline — rejected (duplication).
