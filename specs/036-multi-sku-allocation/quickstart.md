# Quickstart: Multi-SKU Location Allocation

**Feature**: 036-multi-sku-allocation  
**Page**: `/dashboard/store/allocation`  
**Permission**: `store.allocation.read`

## Prerequisites

- User with `store.allocation.read` on a store role (and fix deployed so grants are not wiped by old RBAC sync).
- ≥3 active catalog items with SKU/barcode, OSF TOTAL ORDER QTY, and ROP columns.
- Prefer items with some Cosmo completed sales in last 90 days at mapped locations (for short-shipment demos).

## Local run

```powershell
npm run dev
```

Open `/dashboard/store/allocation` while logged in as a permitted user.

## Validation scenarios

### 1. Multi-add cart

1. Scan/search item A → appears with take qty blank/zero.
2. Scan/search item B and C → list has 3 rows.
3. Re-scan A → no duplicate; existing row focused; toast/message.
4. Remove B → A and C remain.

**Expect**: Max message if adding beyond 50.

### 2. Per-SKU take qty + isolated plans

1. Set take qty on A and B to different values.
2. Confirm each gets its own location suggestions summing to its take qty.
3. Change A’s take qty → B’s qtys unchanged.

### 3. Location walkthrough + arrows + skip zeros

1. With 2+ items planned, start walkthrough.
2. First step shows **all** included items’ qty for that location only.
3. Right arrow → next location that has ≥1 non-zero qty; left arrow returns.
4. Confirm locations where every item qty is 0 never appear.
5. Focus a qty input and press arrows → qty field behavior, not step change; Esc/blur then arrows navigate.

### 4. Edit + export

1. On a middle location step, edit one item qty.
2. Adjust other locations so each SKU still sums to take qty.
3. Export → one xlsx with by-location summary and per-SKU detail.
4. Break one SKU sum → export blocked with clear error.

### 5. Regression: single SKU

1. Add only one item, enter take qty, walkthrough (one item per step), export — still works.

## Automated checks

```powershell
npx vitest run lib/store-allocation
```

Expect allocate + walkthrough helper tests green after implementation.

## Done when

- Scenarios 1–5 pass on a staging/dev company DB.
- No ERP stock transfer created by export.
- Spec success criteria SC-001…SC-007 satisfied in UAT notes.
