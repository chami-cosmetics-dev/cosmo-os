# Contract: Vault Supplement Contact Import

**Feature**: `specs/062-vault-supplement-contacts`  
**Date**: 2026-10-06

Staff UI and four HTTP actions. Shared parser and workbook writer live under `lib/vault-supplement-import/`. Permission for every action: `contacts.master.manage`. Company is the signed-in company.

`NEXT_PUBLIC_APP_NAME` gates the deployment:

| Action | Vault OS | Cosmo OS |
|--------|----------|----------|
| Blank template | yes | 409 |
| Item codes | yes | 409 |
| Upload purchases | yes | 409 |
| Draft from item codes | 409 | yes |

## Screens

`/dashboard/contacts/supplement-import`

- Sidebar link **Supplement contact import**, shown only with `contacts.master.manage`, next to the other Contacts links.
- Vault OS: download blank template, download item codes, upload `Purchases` file, show the result summary on the page.
- Cosmo OS: upload an item-code workbook, download the draft. No purchase upload.
- Busy state on the active button; peers disabled until the request finishes. Success and failure use the existing toast helper. The upload result summary stays on the page because it is a table of row errors, not a one-line toast.

## 1. Blank template

`GET /api/admin/contacts/supplement-import/template`

**Auth**: `contacts.master.manage`. Vault OS only.

**Response**: `200` `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`  
File name: `vault-supplement-contacts-template.xlsx`

| Sheet | Contents |
|-------|----------|
| `Purchases` | Row 1 is the 18 headers in spec order. Row 2 is the orange example from the spec (`line_amount` formula `=K2*L2`). No other data rows. |
| `Guide` | How to fill the file, including “delete the example row before upload”. Not read on import. |

**Errors**: `401` / `403`. `409` when the app is not Vault OS.

## 2. Item codes

`GET /api/admin/contacts/supplement-import/item-codes`

**Auth**: `contacts.master.manage`. Vault OS only.

**Response**: `200` spreadsheet. Sheet `ItemCodes`, header `item_code`, one code per row. Codes are the ERP1 + ERP2 stock-item set from `listVaultErpItemCodes`.

**Errors**: `401` / `403` / `409`. `502` when the ERP item list cannot be loaded. No partial file.

## 3. Upload purchases

`POST /api/admin/contacts/supplement-import`

**Auth**: `contacts.master.manage`. Vault OS only.

**Body**: `multipart/form-data` field `file` (`.xlsx`).

**Behavior**:

1. Read sheet `Purchases`. If the required headers are missing or renamed, **409** and write nothing.
2. Load the ERP item-code set. If that fails, **502** and write nothing.
3. Classify every data row. The orange example is a normal data row if staff leave it in the file.
4. Persist accepted rows as `ContactMaster` + `AdaptPurchaseHistory` (`origin = vault_supplement_import`).
5. Recompute purchase-summary cache for contacts this request created or matched.

**Response**: `200` JSON

```json
{
  "rowsRead": 0,
  "rowsAccepted": 0,
  "rowsRejected": 0,
  "contactsCreated": 0,
  "contactsMatched": 0,
  "purchaseLinesAdded": 0,
  "purchaseLinesUpdated": 0,
  "rejected": [
    { "rowNumber": 2, "reason": "Item code is not on the Supplement Vault ERP item list" }
  ]
}
```

`rowNumber` is the spreadsheet row (header is row 1).

**Row reject reasons** (stable phrases tests can assert):

| Reason | When |
|--------|------|
| `Phone or email is required` | Both blank |
| `Customer name is required` | |
| `Invoice number is required` | |
| `Invoice date must be YYYY-MM-DD` | |
| `Item code is required` | |
| `Item name is required` | |
| `Quantity must be greater than zero` | |
| `Unit price is required` | Missing or not a finite number |
| `Line amount must be a number` | Present but not finite |
| `Source reference is required` | |
| `Item code is not on the Supplement Vault ERP item list` | |
| `Phone and email match different contacts` | |
| `Phone matches more than one contact` | |
| `Email matches more than one contact` | |

A rejected row does not create a contact by itself. Other rows still import. Header failure and ERP failure do not import any row.

**Other errors**: `400` when `file` is missing or not an xlsx. `401` / `403`. `409` on the wrong app or a bad header row (`{ "error": "..." }`).

## 4. Draft

`POST /api/admin/contacts/supplement-import/draft`

**Auth**: `contacts.master.manage`. Cosmo OS only.

**Body**: `multipart/form-data` field `file`. Sheet `ItemCodes` or `Purchases` with header `item_code`. Extra columns ignored.

**Behavior**: Build a `Purchases` workbook of Cosmo lines whose item code is in that set. Same 18 headers as the template. No example row. Do not write Cosmo contacts, Cosmo orders, or ERP.

Include:

- Non-cancelled, non-voided order lines whose product SKU is in the set.
- Adapt history lines whose item code is in the set.

Exclude lines with neither phone nor email. Customer profile fields prefer the matched Contact Master row.

**Response**: `200` spreadsheet `vault-supplement-contacts-draft.xlsx`, sheet `Purchases` only.

**Errors**: `400` when the item-code header is missing or the file has zero codes. `401` / `403`. `409` when the app is not Cosmo OS.

## Workbook headers

Exact header text, `Purchases` row 1:

```text
customer_name, phone, email, address, city, district, invoice_no, invoice_date, item_code, item_name, quantity, unit_price, line_amount, currency, payment_method, location, merchant, source_ref
```

Item-code workbook header: `item_code`.

## Insight and contact history

No new Insight route. After upload, the existing Customer Insight phone search and `GET /api/admin/contacts/[id]/orders` return these invoices because they already read `AdaptPurchaseHistory`.

Additive display field on those invoice payloads:

| Field | Values |
|-------|--------|
| `origin` | `adapt` (default when the column is `adapt`) or `vault_supplement_import` |

When `origin` is `vault_supplement_import`, the visible secondary label is `Supplement import` and the status text uses the stored payment method (or `Imported` when payment is blank). Spend, items, and invoice amount follow the stored supplement lines. `assignedMerchant` on the contact is unchanged.
