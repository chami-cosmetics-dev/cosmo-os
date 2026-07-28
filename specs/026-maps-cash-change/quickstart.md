# Quickstart: 026-maps-cash-change

Validate both user stories after implementation.

## Prerequisites

- Branch includes tender columns + mobile payment API validation (merge/rebase `main` if needed)
- DB migrated where you test (`customerGaveAmount` / `changeAmount` present)
- Rider app build or OTA with the feature; test device with and without a maps app if possible
- COD (or cash-line) delivery with a real street address and known amount due (e.g. 2500)

## 1. Maps — happy path

1. Open an open delivery with a full address.
2. Tap **Open map**.

**Expect**: Maps/browser/navigation opens for that address (no “Maps unavailable” only).

## 2. Maps — fallback

1. On a device/emulator where maps intents fail (or temporarily force failure in a test helper).
2. Tap **Open map**.

**Expect**: Clear message + **Copy address** (or equivalent); pasting yields the same address string shown on the delivery. Not only OK on a dead-end alert.

## 3. Maps — no address

1. Delivery with no usable address (or mock).
2. Tap Open map (or control disabled).

**Expect**: Explains navigation is not possible; no pretend success.

## 4. Cash change under total

1. Open payment for delivery due **2500** (cash).
2. Confirm amount due is visible.
3. Enter customer gave **5000**.

**Expect**: Balance / change shows **2500** immediately.
4. Confirm payment; open order in Cosmo OS.

**Expect**: Customer gave 5000 and change 2500 visible; `collectedAmount` remains amount due for cash reconciliation.

## 5. Insufficient tender

1. Due 2500, enter gave 2000, try confirm.

**Expect**: Blocked or non-dismissible warning; payment not recorded as successful full cash collection.

## Automated checks

```bash
npm test
npm run mobile:typecheck
```

Add/extend unit tests for: maps URL candidates / fallback branching (pure helpers), change = gave − cashDue, cashDue from split COD lines.
