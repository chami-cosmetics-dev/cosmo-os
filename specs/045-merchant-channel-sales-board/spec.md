# Feature Specification: Merchant Channel Sales Board

**Feature Branch**: `045-merchant-channel-sales-board`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "For admins: single page showing all merchants with merchant-wise sales (today, MTD, custom date range). Some merchants work at outlets (shop sales); some also have online sales even when working at an outlet. Show target, actual sale, and percentage. Page footer totals shop sales count/amount and online sales count/amount. Some merchants have separate shop and online targets. On the staff page, assign outlet to staff and mark user as shop merchant; shop merchants can still have online sales and online targets."

## Relationship to existing work *(do not override)*

This feature **extends** work already shipped or in progress. It must **add** channel depth; it must **not** replace, remove, or fork parallel admin experiences.

| Existing capability | Spec / code | What this feature adds | What must stay unchanged |
|---------------------|-------------|------------------------|---------------------------|
| **GM view** tab on Merchant Dashboard | Built on `/dashboard/merchant` (`gmPulse`, `gmAlerts`, merchant scorecard) | Shop/online columns, channel targets, footer shop/online totals | Team pulse, alerts, health score, calls, returns, queue, click-through to Merchant view |
| **Merchant Dashboard** (personal) | Spec 037 | Optional personal shop/online split on viewed merchant only (P3) | Today/MTD, peers, location share, target progress, history, loyalty, call queue |
| **Combined monthly target** | `MerchantMonthlyTarget.targetAmount` | Optional `shopTargetAmount` + `onlineTargetAmount` fields | Existing combined target, assignment UI, history audit — still works when channel targets not set |
| **GM scorecard overview** | `buildGmOverview` / `MerchantDashboardOverviewRow` | Extend row DTO + table with channel sales/targets | Existing MTD %, calls, interested %, health, pace columns |
| **Company Overview** | `/dashboard` | Nothing removed | Location, brand, delivery, company call chart |
| **Cosmetics.lk drill-down** | Spec 042 | Link only (optional); no duplicate website/ERP1 breakdown here | Full channel drill-down stays on Overview |
| **Staff location** | `EmployeeProfile.locationId` on staff page | `isShopMerchant` flag; outlet required when flag on | Finance scope, rider flag, coupon codes, invite location flow |
| **Book notes** | Spec 029 | Reuse same outlet = `CompanyLocation` meaning | Book note access rules unchanged |

**Placement (revised)**: Channel sales board lives **inside Merchant Dashboard → GM view** as an additional section (or sub-tab **Channel sales**), not a separate top-level page. One admin destination; GM morning flow stays on `/dashboard/merchant`.

## Clarifications

### Session 2026-08-29

- Q: Where should the admin board live? → A: **Extend GM view** on Merchant Dashboard (`/dashboard/merchant`). Do not create a competing all-merchant admin page.
- Q: How are shop vs online sales defined? → A: **Shop** = merchant-attributed orders at physical company locations (any `CompanyLocation` that is not Cosmetics.lk). **Online** = merchant-attributed orders at the Cosmetics.lk company location. Same attribution rules as Merchant Dashboard (`fetchMerchantCohortSales`, coupon / `assignedMerchantId`, DM split).
- Q: What does “shop merchant” mean on staff? → A: New boolean `isShopMerchant` on employee profile. When enabled, existing outlet (`EmployeeProfile.locationId`) is required. Does not block online sales or online targets.
- Q: Combined vs split targets? → A: **Additive**. Keep `targetAmount` (combined). Add optional `shopTargetAmount` and `onlineTargetAmount`. When channel targets are set, GM channel board uses them; combined target on personal dashboard and GM pulse may show sum of channel targets or fall back to `targetAmount` when channel targets are empty — never delete combined target behavior.

### Session 2026-08-29 (integration)

- Q: Does this replace GM scorecard? → A: **No.** Scorecard is extended with shop/online columns. Health, alerts, calls, returns remain.
- Q: Does this replace target assignment in GM view? → A: **No.** Existing target card extended with shop + online fields on same form.
- Q: Single page? → A: Yes — one GM view with pulse → alerts → **channel scorecard** → existing MTD chart → target assign. Scrollable single page, not a new route.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - GM view channel scorecard for all merchants (Priority: P1)

A GM opens **Merchant Dashboard → GM view** and sees the existing team pulse and alerts, then a **channel scorecard** table: every merchant-role user for the selected period (Today, MTD, or custom From–To). Each row shows shop sales (orders + amount), online sales (orders + amount), combined total, plus existing scorecard columns (calls, health, etc.) where already present.

**Why this priority**: Adds shop/online depth to the GM workflow already started — not a second admin home.

**Independent Test**: Open GM view with Today; channel columns appear below pulse; existing pulse KPIs and alerts still render; merchant row click still opens Merchant view.

**Acceptance Scenarios**:

1. **Given** GM view is open, **When** the page loads, **Then** existing pulse row (team today, team MTD, calls, alerts count) still appears unchanged above the channel table.
2. **Given** at least three merchants with sales in the period, **When** the channel scorecard loads, **Then** all three show shop amount/count, online amount/count, and total amount/count.
3. **Given** period **Today** or **MTD**, **When** figures load, **Then** date boundaries match existing Merchant Dashboard rules (Asia/Colombo).
4. **Given** admin sets custom From–To (reuse existing `fromDate`/`toDate` on merchant dashboard), **When** GM view reloads, **Then** channel actuals and existing scorecard date-scoped metrics use the same range.
5. **Given** admin clicks a merchant row, **When** navigation occurs, **Then** user lands on **Merchant view** tab for that merchant (existing behavior preserved).

---

### User Story 2 - Channel target vs actual with percentage (Priority: P1)

Channel scorecard rows show **shop** and **online** target, actual, and % when those monthly targets are set. Combined total actual = shop + online actual. Combined target = sum of set channel targets, or falls back to existing `targetAmount` when no channel targets exist.

**Why this priority**: Split targets are the business ask; must coexist with today's single combined target.

**Independent Test**: Merchant with only `targetAmount` set shows same total % as before; after adding shop/online targets, channel columns populate without breaking combined progress on personal dashboard.

**Acceptance Scenarios**:

1. **Given** Merchant A has only legacy `targetAmount` 1,000,000 LKR, **When** channel scorecard shows MTD, **Then** total target column uses 1,000,000 and shop/online target columns show — until channel targets are assigned.
2. **Given** shop target 500,000 and online target 300,000 are set, **When** MTD board loads, **Then** shop % and online % calculate independently; total target shows 800,000.
3. **Given** target is updated in existing **Assign monthly target** card, **When** shop/online fields are added to that card, **Then** one save updates all target fields; history audit records the change (extend existing history, not a new audit system).

---

### User Story 3 - Footer shop/online totals on GM view (Priority: P1)

Below the channel scorecard, GM sees **shop** order count + amount, **online** order count + amount, and **grand total** for the selected period. Optionally extend **gmPulse** with shop/online summary chips if space allows — footer row is required either way.

**Why this priority**: Answers “shop vs online today” without leaving GM view.

**Independent Test**: Footer sums equal sum of merchant rows; gmPulse `companyTodaySales` / `companyMtdSales` still match prior combined totals.

**Acceptance Scenarios**:

1. **Given** N merchant rows, **When** footer totals display, **Then** shop + online amounts sum to grand total and match row sums.
2. **Given** gmPulse shows team MTD, **When** channel footer loads, **Then** grand total amount equals `gmPulse.companyMtdSales` for MTD period (same attribution cohort).
3. **Given** unassigned attributed orders exist, **When** scorecard loads, **Then** an **Unassigned** row appears so footer reconciles.

---

### User Story 4 - Shop merchant flag on staff page (Priority: P2)

Staff edit gains **Shop merchant** toggle. When on, **Company location** (existing outlet dropdown) is required. Board and GM view show shop-merchant badge + outlet name. Online sales/targets remain allowed.

**Why this priority**: Formalizes outlet staff identity without replacing `locationId` already used by book notes (spec 029).

**Independent Test**: Enable shop merchant + DTD → GM channel row shows badge and DTD; book note access unchanged.

**Acceptance Scenarios**:

1. **Given** shop merchant enabled without location, **When** save attempted, **Then** validation blocks save (location field already on form — now required when flag on).
2. **Given** shop merchant with Cosmetics.lk orders, **When** channel scorecard loads, **Then** those orders appear under **online**, not shop.
3. **Given** `isShopMerchant` false, **When** location still set, **Then** outlet name may display but badge hidden.

---

### User Story 5 - Extend target assignment (not replace) (Priority: P2)

Existing **Assign monthly target** card in GM view gains optional **Shop target** and **Online target** (LKR) fields alongside current **Target amount (LKR)**. Admins may fill any combination. Personal Merchant Dashboard target card shows combined progress; may add shop/online progress lines when channel targets exist (P3).

**Acceptance Scenarios**:

1. **Given** admin saves shop + online targets only, **When** `targetAmount` was empty, **Then** combined target on personal dashboard derives from sum of channel targets OR shows channel breakdown — product copy must not show blank target if sum exists.
2. **Given** target history table, **When** channel targets change, **Then** history row reflects new fields (extend schema/history, keep existing columns).

---

### User Story 6 - Sort channel scorecard (Priority: P3)

Sort by shop amount, online amount, total, or channel % — in addition to existing scorecard sort options.

---

### User Story 7 - Personal dashboard channel hint (Priority: P3)

On **Merchant view** (not GM), viewed merchant sees compact **Shop MTD** / **Online MTD** KPI chips when they have sales in both channels — extends cosmetics.lk breakdown already on dashboard, does not remove location share or peer boards.

**Acceptance Scenarios**:

1. **Given** Merchant A opens their dashboard, **When** they have shop and online sales MTD, **Then** optional shop/online chips appear near Today/MTD cards.
2. **Given** Merchant A has only shop sales, **When** dashboard loads, **Then** online chip hidden or zero — peer board and target card unchanged.

---

### Edge Cases

- **No override**: Removing or hiding GM pulse, alerts, health scorecard, MTD bar chart, or target history is out of scope.
- **Data reuse**: Channel aggregation MUST use same loaders/helpers as `fetchMerchantCohortSales` + Cosmetics.lk location detection (`isCosmeticsLkLocationName`) — no second attribution engine.
- **DM merchants**: Channel split applies per merchant attributed bucket; DM-General rules unchanged.
- **ERP1 at Cosmetics.lk**: Counts as online location; website vs ERP1 sub-split remains spec 042 only.
- **Permissions**: Same as GM view today (`viewerIsAdmin` / `dashboard.merchant_view`); target edit uses `dashboard.merchant_targets.manage`.
- **API**: Extend existing `/api/admin/merchant-dashboard/page-data` and targets route — no parallel page-data endpoint unless payload size forces it (prefer one endpoint).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST add channel sales (shop/online/total) to **GM view** on Merchant Dashboard — not a separate competing admin route.
- **FR-002**: GM view MUST retain existing pulse, alerts, health scorecard, MTD chart, target assignment, and merchant drill-down.
- **FR-003**: Period selection MUST reuse Merchant Dashboard presets: Today, MTD, and existing `fromDate`/`toDate` range.
- **FR-004**: Shop/online classification MUST use Cosmetics.lk vs other `CompanyLocation` with existing merchant attribution rules.
- **FR-005**: Channel scorecard MUST show per merchant: shop count/amount, online count/amount, total count/amount, shop-merchant flag, assigned outlet name.
- **FR-006**: Channel targets MUST extend `MerchantMonthlyTarget` with optional `shopTargetAmount` and `onlineTargetAmount` without removing `targetAmount`.
- **FR-007**: Target assignment UI MUST extend existing GM view target card — not a duplicate form elsewhere.
- **FR-008**: Footer MUST show period shop/online/grand totals; grand total MUST reconcile with `gmPulse` combined sales for same period.
- **FR-009**: Staff edit MUST add `isShopMerchant`; require `locationId` when true.
- **FR-010**: `buildGmOverview` / overview row type MUST be extended — not replaced by a parallel overview system.
- **FR-011**: Target history audit MUST extend existing `MerchantMonthlyTargetHistory` pattern.
- **FR-012**: Merchants MUST keep personal Merchant Dashboard (spec 037) unchanged except optional P3 shop/online chips.
- **FR-013**: Company Overview and Cosmetics.lk drill-down (042) MUST remain as-is; optional link from channel row to Merchant view or 042 drill-down only.
- **FR-014**: Empty periods show zeros with clear copy.
- **FR-015**: Channel scorecard MUST support sort by shop, online, total, and channel %.

### Key Entities

- **Shop merchant flag** (`isShopMerchant`): Additive on employee profile; gates outlet requirement.
- **Channel monthly target**: Additive fields on existing monthly target record.
- **Channel sales snapshot**: Extend `MerchantDashboardOverviewRow` (or sibling DTO loaded in same `buildGmOverview` pass).
- **GM channel footer**: Shop/online/grand totals for selected period.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: GM answers shop vs online MTD from GM view in one scroll — no second page, no loss of alerts/scorecard.
- **SC-002**: After deploy, existing GM pulse and alert behavior passes regression checks (same merchants flagged, same team MTD).
- **SC-003**: Merchants with only legacy `targetAmount` see no regression on personal target %.
- **SC-004**: Footer shop + online = grand total; grand total = gmPulse MTD for same period.
- **SC-005**: 100% shop-merchant staff records have outlet on save.
- **SC-006**: Zero duplicate target-assignment forms in the product.

## Assumptions

- GM view work (pulse, alerts, scorecard, `gm-score.ts`, `merchant-dashboard-gm-overview.ts`) is the integration anchor.
- Channel aggregation runs in same page-data request as GM overview (extend `getMerchantDashboardPageData`).
- Combined `targetAmount` remains source of truth when channel targets unset; when both channel targets set, sum may sync or display as combined — implementation plan should pick one rule and document in plan.md.
- Book notes (029) continue using `locationId`; `isShopMerchant` is reporting/HR semantics on top.
- v1: no new sidebar item; GM view tab label may stay **GM view** with channel section titled **Channel sales**.

## Out of Scope (v1)

- Replacing or removing any existing GM view section.
- New top-level `/dashboard/merchant-channel` route (unless GM view tab UX testing fails — then plan phase may propose sub-tab only).
- Cosmetics.lk website vs ERP1 on channel board (042).
- Changing health-score formula to include channel pacing (future enhancement).
- CSV export.
- `Outlet` review model.

## Implementation notes for plan phase *(informational)*

Likely touch points (planning only — not binding implementation):

- `lib/page-data/merchant-dashboard-gm-overview.ts` — add channel sales + targets to overview build
- `lib/page-data/merchant-dashboard.ts` — extend page data DTO + `gmPulse` optional shop/online fields
- `merchant-dashboard-panel.tsx` — channel table + footer below existing scorecard
- `prisma/schema.prisma` — `isShopMerchant`, `shopTargetAmount`, `onlineTargetAmount`
- `staff-edit-form.tsx` — shop merchant toggle
- `app/api/admin/merchant-dashboard/targets/route.ts` — accept channel target fields
