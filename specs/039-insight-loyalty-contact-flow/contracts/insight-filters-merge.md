# Contracts: Insight Filters & Merge

**Feature**: `039-insight-loyalty-contact-flow`  
**Auth**: Authenticated Cosmo user + permissions below. Zod on query/body; `cuidSchema` for ids.

Base: `/api/admin/customer-insight`

---

## GET `/api/admin/customer-insight/filter`

**Permission**: `contacts.insight.read` (scope: allocated for merchants; all for master/manage/allocation.manage as today)

### Query (changed)

| Param | Type | Notes |
|-------|------|--------|
| `minTotal` | number? | Inclusive lower bound |
| `maxTotal` | number? | Inclusive upper; omit = no upper bound |
| `birthdayFrom` | `MM-DD` or `month`+`day` pair | With `birthdayTo`; replaces `birthdayThisMonth` |
| `birthdayTo` | same | Inclusive; year-wrap supported |
| `lastContactedFrom` | ISO date (Colombo day) | Optional range start |
| `lastContactedTo` | ISO date | Optional range end |
| `brand` | string? | Exact brand name |
| `item` | string? | Item display key / product id as implemented |
| `loyaltyRegisteredFrom` | ISO date? | Filters `loyaltyAssignedAt` |
| `loyaltyRegisteredTo` | ISO date? | |
| `noPurchaseFrom` | ISO date? | No purchase overlapping / within window (see research) |
| `noPurchaseTo` | ISO date? | Replaces `noPurchaseMonths=3\|6` as primary |
| `page` / `pageSize` | number | Existing caps |

**Removed**: `pushToGold`, `pushToPlatinum`, `loyaltyTier`, `birthdayThisMonth` (or accept but ignore — prefer hard remove), exclusive reliance on `noPurchaseMonths`.

**Response**: Existing list DTO shape; items include enough fields for cards; sort lifetime total desc (unless brand-only spend sort retained).

---

## GET `/api/admin/customer-insight/filter-options`

**Permission**: `contacts.insight.read`

### Query

| Param | Type | Notes |
|-------|------|--------|
| `type` | `brands` \| `items` | |
| `brand` | string? | When `type=items`, restrict to brand |
| `q` | string? | Search substring |

**Response**:

```json
{
  "options": [{ "value": "string", "label": "string" }]
}
```

Brands sorted ascending A–Z. Items searchable; all items when brand omitted.

---

## POST `/api/admin/customer-insight/merge`

**Permission**: `contacts.merge` only

### Body

```json
{
  "sourceContactId": "cuid",
  "targetContactId": "cuid"
}
```

**Behavior**: Merge source into target (same company); 400 if same id; 403 without permission; 404 if missing.

**Response**: `{ "contactId": "target cuid", "merged": true }`

**Audit**: module `customer-insight`, action `contact_merged`.

---

## POST `/api/admin/customer-insight/[contactId]/contacted`

**Permission**: owner / insight contacted rules as today; optional remark

### Body (extend)

```json
{
  "category": "CallCenterCategory",
  "note": "string|null",
  "remark": "string|null",
  "outcome": "general|loyalty_informed|responded|not_responded"
}
```

Persists `remark`/`outcome` on new `ContactAllocationUpdate` row; audit module `customer-insight`.

---

## GET `/api/admin/customer-insight/[contactId]/contact-history`

**Permission**: owner or `contacts.updates.read` / master / manage (mirror owner visibility)

**Response**:

```json
{
  "items": [
    {
      "id": "cuid",
      "createdAt": "ISO",
      "merchantName": "string|null",
      "category": "string|null",
      "remark": "string|null",
      "outcome": "string|null"
    }
  ]
}
```

Newest first. Does not overwrite; full append-only list (paginate if needed).
