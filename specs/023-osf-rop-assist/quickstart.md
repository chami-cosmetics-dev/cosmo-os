# Quickstart: OSF Live Refresh & ROP Assist

Validate `023-osf-rop-assist` after implementation. Contract: [osf-rop-assist.md](./contracts/osf-rop-assist.md). Spec: [spec.md](./spec.md).

## Prerequisites

1. Feature code on branch; `npm run db:generate` if any schema change (v1 expects none).
2. ERP1/ERP2 configured; OSF columns active with stock/ROP.
3. Users: **Viewer** `purchasing.osf.read`; **Manager** `purchasing.osf.manage`.

## 1. Unit checks

```bash
npm test -- lib/osf/assist-window lib/osf/assist-sales
```

Expect: purchase→today window; 30-day fallback; suggested ROP rounding; range sales helper.

## 2. Refresh on open (US1)

1. Change a test Item’s Product Priority in ERP (e.g. Newly Added → Top Priority).
2. Change Bin qty for that SKU in ERP.
3. Open Cosmo **Purchasing → OSF** (do not open Items first).
4. **Expect**: refresh runs; assist list shows new priority and updated total stock (or clear ERP warning).

## 3. Top Priority + sales window (US2)

1. Default filter **Top Priority** — list emphasizes those SKUs.
2. SKU with last purchase 10 days ago and known sales S in that period → window starts on purchase date; sales ≈ S.
3. SKU with no purchase date → window = last 30 days.

## 4. Suggest → review → save (US3)

1. As Manager, note Suggested ROP = sales in window.
2. Accept 3 SKUs unchanged; edit 1 suggested value; Save.
3. **Expect**: only those 4 SKUs’ active ROP columns updated; others unchanged.
4. As Viewer, Save controls absent / 403 on PUT.

## 5. Generate after save (US4)

1. Download OSF.
2. **Expect**: accepted SKUs show new ROP values; stock still live at generate time.

## Done when

- [x] Open-page priority + stock refresh works without Items visit *(implemented — verify in ERP env)*
- [x] Top Priority default + all-items filter
- [x] Window + Option A suggestion correct on fixtures *(unit tests)*
- [x] Explicit save only; generate reflects saves *(generate already reads ProductOsfRop)*
- [x] Unit tests green
