# Quickstart: Material Transfer Counts and Shop Returns

**Feature**: `065-material-transfer-counts`  
**Date**: 2026-10-13

Validation guide. Do not deploy a database and do not post a live Stock Entry from this checklist unless the user has asked.

## Unit checks

From the repo root:

```powershell
npx vitest run lib/material-transfer/lines.test.ts lib/material-transfer/submit-review.test.ts lib/material-transfer/mismatch.test.ts lib/material-transfer/shop-return.test.ts
```

Expect:

- A send quantity above available is unchanged and reports over-available.
- A successful scan helper moves that item to the first line.
- Low-count marks only lines under main’s available quantity, and only when the source is a main warehouse.
- Mismatch is true only for `received` or `confirmed` when a line differs. An open `sent` or `requested` row with received 0 is not a mismatch.
- One outlet resolves to one shop warehouse and that company’s main warehouse. Zero or several matches do not return a pair.

Then lint the files you touched:

```powershell
npx eslint lib/material-transfer components/organisms/material-transfer-panel.tsx components/organisms/material-transfer-receive-panel.tsx components/organisms/material-transfer-history.tsx components/organisms/material-transfer-return-panel.tsx
```

## Migration

Create only. Do not deploy until the user confirms.

```powershell
npm run db:migrate:create
```

Name the migration for material-transfer counts (direction, statuses, nullable `erpName`, line counter).

## Staff UAT

Use a user with `store.material_transfer.write` and a user whose staff outlet matches one shop warehouse (Maharagama or the Cool Planet / MNK shop, if that alias is the one under test). Pick a source that has a known available quantity. Prefer a qty of 1 on a test item if a real post is approved.

### Store-to-shop send

1. Open `/dashboard/store/material-transfer`. Pick source main and a shop target.
2. Scan a real barcode. The line is first and highlighted. Scan a nonsense code. The error beep plays and the list does not grow.
3. Type the quantity up to available. That line has a green border. Type one more, or scan again. Quantity stays, beep plays.
4. Set one line below available and one line equal. Start submit. The dialog marks only the lower line. Cancel, then submit for real only if a books post is intended.
5. After a real send, history shows the barcode. The entry id opens the ERP Stock Entry in a new tab. The rest of the row opens the items.

### Shop receipt

1. As the outlet user, open `/dashboard/store/material-transfer/receive`.
2. Scan a barcode on the transfer. Received qty increases by 1, that line moves to the top.
3. Scan a barcode that is not on the transfer. Beep, no new line.
4. Type received qty to one less than sent, then mark received.
5. As stores, the row shows the barcode, the person who changed the line, and the person who marked it. The count no longer edits.
6. Turn on Mismatch. That transfer stays. A transfer received at the sent qty disappears until the filter is cleared.

### Shop-to-main

1. As the outlet user, on the receive page, the return panel shows only that shop warehouse → its main. No other warehouse choice.
2. Try a quantity above available. Beep, quantity unchanged. Send a quantity within available.
3. Confirm ERP has no new Material Transfer for it.
4. As the stores user, a reminder appears and opens the material-transfer page with that request.
5. Count a different qty than the shop sent and confirm, only if a books post is intended. One Stock Entry exists, for the stores qty, shop → main. The reminder for that request is gone.
6. The entry id now opens that document. The row opens the items. Mismatch shows the two quantities.
7. Confirm the same request again. No second document.

### Refusals

- Confirm a shop return with every qty 0. No document, request stays open, reminder stays.
- Confirm a qty the shop warehouse no longer has. No document, the message names the item.
