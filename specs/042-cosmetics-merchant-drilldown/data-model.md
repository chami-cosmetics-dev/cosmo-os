# Data Model: 042-cosmetics-merchant-drilldown

Derived read model. **No new Prisma models or fields.**

## Existing entities (reused)

### CompanyLocation
- `id`, `companyId`, `name`, `shortName`
- Cosmetics.lk = first location where `isCosmeticsLkLocationName(name)` or `isCosmeticsLkLocationName(shortName)` (`/cosmetics\.?\s*lk/i`)

### Order (eligible Cosmetics.lk rows only)
- `companyId`, `companyLocationId`
- `totalPrice`, `totalDiscounts`
- `sourceName` → channel (see below)
- `financialStatus`, `fulfillmentStatus`, `fulfillmentStage`, `deliveryOutcome`, `deliveryCompleteAt`, `invoiceCompleteAt` — eligibility (same as dashboard card)
- `discountCodes`, `rawPayload` — merchant coupons + promotional discount code
- `paymentGatewayPrimary` — payment type
- `assignedMerchantId` / `assignedMerchant` — attribution fallback

### OrderLineItem + ProductItem
- Line spend = `price * quantity`
- VAT line when `productItem.itemStatusCategory === "VAT_TOP_PRIORITY_BRAND"`
- Unlinked / other category → **Other items**

### User (sales merchant)
- Coupon map from users with `couponCodes` (same as `fetchDashboardSalesByLocationMerchant`)
- Display name via existing merchant match + `normalizeDashboardMerchantLabel`

## Derived entities

### Order channel

| Key | Label | Rule |
|-----|--------|------|
| `website` | Website | `sourceName` not ERP1 and not Manual |
| `erp1` | ERP1 | `erpnext`, `erpnext-pos`, `pos` |
| `manual` | Manual | `manual` |

Empty/`unknown`/`web`/`shopify` → Website.

### Bucket (location or per-merchant)

| Field | Meaning |
|-------|---------|
| `key` | Stable id (`website`, payment label slug, `vat`, coupon code lowercased, …) |
| `label` | Staff-facing text |
| `total` | Sum of attributed amounts (order `totalPrice` except VAT/other = line spend; discount = `totalDiscounts`) |
| `orderCount` | Orders contributing to the bucket (VAT: orders with ≥1 VAT line; Other: orders with ≥1 other line — one order may count in both) |

### Location summary

| Field | Meaning |
|-------|---------|
| `locationId` / `locationName` | Cosmetics.lk location |
| `period` | `{ fromYmd, toYmd }` + `dateType` echoed |
| `total` / `orderCount` | Eligible Cosmetics.lk `totalPrice` / orders — **must equal card headline** |
| `byChannel` | Website, ERP1, Manual (omit Manual if `orderCount === 0`) |
| `byPaymentType` | Payment labels; include Unspecified if used |
| `byVatItem` | `vat` / `other` line spend |
| `discountTotal` | Sum of `totalDiscounts` |
| `byDiscountCode` | Promotional codes only (`getOrderDiscountCouponCode`); optional at location level |

Channel amounts (shown channels) must sum to `total`. Payment-type amounts must sum to `total`. VAT+other need **not** equal `total`.

### Merchant row

| Field | Meaning |
|-------|---------|
| `merchantId` | User id or `null` |
| `merchantName` | Including **DM-General** for unassigned |
| `total` / `orderCount` | That merchant’s Cosmetics.lk eligible orders |
| `byChannel` | Same keys as location; merchant’s Website+ERP1+Manual (shown) = merchant `total` |
| `byPaymentType` | Full `totalPrice` per payment type |
| `byVatItem` | Line spend VAT vs other |
| `discountTotal` | Sum of that merchant’s `totalDiscounts` |
| `discountCodes` | `{ code, orderCount }[]` promotional codes on that merchant’s orders |

Omit merchants with `orderCount === 0`. Sort merchants by `total` desc, then name. Sum of merchant `total` = location `total`.

## Validation rules

1. Only orders with `companyLocationId` = Cosmetics.lk location.
2. Eligibility identical to card (`dateType` + paid/pending + voided out + POS rules on delivery filters).
3. One order counts toward exactly one merchant (after normalize).
4. One order counts toward exactly one channel and exactly one payment type.
5. Promotional discount codes exclude MER/DM tracking codes.
6. No persist / no backfill.

## State transitions

None. Read-only sheet: closed ↔ open (client). Filter change while open → refetch.

## Migration notes

None.
