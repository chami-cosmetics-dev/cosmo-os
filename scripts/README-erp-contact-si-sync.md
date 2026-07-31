# ERP1/ERP2 Contacts → Contact Master + SI History

Cosmetics runbook for importing ERP customers into Contact Master and mapping Sales Invoice history via Cosmo Orders.

## What this does

1. **Live path:** ERP SI webhook upserts Orders **and** Contact Master (phone/email), stores `Order.erpnextCustomerId`.
2. **SI backfill:** Replay missing submitted SIs from ERP1 + ERP2 through the webhook.
3. **Customer enrich:** For ERP customers on existing Orders, pull Customer/Contact phones/emails into Contact Master and fill blank Order identifiers so contact → orders history links.

History on a contact is still matched by phone/email ([`app/api/admin/contacts/[id]/orders/route.ts`](../app/api/admin/contacts/[id]/orders/route.ts)).

## Deploy order (Cosmetics prod)

1. **Ship code + migrate**
   ```bash
   npm run db:deploy:cosmo-prod
   # deploy app (Vercel) so SI webhook includes contact sync + erpnextCustomerId
   ```

2. **Backfill missing Sales Invoices (ERP1 then ERP2)**
   ```bash
   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-si-orders.mjs --dry-run
   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-si-orders.mjs
   # optional filters:
   #   --slot=erp1 | --slot=erp2
   #   --since=2026-01-01
   #   --company="Chami Trading Lanka (Pvt) Ltd"
   ```

3. **Enrich Contact Master + blank Order phone/email**
   ```bash
   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-customer-contacts.mjs --dry-run
   node scripts/with-env.mjs cosmo-prod node scripts/backfill-erp-customer-contacts.mjs
   ```

4. **Spot-check**
   - Look up a known ERP customer phone in Contact Master
   - Open contact detail → orders; ERP SI rows should appear when phone/email match
   - Confirm new live SIs create/update Contact Master without running scripts

## Scripts

| Script | Purpose |
|--------|---------|
| [`scripts/backfill-erp-si-orders.mjs`](backfill-erp-si-orders.mjs) | Replay missing SIs from ERP1+ERP2 via webhook |
| [`scripts/backfill-erp-customer-contacts.mjs`](backfill-erp-customer-contacts.mjs) | Contact Master + Order identifier enrichment |
| [`scripts/backfill-chami-erp-orders.mjs`](backfill-chami-erp-orders.mjs) | Legacy ERP2/Chami-only SI replay (superseded by generalized script) |

Requires `APP_BASE_URL` for SI replay (e.g. `https://cosmo-os.vercel.app`).

## Notes

- Pure ERP Contacts with no Customer/SI are out of scope.
- Dual-ERP same person merges by existing phone/email conflict rules in `syncContactMaster`.
- `ContactMaster.source` is set to `erp1` / `erp2` when blank on create/enrich.
