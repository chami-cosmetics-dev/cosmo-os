# Quickstart: Vault Supplement Contact Import

**Feature**: `specs/062-vault-supplement-contacts`  
**Date**: 2026-10-06

Validation guide. Implementation steps belong in `tasks.md`.

## Prerequisites

- Branch `062-vault-supplement-contacts` (this plan did not create it).
- Migration for `AdaptPurchaseHistory.origin` created with `npm run db:migrate:create` and applied only to the database you are testing. `npm run db:deploy:all` waits for an explicit ask.
- Vault OS env (`.env.vault`) can read Supplement Vault ERP1 and ERP2.
- Cosmo OS env can read Cosmo orders and contact purchase history.
- A user with `contacts.master.manage` on each app you exercise.
- Do not point Vault upload at the Cosmo database.

## Automated checks

From the repo root, after the helpers exist:

```bash
npm test -- lib/vault-supplement-import
```

Cover at least:

- Header row missing `item_code` rejects the file with no classified data rows.
- Phone `0771234567` and `+94771234567` are one customer.
- Phone and email pointing at different contacts is rejected.
- Unknown item code is rejected; a known code is accepted.
- Two rows with the same `source_ref`, `invoice_no`, and `item_code` keep the later quantity.
- Invoice total equals the sum of line amounts, not a mixed cosmetics total.
- A second apply updates the matching line and does not add a line.
- A line omitted from the second apply remains.
- Blank `line_amount` becomes quantity times unit price.
- Draft builder drops cancelled and voided orders and drops item codes outside the supplied set.

`npm test` and lint on the touched files before a PR. No rider-app change.

## Staff path

1. **Vault OS**. Open **Supplement contact import**. Download the blank template. Confirm sheet `Purchases` has the 18 headers and one orange example row. Download item codes. Confirm sheet `ItemCodes` and header `item_code`.
2. **Cosmo OS**. Open the same page. Upload the item-code file. Download the draft. Confirm a mixed invoice contributes only codes that were in the item-code file, and a cancelled order is absent. Delete any row you do not want. Delete the template example if you paste the draft onto the template.
3. **Vault OS**. Upload the draft.
4. Confirm the on-page summary: accepted count, contacts created, contacts matched, lines added, lines updated, and a reason for each rejected row.
5. Open Contact Master for a new phone. One contact. Purchase history shows the supplement lines labeled **Supplement import**.
6. Open Customer Insight and search that phone. Invoices, items, and spend match those lines. The contact has no new merchant assignment.
7. Upload the same file again. Purchase line count stays the same. Summary shows updates, not a second set of lines.
8. **Cosmo OS**. Try the purchase upload. It is refused. **Vault OS**. Try the draft upload. It is refused.

## Failure checks

- Rename `item_code` in the header. Upload writes nothing and names the header problem.
- Stop or misconfigure ERP credentials. Item-code download and purchase upload fail without creating contacts.
- Row with no phone and no email appears in the reject list only.
