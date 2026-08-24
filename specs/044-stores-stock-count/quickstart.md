# Quickstart: Store Stock Count

**Feature**: `044-stores-stock-count`  
**Contracts**: [contracts/store-stock-count.md](./contracts/store-stock-count.md)  
**Data model**: [data-model.md](./data-model.md)

## Prerequisites

- `npm run dev` with an env that has at least one `ErpnextInstance` (key/secret/URL)
- User with `store.stock_count.read` (stores-level-01/02 after pin, or grant manually)
- ERP company with known stock items, including one with a barcode and known on-hand
- Keyboard-wedge scanner optional (Enter-terminated paste works)

## Setup

```bash
npm run dev
```

Open `/dashboard/store/stock-count`.

## Validation scenarios

### 1. Company picker

1. Open the page.  
2. **Expect**: ERP companies from **this** OS’s instances, labels enough to tell two ERPs apart.  
3. User without permission → denied, no item stock shown.

### 2. Load one company

1. Select one company → Load.  
2. **Expect**: SKU, name, description, barcode, that company’s live stock, empty count, no numeric difference.  
3. Zero-stock items present.  
4. Spot-check one SKU against ERP on-hand.

### 3. Load two companies

1. Select two companies (same or different instances) → Load.  
2. **Expect**: one row per SKU; stock column/cells per company; item in only one company shows 0 (not the other company’s qty) for the missing side.

### 4. Scan / type barcode

1. Focus barcode field (empty). Scan or paste barcode + Enter three times.  
2. **Expect**: matching row highlighted and in view; count 3; field cleared; ready for next scan.  
3. Scan a second item once → that count 1; first stays 3.  
4. Unknown code → not-found toast; counts unchanged.  
5. Empty Enter → no toast spam.

### 5. Difference

1. Note live stock S. Leave count empty → difference blank.  
2. Scan until count = S → difference 0.  
3. Type count 0 → difference −S.  
4. Type count S+2 → difference +2.

### 6. Refresh stock

1. Change on-hand in ERP for a counted SKU.  
2. Refresh on the page.  
3. **Expect**: new stock and difference; counts unchanged.  
4. Confirm ERP itself was **not** written by this page.

### 7. Change companies / clear

1. With counts present, change selection → cancel → counts remain.  
2. Confirm change → list reloads; counts empty.  
3. Clear counts → all empty; stock unchanged.

### 8. ERP down for one company

1. With two companies, simulate one instance failure (bad URL on a copy is enough in staging).  
2. **Expect**: that company’s stock unavailable, not 0; other company still usable; existing counts not wiped.

## Automated checks

```bash
npm test -- lib/store-stock-count
```

Expect tests for unique/ambiguous/unknown scan, difference (uncounted, zero count, unavailable stock), SKU merge across companies.

## Done when

- Scenarios 1–7 pass on a real ERP  
- Unit tests green  
- Store users without this permission cannot open items  
- No Stock Reconciliation / stock update appears in ERP after a count session
