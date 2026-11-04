# Research: Multi-SKU Company Availability

All Technical Context unknowns are resolved below. Each decision reuses existing code where it exists.

## R1. Which ERP and which warehouses

- **Decision**: Use the ERP2 instance resolved by `resolveTransferSlots(companyId).erp2` ([lib/material-transfer/erp.ts](../../lib/material-transfer/erp.ts)). Load its warehouses with `listTransferWarehouses(cfg)` and keep only rows where `isMainWarehouseName(name)` is true ([lib/material-transfer/warehouses.ts](../../lib/material-transfer/warehouses.ts)). Group the warehouses by their ERP `company` field. Each group is one "Company" in the spec.
- **Rationale**: The material-transfer feature already defines "ERP2 main warehouse" this way: the name contains "main" and excludes goods-in-transit and WIP. It is also the same set the merchant will transfer between, so the tab and the transfer screen agree. That makes it the "maintained list" the spec assumed.
- **Alternatives considered**: A new DB table of main warehouses per company. Rejected under Principle V: the name rule is already the source of truth, and a table would need a migration on three DBs.

## R2. What "available" means

- **Decision**: available = `max(0, actual_qty − reserved_qty)` from the ERP2 `Bin` doctype, for each (warehouse, item_code). A company's quantity for a SKU is the sum across its main warehouses. The UI also shows the per-warehouse breakdown.
- **Rationale**: The spec assumes "sellable, not gross". `reserved_qty` is stock already committed to submitted Sales Orders. Zero and negative results are treated as not available (spec edge case).
- **Alternatives considered**: `projected_qty`. Rejected because it adds ordered and planned quantities that are not physically on hand. `actual_qty` alone was also rejected: it overstates what is available when orders are reserved.
- **Note**: `fetchBinActualQty` in [lib/osf/erp-stock.ts](../../lib/osf/erp-stock.ts) only returns `actual_qty`. The feature makes one batched Bin call of its own with `["item_code","warehouse","actual_qty","reserved_qty"]` (same batching of 80 items), and does not widen the shared helper's return type, which OSF callers depend on.

## R3. SKU existence ("not found")

- **Decision**: One batched ERP2 `Item` list call filtered by `item_code in [...]`, case-insensitively matched with `skuKey()` from [lib/vat-status/types.ts](../../lib/vat-status/types.ts). Before the ERP call, typed SKUs are also matched to the local `ProductItem.sku` (case-insensitive), the same way `lookupSkuVatStatus` does it.
- **Rationale**: It reuses the VAT tab's matching rules, so a SKU found on VAT Status is found here too.

## R4. Cap metric: month-to-date invoiced sales per ERP2 company

- **Decision**: Read submitted (`docstatus = 1`) ERP2 `Sales Invoice` rows with `posting_date` from the 1st of the current month to today, using **Asia/Colombo** dates. Filter by `company in [main-warehouse companies]` and request the fields `company, net_total`. Sum `net_total` per company. Returns have negative `net_total`, so the sum is already net of returns and credit notes. Page through results the same way as `listSubmittedSalesInvoicesForRange` in [lib/daily-sales-sms-erp.ts](../../lib/daily-sales-sms-erp.ts) (200 rows per page).
- **Rationale**: This matches the spec clarification (calendar month, net of returns) and the "ERP day report" definition the daily-sales SMS already uses: net_total, excluding shipping.
- **Performance**: One month of invoices across all trading companies can be several thousand rows. If paging takes longer than about 2 s in practice, switch to one `frappe.client.get_list` call with `group_by: company` and `sum(net_total)`. That change stays inside the cap reader, so the contract does not change. Start with paging because it is proven in this codebase.
- **Alternatives considered**: ERP1 sales, or both ERPs. Rejected because the companies and warehouses being chosen between live in ERP2.

## R5. Order value (price)

- **Decision**: Use the local `ProductItem.price` for the matched SKU (company-scoped). The ERP Item Price webhook keeps it in sync with ERP "Standard Selling" ([lib/erp-item-price-sync.ts](../../lib/erp-item-price-sync.ts)). Order value = Σ requested qty × price. If a SKU has no price, the response flags it in `unpricedSkus` and marks the order value as a lower bound (spec edge case).
- **Rationale**: This is the price the order is invoiced at, and it needs no extra ERP call.
- **Alternatives considered**: A live ERP `Item Price` read. Rejected because it adds an ERP round-trip for a value that is already synced.

## R6. Configurable cap / option count without a code change

- **Decision**: Read the optional env vars `ORDER_AVAILABILITY_CAP_LKR` (default `5000000`) and `ORDER_AVAILABILITY_OPTION_COUNT` (default `3`), parsed and validated once per request. Invalid values fall back to the defaults. The near-cap warning is fixed at 10% of the cap.
- **Rationale**: The spec asks for "changeable without code change". Env vars avoid a schema migration (Principle I) and are set per deployment in Vercel. Both are used, so they are not flags under Principle V.
- **Alternatives considered**: A settings table and admin UI. Deferred until a second consumer needs it.

## R7. Request shape and where ranking runs

- **Decision**: One `POST /api/admin/products/order-availability` returns the full matrix: every company × every SKU × every main warehouse quantity, plus cap positions and the ranked options. The detail view (missing-item sources) is computed **client-side** from that matrix, with no second request.
- **Rationale**: There are at most 50 SKUs and about 10 companies, so the payload is small. Selecting a different option is instant and makes no extra ERP load. All ranking, classification and option picking lives in pure functions in `lib/order-availability/rank.ts` so it can be unit-tested with Vitest (Principle III).

## R8. Partial failure

- **Decision**: ERP2 failures are reported per stage. If the warehouse list or Bin read fails, the whole check fails with a 502 and a clear message, because there is no availability to rank. If only the cap read fails, availability is still returned, `cap.error` is set, and `options` is empty (spec: "no options offered" when cap cannot be checked).
- **Rationale**: Bin reads are batched by item across all warehouses in one call, so per-company partial availability cannot happen. The only realistic partial case is availability succeeding while the cap read fails.

## R9. Permission and placement

- **Decision**: Add a new permission, `products.order_availability.read`, registered in [lib/rbac.ts](../../lib/rbac.ts). Add the tab `order-availability` to [app/(dashboard)/dashboard/products/vat-status/page.tsx](../../app/(dashboard)/dashboard/products/vat-status/page.tsx) using the same conditional-tab pattern as Gift Vouchers. Include the new permission in the sidebar `canViewVatStatus` check in [components/organisms/app-sidebar.tsx](../../components/organisms/app-sidebar.tsx). The page-level permission gate accepts any of the three tab permissions.
