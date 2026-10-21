# Quickstart: Merchant New Item Requests

**Feature**: `067-merchant-item-requests`  
**Date**: 2026-10-21

Validation guide. Implementation steps belong in `tasks.md`.

## Prerequisites

- Checkout includes this feature’s migration.
- Create the migration with `npm run db:migrate:create` when implementing. Apply it only to the database you were told to use. Do not deploy to production unless someone asked in that moment.
- `npm run db:generate` after the migration exists.
- Cloudinary configured (`CLOUDINARY_URL`).
- A **manage** user: role has `new_item_requests.manage` only.
- An **admin** user: role has `new_item_requests.admin` (manager/admin/super_admin also works).
- At least one `Vendor` in that company (an existing brand).
- A brand-priority spreadsheet with columns Brand and Priority.

## Unit checks

From the repo root:

```bash
npm test -- lib/new-item-requests
```

Expect these rules to pass:

- Normalize: `"  The   Ordinary "` → `"the ordinary"`.
- Vendor match (case-insensitive) → existing, stored name is the vendor’s name.
- No vendor → new, stored name is the trimmed typed name.
- Priority parse: brand + priority headers; blank rows skipped; last duplicate wins; zero usable rows is an error object, not an empty replace.
- Status: `open` → `already_have` / `closed` allowed. Same status idempotent. `already_have` → `closed` rejected.
- Suggest with `q` length 1 returns no hits.

Lint the files this feature changes. `npm test` for the repo suite before a PR. No mobile typecheck unless a shared type imported by the rider app changes.

## Staff UAT

Contracts: [merchant-item-requests.md](./contracts/merchant-item-requests.md). Fields: [data-model.md](./data-model.md).

1. Sign in as manage. Sidebar **Order Management** shows **New item requests**. Purchasing group does not.
2. Type two letters of an existing vendor. Suggestions include that brand and its priority after the file is uploaded (or null before). Pick it. Label **existing**. Description required. Submit with no link and no image. Row appears on **your** list as open.
3. Type a brand that is not a vendor. Label **new**. Add a valid https link and a small JPEG. Submit. Second own row.
4. Sign in as a second manage user. Their list does not include the first user’s rows. Opening the first user’s id returns not found.
5. Sign in as admin. Sidebar **Purchasing** shows **New item requests**. Brand dashboard: two brand rows, open counts 1 and 1, existing vs new, priority on the existing brand after upload.
6. Open the existing brand. See creator, date, description. Mark already have. Open count on that brand becomes 0 on the default view. The manage user still sees the row as already have.
7. Open the new-brand request. Mark closed. Same count behaviour. No SKU picker. No Item Creation button.
8. Filter already have / closed. History still opens with original fields.
9. Upload a priority file that sets the existing vendor to a known priority. Suggestion and dashboard show it. A vendor not on the file stays existing with no priority. A file with no usable rows is rejected and the previous list remains.
10. Export open (empty) still downloads a header-only xlsx. Export already have includes the marked row’s creator, brand, existing/new, priority, description, link, image URL, status.
11. A user with neither permission has no menu entry and the page shows permission denied.

## Out of scope for this check

- Creating an Item Creation ticket, ERP item, or Shopify product from this screen.
- Matching already-have to a SKU.
- Editing a request after submit.
- Notifications.
- Production database deploy.
