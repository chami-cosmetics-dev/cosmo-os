# Data Model: Unified Sticker Batch & Print

No Prisma schema changes. Behavior changes use existing fields.

## Entities (existing)

### Sticker Batch / Sticker Batch Item

Unchanged persistence. Relevant item fields:

| Field | Notes for 018 |
|-------|----------------|
| `itemName` | Store cleaned name (no Default Title suffix) |
| `unitPrice` | Resolved original or LWK/OGF price at select/location change |
| `quantity` | Unchanged; print still expands (016) |
| `manufactureDate` / `expireDate` | Stored as dates; UI edits as `DD/MM/YYYY` after normalize |
| `companyLocationId` | Drives LWK detection via location reference |

### Product Item (catalog)

| Field | Sticker use |
|-------|-------------|
| `price` | Discounted/sell fallback when no compare-at |
| `compareAtPrice` | Preferred original/list price for non-LWK |
| `productTitle` / `variantTitle` | Build then clean item name |
| `sku` | Match + OGF lookup key |

### Product OSF Profile

| Field | Sticker use |
|-------|-------------|
| `ogfPrice` | Unit price when line location is LWK |
| SKU / company scope | Lookup by item SKU for company |

### Company / Company Location

| Field | Sticker use |
|-------|-------------|
| `Company.address` | Cosmo sticker address (main Cosmetics.lk) |
| `CompanyLocation.locationReference` | LWK detection (`LWK`) |
| `CompanyLocation.address` | Not used on Cosmo sticker face after this feature |

## Derived rules (not persisted)

| Rule | Definition |
|------|------------|
| Clean name | Strip trailing `(Default Title)` (case-insensitive) |
| Normalized MFD/EPD | `DD/MM/YYYY` after accepting compact or typed input |
| Auto EPD | `EPD = MFD + 3 calendar years` when MFD changes |
| Non-LWK price | `compareAtPrice ?? price` (compare-at preferred when set) |
| LWK price | `ogfPrice` for SKU; missing → empty/attention, not discount price |

## Validation

- API date strings remain `DD/MM/YYYY` after client normalize (existing Zod/API parsers).
- Unit price string format unchanged (`^\d+(\.\d{1,2})?$` when present).
- Quantity rules unchanged.

## State transitions (dates)

```text
User enters MFD (compact or typed)
  → normalize to DD/MM/YYYY if valid
  → set EPD = MFD + 3 years
User edits EPD
  → keep EPD until next MFD change
User changes MFD again
  → re-normalize MFD
  → reset EPD = new MFD + 3 years
```
