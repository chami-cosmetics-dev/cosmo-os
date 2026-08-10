# Quickstart: Store Location Allocation

**Feature**: `035-store-location-allocation`  
**Contracts**: [contracts/store-location-allocation.md](./contracts/store-location-allocation.md)  
**Data model**: [data-model.md](./data-model.md)

## Prerequisites

- `npm run dev`
- User with `store.allocation.read` (or final permission key)
- Catalog item with barcode + SKU, OSF ROPs on multiple active ROP columns, ERP stock available
- Some completed Cosmo orders (delivery/invoice complete) for that SKU at mapped locations in the last 30 days (for sales weighting demos)

## Setup

```bash
npm run dev
```

Open `/dashboard/store/allocation` (path from plan).

## Validation scenarios

### 1. SKU search

1. Type a known SKU → Enter.  
2. **Expect**: Priority, SKU, barcode, description, TOTAL ORDER QTY.

### 2. Barcode / scanner

1. Focus search; paste/scan barcode + Enter.  
2. **Expect**: Same item detail as SKU lookup.  
3. Unknown code → clear not-found / empty matches.

### 3. Full vs short take

1. Note company TOTAL ORDER QTY (e.g. 50).  
2. Enter take qty = 50 (or equal).  
3. **Expect**: Location suggestions sum to take qty.  
4. Enter take qty = 30 (&lt; 50).  
5. **Expect**: `shortShipment` behavior; suggestions sum to 30; locations with need 0 get 0 while others still need.

### 4. Need × sales preference

1. Fixture/location where one shop has high need + high sales vs low sales.  
2. **Expect**: Higher weight location gets more of the short take (not a flat ROP ratio alone).

### 5. Manual edit + export

1. Edit a location qty so sum ≠ take → Export disabled/blocked.  
2. Fix sum = take → Export downloads xlsx with location qtys.  
3. Confirm no ERP stock transfer created.

### 6. Print (if implemented)

1. Valid plan → Print → printable summary shows SKU and location qtys.

## Automated checks

```bash
npm test -- lib/store-allocation
```

Expect allocate helper tests for remainder, caps, zero-need, all-zero-need fallback.

## Done when

- Scenarios 1–5 pass  
- Unit tests green  
- Store users without purchasing OSF still blocked from OSF hub but can use allocation if granted the store permission
