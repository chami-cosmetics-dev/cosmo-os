# Data Model: Fix Sticker Batch Quantity Print

No schema changes. Existing entities and fields are sufficient.

## Entities (existing)

### Sticker Batch

| Field (conceptual) | Notes |
|--------------------|--------|
| Id | Batch identity |
| Batch name / date | Display on print UI |
| Supplier | Name/code used on labels |
| Company | Company name/address on Cosmo labels |
| Items | Collection of batch items |

### Sticker Batch Item

| Field (conceptual) | Notes |
|--------------------|--------|
| Id | Line identity |
| Item code / name | Label content |
| Unit price, dates, location | Label content (Cosmo) |
| **Quantity** | Positive integer; number of identical stickers to **print** for this line |

### Sticker Label Copy (derived, not persisted)

| Field (conceptual) | Notes |
|--------------------|--------|
| Source item | Batch item the copy comes from |
| Copy index | 1…Quantity for that item |
| Label content | Same as source item’s single sticker |

**Derivation rule**: For each batch item with Quantity N, print produces N label copies. Preview shows one representation + the number N.

## Validation rules (existing; unchanged)

- Quantity is a positive integer (API already validates on create/update; max per existing Zod).
- Print client MUST treat missing/invalid quantity defensively as 1 only if needed for safety; preferred path is trust saved positive integers from API.

## State transitions

None. Quantity is static data until the user edits the batch; next preview/print reads current saved values.

## Relationships

```text
StickerBatch 1──* StickerBatchItem
StickerBatchItem 1──* StickerLabelCopy (derived at print time only)
```
