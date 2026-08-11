# Contract: Merchant Dashboard Motivation (page-data extension)

**Feature**: `037-merchant-dashboard-motivation`  
**Base path**: `/api/admin/merchant-dashboard`  
**Auth**: Session + (`canAccessMerchantDashboard(roleNames)` OR `dashboard.merchant_view`)  
**Mutations**: None for this feature slice (targets/birthday-wish routes unchanged)

---

## GET `/api/admin/merchant-dashboard/page-data`

Existing endpoint. Response gains motivation fields below. Query params unchanged.

### Query

| Param | Required | Rules |
|-------|----------|--------|
| `merchantUserId` | admin only | `cuid`; ignored for non-admin (forced to self) |
| `yearMonth` | no | `yyyy-mm`; default current Colombo month |

### Success `200` — additive fields

Existing fields (`sales` MTD, `target`, `overview`, customers, birthdays, …) remain. Add:

```json
{
  "today": {
    "ymd": "2026-08-11",
    "total": 125000,
    "orderCount": 4
  },
  "peerBoards": {
    "today": {
      "period": "today",
      "fromYmd": "2026-08-11",
      "toYmd": "2026-08-11",
      "viewedRank": 3,
      "viewedTotal": 125000,
      "leaderTotal": 210000,
      "gapToLeader": 85000,
      "peerBand": "chasing",
      "cheerMessage": "…",
      "entries": [
        {
          "rank": 1,
          "merchantId": "clxxx",
          "displayName": "Ada",
          "total": 210000,
          "orderCount": 7,
          "isViewed": false
        }
      ]
    },
    "mtd": {
      "period": "mtd",
      "fromYmd": "2026-08-01",
      "toYmd": "2026-08-11",
      "viewedRank": 2,
      "viewedTotal": 980000,
      "leaderTotal": 1200000,
      "gapToLeader": 220000,
      "peerBand": "chasing",
      "cheerMessage": "…",
      "entries": []
    }
  },
  "locationShare": {
    "today": [
      {
        "locationId": "clloc",
        "locationName": "Colombo",
        "locationTotal": 500000,
        "selfAmount": 125000,
        "selfOrderCount": 4,
        "selfSharePct": 25,
        "peers": [
          {
            "merchantId": "clpeer",
            "displayName": "Bea",
            "total": 200000,
            "orderCount": 5,
            "sharePct": 40
          }
        ]
      }
    ],
    "mtd": []
  },
  "salesHistory": {
    "daily": [
      { "ymd": "2026-08-01", "total": 0, "orderCount": 0 },
      { "ymd": "2026-08-11", "total": 125000, "orderCount": 4 }
    ],
    "monthly": [
      {
        "yearMonth": "2026-06",
        "total": 2100000,
        "orderCount": 80,
        "targetAmount": 2500000,
        "percent": 84,
        "status": "missed"
      },
      {
        "yearMonth": "2026-07",
        "total": 2600000,
        "orderCount": 90,
        "targetAmount": 2500000,
        "percent": 104,
        "status": "achieved"
      },
      {
        "yearMonth": "2026-08",
        "total": 980000,
        "orderCount": 40,
        "targetAmount": 2500000,
        "percent": 39.2,
        "status": "on_track"
      }
    ]
  }
}
```

### Peer board rules

- `entries` = top **10** by `total` desc for the period, **plus** viewed merchant if not already included.
- `rank` is against the **full** merchant cohort, not the truncated list.
- Zero-sales merchants remain in rank calculation; may appear only if viewed.

### Location share rules

- Include locations where viewed merchant `selfAmount > 0` for that period.
- `peers` are compact (implementation cap documented in code; suggested ≤ 8), exclude self.
- `selfSharePct` / `sharePct` = percent of `locationTotal` (null if locationTotal is 0).

### History rules

- `daily`: Colombo days from current month `01` through `today.ymd` inclusive.
- `monthly`: exactly the last 3 calendar months ending at current `yearMonth` (or selected month context if admin browses history month — **v1 default**: relative to **current** Colombo month even if `yearMonth` query changes MTD card; if `yearMonth` is used for MTD browse, monthly history still anchors to **real today** for “last 3 months” unless implementer documents otherwise — **preferred**: history always relative to **today**, while `yearMonth` only affects MTD/target card).

### Errors

| Status | When |
|--------|------|
| 401 | Not authenticated |
| 403 | No merchant dashboard access / non-merchant without admin |
| 400 | Invalid query |
| 404 | No company / no merchants (admin) |

### Non-goals

- No change to company Overview APIs
- No CSV export of history
- No separate peer/history routes in v1

---

## Unchanged related routes

| Route | Notes |
|-------|--------|
| `PUT /api/admin/merchant-dashboard/targets` | Still admin/target-manage only |
| `POST /api/admin/merchant-dashboard/birthday-wish` | Unchanged |
