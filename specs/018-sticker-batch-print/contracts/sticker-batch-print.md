# Contract: Unified Sticker Batch & Print

## Navigation & routes

| Route | Behavior |
|-------|----------|
| `/dashboard/sticker-batch` | Primary Batch & Print workspace (create/edit, history, preview, print) |
| `/dashboard/sticker-batch?batchId=` | Load batch into workspace |
| `/dashboard/sticker-batch?tab=history` | History tab (existing) |
| `/dashboard/sticker-print` | Redirect to `/dashboard/sticker-batch` (preserve `batchId` query if present) |

Sidebar: one Stickers item → Batch & Print (visible if user has any sticker batch or print permission).

## Permissions (existing keys)

| Action | Permission |
|--------|------------|
| View/load batches | `stickers.batch.read` or `stickers.print.read` |
| Mutate batch/items | `stickers.batch.manage` |
| Print | Prefer `stickers.print.print` or `stickers.print.read` as today; do not widen beyond existing keys without product sign-off |

## Catalog inputs for price/name (page load)

Batch page catalog entries MUST include:

| Field | Required for |
|-------|----------------|
| `price` | Fallback unit price |
| `compareAtPrice` | Original/list unit price |
| `productTitle`, `variantTitle`, `sku` | Name + match |
| OGF map `sku → ogfPrice` (or join) | LWK unit price |

## Client helper contracts

### `cleanStickerItemName(name)`

- Removes trailing `(Default Title)` (case-insensitive, optional spaces).
- Returns trimmed remainder or safe placeholder if empty.

### Sticker dates

- Accept: progressive `DD/MM/YYYY`, 8-digit `YYYYMMDD`, 8-digit `DDMMYYYY`.
- Output: `DD/MM/YYYY` when valid; reject invalid calendars.
- `expireFromManufacture(mfd) → mfd + 3 years` as `DD/MM/YYYY`.

### `resolveStickerUnitPrice({ price, compareAtPrice, ogfPrice, isLwk })`

| Condition | Result |
|-----------|--------|
| `isLwk` and `ogfPrice` set | OGF price string (2 dp) |
| `isLwk` and no `ogfPrice` | empty / null (do not use discount `price`) |
| not LWK and `compareAtPrice` set | compare-at |
| not LWK else | `price` |

`isLwk`: locationReference equals `LWK` (trim, case-insensitive).

## Print / preview (Cosmo)

| Surface | Address | Name | Price | Quantity |
|---------|---------|------|-------|----------|
| Preview card | `companyAddress` | cleaned | stored `unitPrice` | one card + qty badge |
| Print | same card content × quantity | cleaned | stored | expand via 016 helpers |

## APIs (unchanged shapes)

`GET/POST /api/admin/sticker-batches`, `GET/PUT .../[id]`, `PUT .../[id]/items` keep current JSON shapes. Clients MUST send dates as `DD/MM/YYYY` after normalization. No new endpoints required if page server-loads catalog + OGF map.
