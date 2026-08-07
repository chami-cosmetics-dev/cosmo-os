# Quickstart: Customer Insight Allocation & Loyalty

**Feature**: `033-insight-allocation-loyalty`  
**Purpose**: Validate end-to-end after implementation (not a substitute for unit tests).

## Prerequisites

- Local Cosmo OS running with seed/dev company data
- Users: Merchant A, Merchant B, Admin (or super_admin)
- Contacts: one allocated to A, one unallocated, one with DOB in current month
- Orders/Adapt history with lifetime totals spanning &lt;75k, 75–200k, ≥200k
- At least one ProductItem with Vendor.name usable as brand

## Setup

```powershell
npm install
npm run dev
```

Optional unit focus:

```powershell
npx vitest run lib/customer-insight
```

## Scenarios

### 1. Visibility (US1)

1. As Merchant B, search exact phone of contact allocated to A.
2. Expect: lifetime total, invoice **headers only**, allocated merchant label; **no** profile card, progress bar, contacted, top items, spend series, line items.
3. As Merchant A (or Admin), same phone → full owner UI.

### 2. Profile edit (US2)

1. As allocated merchant, edit name/email/phone/DOB → save → reload → values persist.
2. As non-owner, no edit control; PATCH returns 403.

### 3. Loyalty + progress bar (US3)

1. Confirm thresholds: Gold ≥ 75,000; Platinum ≥ 200,000.
2. Owner view shows progress bar with current total amount (not % as primary).
3. Limited view has no progress bar.

### 4. Filters (US4)

1. As Merchant A, open filters → Push to Gold → only A’s allocated contacts with 75k–200k, highest total first.
2. Push to Platinum → ≥ 200k only.
3. Birthday this month → birthMonth matches current month.
4. Brand filter → only purchasers of that Vendor.name.
5. Merchant B never sees A’s allocated list.

### 5. Auto / manual allocation (US6)

1. Unallocated contact + purchase assigned to Merchant A → `assignedMerchant` becomes A’s display label.
2. User with `contacts.allocation.manage` reassigns one contact and bulk-transfers A → B.
3. User without permission → 403.

### 6. Contacted (US7)

1. As owner, Mark Contacted → `lastContactedAt` updates; mark again → updates again.
2. Call Center / allocation performance dashboard reflects Contacted category for that merchant.
3. Non-owner: no button; POST 403.

## Expected contracts

See [contracts/insight-allocation-loyalty.md](./contracts/insight-allocation-loyalty.md).  
Data rules: [data-model.md](./data-model.md).
