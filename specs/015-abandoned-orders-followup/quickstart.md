# Quickstart: Abandoned Orders Follow-up

**Feature**: `015-abandoned-orders-followup`  
**Date**: 2026-07-21

Validation after implementation. See [contracts/abandoned-orders-followup.md](./contracts/abandoned-orders-followup.md) and [data-model.md](./data-model.md).

## Prerequisites

- Feature branch implemented (schema migration, sync lib, APIs, panel, sidebar, cron, RBAC)
- Env: `npm run env:use cosmo-dev`
- `SHOPIFY_ADMIN_ACCESS_TOKEN` set; at least one `CompanyLocation` with `shopifyAdminStoreHandle`
- Migration applied: `npm run db:migrate:create` → `npm run db:deploy:cosmo-dev`
- Users:
  - **Manager**: `abandoned_orders.read` + `abandoned_orders.manage`
  - **Viewer**: `abandoned_orders.read` only
  - **Denied**: no abandoned_orders permissions

## 1. Unit tests

```bash
#
# Unit tests for this feature are not included in this implementation pass.
#
```

**Expected** (manual): 7-day cutoff; close-without-response rejected; reopen allowed; recovery auto-close does not overwrite manual close.

## 2. Sync — page open

1. Sign in as Manager.
2. Open `/dashboard/orders/abandoned-orders`.

**Expected**:
- Sidebar shows **Abandoned Orders** under Order Management.
- List loads within 5s with `lastSyncedAt` visible.
- Rows show customer, cart summary, total, abandoned date.
- Only checkouts from last 7 days appear.

## 3. Follow-up — Pending → Follow up (no response)

1. Open a pending row; set status **Follow up**; leave customer response empty; save.

**Expected**: Save succeeds; row stays in default filter; response column empty.

## 4. Follow-up — Close with response

1. Set status **Closed**; choose **Purchased elsewhere**; add remark; save.

**Expected**: Row disappears from default filter (pending/follow_up only); appears when Closed filter enabled; data persists after refresh.

## 5. Close validation

1. Set status **Closed** without customer response; save.

**Expected**: 400 / error toast; row unchanged.

## 6. Reopen

1. On a Closed row, set status back to **Follow up**; save.

**Expected**: Row reappears in default active queue.

## 7. CSV export

1. Apply filter with ≥3 rows.
2. Click Export CSV.

**Expected**: File downloads with all filtered rows (not only current page); columns match contract.

## 8. Empty export

1. Filter to zero rows; export.

**Expected**: Clear error; no file.

## 9. Permission gates

1. As Viewer: list + export work; follow-up controls disabled/hidden; PATCH returns 403.

2. As Denied: sidebar link hidden; direct URL shows permission denied.

## 10. Recovery auto-detect (if test data available)

1. Complete a previously abandoned checkout in Shopify (or use fixture in sync test).
2. Trigger sync (reopen page after 30 min or run cron manually with `CRON_SECRET`).

**Expected**: Row auto-closed with **Recovered sale** (unless already manually closed with different response); excluded from default queue.

## 11. Cron (optional)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/abandoned-checkouts-sync"
```

**Expected**: JSON `ok: true`; `lastSyncedAt` updates for companies with Shopify handles.

## 12. Stale Shopify / missing token

1. Unset token on local env (or simulate API failure).

**Expected (Cosmo with Admin API)**: Page shows last DB data or empty state with `lastSyncError` message — not a silent empty list without explanation.

**Expected (Vault without Admin API)**: Sync does not crash. Message notes webhook mode. Rows appear only after Shopify `checkouts/*` webhooks are configured and fire.

## 13. Vault — checkout webhooks (manual Shopify setup)

After deploy, in Shopify Admin → **Settings → Notifications → Webhooks**, create:

| Event | URL |
|-------|-----|
| Checkouts create | `https://<vault-host>/api/webhooks/shopify/checkouts?location_id=<shopifyLocationId>` |
| Checkouts update | same URL |
| Checkouts delete | same URL |

- Format: **JSON**
- API version: match what you use for order webhooks
- Signing secret: same secret already stored under company Shopify webhook secrets in Vault OS
- `<shopifyLocationId>` = the Cosmo/Vault location’s `shopifyLocationId` (same query param pattern as order webhooks)

**Expected**: After a customer starts checkout and enters contact info, a row appears on Abandoned Orders; when they complete purchase, row closes as Recovered sale (via checkout update or order webhook).
