# Quickstart: Returned Orders Dual ID + Waybill Single ID

## Prerequisites

- cosmo-dev (or vault) with Shopify-origin and ERP-origin orders that have both IDs stored where possible
- Access to Returned Orders and Waybill flows

## Automated

```bash
npm test
```

Cover: dual ref resolution for returns; source-primary single string for waybill; placeholders ignored.

## Returned orders UAT

1. Order with both IDs → list shows **Shopify on top**, **ERP below** (smaller).
2. Shopify-only / ERP-only → single line only.
3. Select dual-ID row → summary matches stacked layout.
4. Search by either ID → row found.

## Waybill UAT

1. Shopify-origin order with both IDs stored → waybill shows **Shopify number only**.
2. ERP-origin order → waybill shows **ERP SI only**.
3. Confirm **no** dual / joined IDs on waybill.

## Sign-off

- [ ] Returns dual when both exist  
- [ ] Returns search by either ID  
- [ ] Waybill Shopify → single Shopify ID  
- [ ] Waybill ERP → single SI  
- [ ] `npm test` green  
