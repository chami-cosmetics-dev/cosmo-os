# Contracts: Merchant Dash Call Center & Date Range

**Feature**: `039-insight-loyalty-contact-flow`

---

## Main dashboard graphs

Existing Overview `fromDate` / `toDate` (+ `dateType`) unchanged. Call Center chart already consumes the same range via allocation performance API.

**Requirement**: Keep working; no contract break. Optional: ensure Audit not required for read-only range changes.

---

## Merchant dashboard date range

**GET** `/api/admin/merchant-dashboard/page-data`

| Param | Required | Notes |
|-------|----------|--------|
| `yearMonth` | existing | Month context for MTD/peers if retained |
| `fromDate` | optional | `YYYY-MM-DD` Colombo |
| `toDate` | optional | Inclusive end day |
| `showCustomerLists` | optional | Default `false` |

When `fromDate`/`toDate` set, ranged sections (call-center performance, sales history charts that are period-based) use that window. Peer MTD boards may remain calendar-month unless implement chooses to drive them from range (document in tasks if split).

---

## Call Center Performance — merchant scope

Reuse **GET** `/api/admin/contacts/allocation/performance`

| Param | Notes |
|-------|--------|
| `from` / `to` | Existing day bounds |
| `merchantId` or implicit self | When called from merchant dash, force viewed merchant; admins using switcher pass selected merchant |

**Response**: Same series/category shape as main dashboard chart; merchant panel renders `CallCenterPerformanceChart` with that data.

**Permission**: Caller must have merchant dashboard access for that merchant (or allocation/performance permission used by main chart — prefer `requireAnyPermission` consistent with performance route today + merchant_view).

---

## Opt-in customer list cards

When `showCustomerLists !== true`, page-data **omits** or returns empty `dailyTopCustomers` / `lifetimeTopCustomers` and UI hides cards. When true, existing payloads populate as today.
