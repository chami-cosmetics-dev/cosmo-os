# Research: Vault Supplement Contact Import

**Feature**: `specs/062-vault-supplement-contacts`  
**Date**: 2026-10-06

## 1. Where imported purchases live

**Decision**: Store each imported invoice as one `AdaptPurchaseHistory` row on the Vault OS company, with line items in the existing `lineItems` JSON. Add `origin` (`adapt` | `vault_supplement_import`, default `adapt`). Invoice identity is `adaptInvoiceKey = vsupp:{source_ref}|{invoice_no}`.

**Rationale**: Customer Insight already adds `AdaptPurchaseHistory` into lifetime spend, last purchase, monthly series, top items, and the invoice list (`lib/customer-insight/load.ts`, `invoices.ts`). Contact purchase history already returns those rows from `GET /api/admin/contacts/[id]/orders`. A new table would have to be threaded through those same readers. The unique key is already `(companyId, adaptInvoiceKey)`, which matches one invoice per source reference + invoice number. The `vsupp:` prefix cannot collide with Adapt invoice keys. `origin` stops the shared UI from labeling these rows “Adapt”.

**Alternatives considered**:

- New `SupplementPurchaseHistory` table. Cleaner name, but Insight, contact orders, item filters, and purchase-summary aggregates would all need a second reader. Rejected under constitution simplicity.
- Real `Order` rows. Spec and the Adapt import both forbid that. Orders drive fulfillment, ERP sync, and rider flow.
- ERPNext Customer create. Spec FR-018 forbids it. ERP is the item list only.

## 2. How Customer Insight sees the rows

**Decision**: Keep `UnifiedInvoiceSource` as `"adapt"` so existing history math keeps including these invoices. Pass `origin` into the invoice mapper and the contact purchase panels. Display label is **Supplement import** when `origin` is `vault_supplement_import`, and **Adapt** otherwise. Amounts stay in the lifetime total the same way other `AdaptPurchaseHistory` amounts already do (`includedInLoyaltyTotal: true`). Do not set `loyaltyAssignedTier`, `assignedMerchant`, reminders, or call-queue fields.

**Rationale**: Spec FR-020 requires Insight phone search to show imported invoices, items, and spend. Spec FR-010 forbids copying loyalty assignment and merchant allocation. The `merchant` column is `merchantKnownName` on the purchase row only.

**Alternatives considered**:

- New invoice source enum value. More UI switches, same numbers. Rejected.
- Leave the “Adapt” label. Merchants would misread Vault history. Rejected.

## 3. Item list used to accept a line

**Decision**: At item-code download and at upload, load the Supplement Vault ERP stock-item code set with the same rules as `syncVaultErpCatalogToProductItems` (ERP1 and ERP2 for the Vault company, stock items, skip disabled except force-included SKUs, skip `DELIVERY-CHARGES` and `TEST`). Add a read-only `listVaultErpItemCodes(companyId)` beside that sync. Do not write `ProductItem` as a side effect of validation. Match `item_code` by trimmed exact string.

**Rationale**: Spec FR-007 names the ERP item list, not the local product table. The catalog sync is already the definition of “supplement SKU” on Vault OS. One in-memory set per request covers a 5,000-row file. If ERP is unreachable, the upload fails with that reason and writes nothing.

**Alternatives considered**:

- `ProductItem.sku` only. Stale after new ERP items. Rejected as the acceptance check.
- Name match. Spec assumptions forbid it.

## 4. Cosmo draft without joining the two databases

**Decision**: Vault OS downloads an `item_code` workbook from its ERP. Cosmo OS accepts that workbook and returns the `Purchases` draft. No Vault database URL and no Vault ERP secret is read from the Cosmo deployment.

**Rationale**: Constitution II. Cosmo OS and Vault OS use different Neon databases and env files. A Cosmo request cannot see Vault contacts, and a Vault request cannot see Cosmo orders.

**Draft sources on Cosmo OS**:

- `Order` + `OrderLineItem` + `ProductItem.sku` where `cancelledAt` is null and `financialStatus` is not `voided`.
- `AdaptPurchaseHistory` line `itemCode` / `item_code` for the same company.
- Customer columns come from the linked `ContactMaster` when the order phone or email matches one contact; otherwise from the order’s customer name, phone, and email.
- Skip a line with neither phone nor email.
- `source_ref` is the Cosmo order id, or the existing `adaptInvoiceKey` for older history.
- `invoice_no` is the order number (else order name, else id) or `salesInvoiceNo`.
- `invoice_date` is the Colombo calendar date.

**Alternatives considered**:

- One CLI with both env files on a laptop. Works for an operator, but the spec asks staff to download the draft. The two-step workbook is the staff path. A CLI is not required for v1.
- Live call from Cosmo OS to Vault ERP. Copies credentials across tenants. Rejected.

## 5. Contact match and create

**Decision**: Reuse `normalizeContactPhone`, `normalizeContactEmail`, `buildPhoneLookupVariants`, and `findMatchingContacts`. Apply the spec rule in a pure helper: phone match first; email match second; if phone and email hit different contacts, or either hits more than one contact, reject the row. Create uses `source = "vault-supplement-import"`, `osRegistrationCreated = false`, and does not set allocation or loyalty fields. Fill empty profile fields only. Repeat phones in one file share one contact. After writes, recompute `purchaseOrderCount`, `purchaseTotalValue`, `purchaseLastOrderAt` for touched contacts via the existing purchase-summary helper, and move `lastPurchaseAt` forward when an imported invoice is newer.

**Rationale**: Phone variants already treat `077…`, `94…`, and `+94…` as the same number, which is what Insight search uses. The purchase-summary cache already includes `AdaptPurchaseHistory` (`lib/contacts/purchase-summary-export.ts`). Leaving it stale would show zero purchases on Contact Master until the company cron.

**Alternatives considered**:

- Full-company purchase-summary refresh after every upload. Too wide for a 5,000-row file.
- Import-only totals written over the cache. Would drop real Vault orders already on that contact. Rejected.

## 6. File shape and idempotency

**Decision**: Sheet `Purchases`, headers matched by name. Missing required header rejects the whole file before writes. Unknown columns and a `Guide` sheet are ignored. Within one file, the later row wins for the same `source_ref` + `invoice_no` + `item_code`. Re-upload merges that line into the invoice JSON and recomputes `ttlAmount` as the sum of stored supplement lines. Lines absent from the new file stay.

**Rationale**: Spec FR-003, FR-012, FR-015, and the edge case that a removed spreadsheet row must not delete history.

## 7. Who can run it

**Decision**: `contacts.master.manage` (same gate as email cleanup). Sidebar link only when that permission is held. Routes also check `NEXT_PUBLIC_APP_NAME`: Vault OS serves template, item codes, and upload; Cosmo OS serves the draft. The other app gets a clear refusal.

**Rationale**: No new permission. Insight search keeps its current permission and visibility rules.

## 8. Dates, money, batch size

**Decision**: `invoice_date` parses only as `YYYY-MM-DD` and is stored as that Colombo calendar day. Blank `currency` is `LKR`. Blank `line_amount` is `quantity * unit_price`; a provided `line_amount` is what counts toward the invoice total. Quantity must be a finite number greater than zero. Writes chunk around 200 invoices. Target is a result summary for 5,000 data rows within 5 minutes, dominated by contact matching and ERP list fetch, not by row count.

## 9. Agent context script

**Decision**: Skip. This repo has no `.specify/scripts/powershell/update-agent-context.ps1` (same as features 041–061). `plan.md`, this file, and `contracts/` are the context.

## 10. Git branch

**Decision**: Feature directory is `specs/062-vault-supplement-contacts`. `setup-plan.ps1 -Json` reported `BRANCH` empty and did not create a branch. Implementation should use branch `062-vault-supplement-contacts` when work starts. This plan command does not switch branches.
