# Stock snapshot

## GET /api/cron/erp-stock-snapshot

Auth: `Authorization: Bearer CRON_SECRET`  
Captures positive ERP bins for every company with ERP credentials. Deletes snapshots older than 90 days.

## POST /api/admin/purchasing/item-trends/stock-snapshot

Auth: `purchasing.osf.manage`  
Captures for the caller’s company. Returns `{ snapshotDate, capturedAt, rowCount }`.

## GET /api/admin/purchasing/item-trends/stock-snapshot

Auth: `purchasing.item_trends.read`  
Returns `{ snapshotDate, capturedAt } | { snapshotDate: null }`.
