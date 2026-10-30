# Contracts: Manual Loyalty Override

## GET `/api/admin/customer-insight/loyalty-reason-templates`

Permission: `contacts.loyalty.manual_assign` (admins always).

Response: `{ templates: [{ id, label, seeded }] }`

Vault omits Supplementvault loyalty customer. Cosmo omits Cosmetics loyalty customer.

## POST `/api/admin/customer-insight/contact/:contactId/loyalty-override`

Permission: `contacts.loyalty.manual_assign`.

Body: `{ tier: "gold" | "platinum", reason: string }`

Succeeds only when spend does not already qualify for that tier and the contact does not already hold it. Pushes ERP + Shopify like eligible assign. Persists actor, reason, date.

## POST `/api/internal/loyalty-reason-templates`

Auth: `Authorization: Bearer <LOYALTY_REASON_SYNC_SECRET or CRON_SECRET>`.

Body: `{ label, syncKey }`. Upserts on the receiving OS company. Does not re-broadcast.
