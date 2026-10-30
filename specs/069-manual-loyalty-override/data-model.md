# Data model: Manual Loyalty Override

## ContactMaster (existing)

New field:

- `loyaltyAssignedReason` (string, nullable) — reason text when Gold/Platinum was set via manual override. Null for eligible assign and ERP inbound.

Existing fields reused: `loyaltyAssignedTier`, `loyaltyAssignedAt`, `loyaltyAssignedByUserId`, `loyaltyOutreachStatus`.

## LoyaltyReasonTemplate (new)

Reusable reason wording.

- `id`, `companyId`
- `label` — display text
- `normalizedLabel` — lowercase collapsed whitespace; unique per company
- `syncKey` — `seed:…` for shipped reasons; `custom:<uuid>` shared Cosmo↔Vault
- `osScope` — `both` | `cosmo` | `vault`
- `seeded` — true for the three shipped reasons

Unique: `(companyId, normalizedLabel)`, `(companyId, syncKey)`.

Seeded rows:

| label | osScope |
| --- | --- |
| Potential customer | both |
| Cosmetics loyalty customer | vault |
| Supplementvault loyalty customer | cosmo |

Custom rows always `osScope = both` and replicate to the other OS.

## Permission

- `contacts.loyalty.manual_assign` — Contacts group. Admins hold it via the admin catalog. Not granted to manager by default.
