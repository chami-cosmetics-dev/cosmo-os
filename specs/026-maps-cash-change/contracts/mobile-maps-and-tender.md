# Contracts: 026-maps-cash-change

## 1. Mobile — Open map / directions

**Surface**: Rider delivery detail → Open map control  
**Helper**: `openDirections(address: string)` (and related contact utils)

### Behavior contract

| Input | Result |
|-------|--------|
| Empty / `"No address"` | Alert: no valid address; no clipboard required |
| Valid address, maps opens | External maps/nav or browser maps for destination; no error alert |
| Valid address, all open attempts fail | Alert explaining maps could not open, with **Copy address** action that copies full address text; optional dismiss |
| Copy succeeds | Rider can paste into any maps app |

### Non-goals
- In-app map renderer
- Guaranteed Google Maps package presence

---

## 2. Mobile — Payment tender UI + API

Extends existing `POST /api/mobile/v1/deliveries/{id}/payment` (same rules as 025 tender contract).

### UI contract (payment panel)

Near / under displayed **amount due** (order total / cash due):

| Control | Behavior |
|---------|----------|
| Amount due (read-only) | Existing expected/cash due for collection |
| Customer gave (input) | Numeric; shown when cashDue &gt; 0 |
| Change / balance (read-only) | Live: `customerGave − cashDue` when gave is valid; hide or “—” if gave empty/invalid |
| Confirm payment | Blocked if cashDue &gt; 0 and (gave missing or gave &lt; cashDue) |

Example: due **2500**, gave **5000** → show balance **2500**.

### API body (additions — if not already on branch)

| Field | Type | Rules |
|-------|------|--------|
| `customerGaveAmount` | number | Required when cashDue &gt; 0; ≥ cashDue |
| `changeAmount` | number | Optional client hint; server recomputes |

### Response `payment` fragment

```json
{
  "collectedAmount": "2500.00",
  "customerGaveAmount": "5000.00",
  "changeAmount": "2500.00",
  "paymentMethod": "cod",
  "lines": []
}
```

### Cosmo OS display

Authorized staff viewing the order/delivery payment MUST see customer gave and change when present (fulfillment/order detail — ensure wired if missing on branch).
