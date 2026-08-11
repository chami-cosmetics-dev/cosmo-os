# Quickstart: Merchant Dashboard Motivation & Sales Tracking

**Feature**: `037-merchant-dashboard-motivation`  
**Date**: 2026-08-11

Validation guide after implementation. See [contracts/merchant-dashboard-motivation.md](./contracts/merchant-dashboard-motivation.md) and [data-model.md](./data-model.md).

## Prerequisites

- Cosmo OS running against a company DB with merchant-level role users, coupon/`assignedMerchantId` orders, and locations
- Merchant user with merchant-level role (or `dashboard.merchant_view`)
- Admin user who can switch merchants
- Optional: monthly targets already assigned for status checks

## Setup

```bash
npm install
npm run db:generate
# no migration expected for v1
npm run dev
```

## Manual checks

### 1. Today + MTD labels (US3)

1. Sign in as Merchant A
2. Open `/dashboard/merchant`
3. Confirm **Today** total/order count and **MTD** are both visible and distinctly labeled
4. With no orders today → Today shows `0` / `0 orders`, MTD still correct

### 2. Peer boards (US2)

1. As Merchant A, find Today and MTD peer sections
2. Confirm named peers with amounts; list is top 10 (+ self if outside)
3. Confirm own rank and gap-to-leader
4. As #1 → celebratory copy; behind leader → nudge (not shame)
5. Solo merchant company → solo-leader state

### 3. Location share (US1)

1. Merchant with multi-location MTD sales → location share for MTD shows self amount/% + compact peers
2. Toggle/tab to **Today** → location share updates for today
3. Admin switches to Merchant B → personal + location + peers follow B

### 4. Sales history (US4)

1. Daily history lists current month days through today with totals
2. Monthly history shows last 3 months; target fields when targets exist
3. Empty month/day → empty/zero state, not error

### 5. First viewport (US5)

1. On a phone-width viewport, confirm Today, MTD, target progress, and peer rank readable without hunting admin-only tools

### 6. Overview isolation (FR-011)

1. Open company Overview as admin → merchant-mix charts unchanged by this work
2. Merchant can complete checks 1–2 without opening Overview

### 7. Automated

```bash
npm test -- merchant-dashboard
# or targeted: peer-board / merchant-dashboard-history
```

## Expected outcomes

| Check | Pass criteria |
|-------|----------------|
| SC-001 | Today + MTD answerable from merchant page in &lt; 30s |
| SC-002 | MTD + Today ranks visible with named peer amounts |
| SC-003 | Spot-check day totals vs recomputed attribution |
| SC-004 | Spot-check month totals + target status |
| SC-006 | First viewport shows Today, MTD, target, peer rank on phone |

## Notes

- Attribution must match existing merchant MTD (coupon else assigned merchant)
- All calendars Asia/Colombo
