# Data Model: Returned Orders Dual ID + Waybill Single ID

## Overview

No new DB tables/columns. Display rules differ by surface.

## Order fields (read only)

| Field | Returned orders | Waybill |
|-------|-----------------|---------|
| `sourceName` | Helps resolve which refs are valid | Chooses primary ID |
| `name` / `orderNumber` | Shopify ref candidates | Shopify primary candidates |
| `shopifyOrderId` | Dual display + search | Shopify primary if origin Shopify |
| `erpnextInvoiceId` | Dual display + search | ERP primary if origin ERP |

## Returned order row

| Field | Role |
|-------|------|
| Dual display inputs | Shopify ref + ERP ref (when distinct) |
| `invoiceNo` | Optional primary/export string |
| Search | Match either stored reference |

## Waybill reference

Single string: source-primary ID only.

## Rules

1. Returned orders: show both when distinct (Shopify top, ERP below); one when only one exists; never empty second line.
2. Waybill: never dual; ERP origin → SI; Shopify origin → Shopify order number.
3. Placeholders (`pending`, `pending_approval`) are not valid ERP display IDs.
