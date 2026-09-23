# Feature Specification: Shopify Stock Showdown

**Feature Branch**: `059-shopify-stock-showdown`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "i want new dashboard with new permission, this is for checking shopify items stock showdown, in this dashboard by default show out of stock items also stock == 3 logic is this dashboard show all item stock <==3 and other locations in erp with stock they have also based on last 30 day sale suggestion we can transfer from this location to shopify, for this comparision we can use both erp locations and shops,"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open low-stock Shopify showdown list (Priority: P1)

An authorized inventory or purchasing user opens **Shopify Stock Showdown** and immediately sees every Shopify-tracked item whose **Shopify on-hand quantity is 3 or less** (including zero / out of stock). Each row shows the item identity (SKU, name) and the current Shopify stock so the team can prioritize replenishment without hunting through full catalogs.

**Why this priority**: Core job of the dashboard—surface Shopify risk items first. Zero-stock and near-zero (<=3) are the default working set.

**Independent Test**: With known items at Shopify stock 0, 3, and 4: only 0 and 3 appear on the default list; 4 does not. User without the new permission cannot open the page.

**Acceptance Scenarios**:

1. **Given** the user has the Shopify Stock Showdown permission, **When** they open the dashboard, **Then** they see the showdown list and navigation/entry points for it.
2. **Given** Shopify items with on-hand quantities 0, 1, 3, and 5, **When** the default view loads, **Then** only items with stock **<= 3** appear (0, 1, and 3).
3. **Given** an item with Shopify stock exactly 3, **When** the default view loads, **Then** that item is included (threshold is inclusive).
4. **Given** a user without the new permission, **When** they try to open the dashboard, **Then** access is denied and the entry is not offered in navigation.

---

### User Story 2 - See stock available at ERP locations and shops (Priority: P1)

For each low-stock Shopify item, the user sees **where else units exist**: other **ERP locations** and **shops** that currently hold stock for that same item. Quantities per location/shop are visible so the user knows which sites can donate stock to Shopify.

**Why this priority**: Showdown is useless without the comparison—knowing Shopify is low only helps if surplus elsewhere is visible.

**Independent Test**: Item A has Shopify stock 0, Shop X has 12, ERP warehouse Y has 5, Shop Z has 0. Row for A lists X and Y with quantities; Z is omitted or shown as zero consistently with the chosen empty-location rule.

**Acceptance Scenarios**:

1. **Given** a listed item has positive stock at one or more non-Shopify ERP locations or shops, **When** the row (or detail) is viewed, **Then** each of those sources with stock is named with its on-hand quantity.
2. **Given** the comparison includes both ERP locations and shops, **When** the user reviews an item, **Then** both types of sources appear in the same comparison (not only warehouses or only shops).
3. **Given** no other location or shop has stock for an item, **When** the row is viewed, **Then** the user sees a clear “no stock elsewhere” state (not a blank/confusing empty table).
4. **Given** the same physical place could be labeled both ways in source data, **When** stock is shown, **Then** the item’s available quantity is not double-counted across duplicate labels for the same place.

---

### User Story 3 - Get 30-day sales transfer suggestions to Shopify (Priority: P1)

For each low-stock Shopify item that has stock elsewhere, the system suggests **which location or shop to transfer from** and a **suggested quantity**, using **sales over the last 30 days** for that item toward Shopify demand. Suggestions help operators move stock to Shopify instead of guessing.

**Why this priority**: User’s stated decision aid—30-day sales drive transfer recommendations into Shopify.

**Independent Test**: Item sold 20 units in the last 30 days on Shopify, Shopify stock is 1, Shop A has 15 available. Suggestion names Shop A and a quantity that reflects covering recent demand without exceeding available stock at A.

**Acceptance Scenarios**:

1. **Given** an item on the showdown list with stock at least one other location/shop and positive last-30-day Shopify sales, **When** suggestions compute, **Then** the user sees one or more transfer suggestions naming source → Shopify, with a suggested quantity.
2. **Given** last-30-day Shopify sales for an item are zero, **When** suggestions compute, **Then** either no transfer quantity is suggested or the suggestion clearly states demand is zero (stock elsewhere may still be listed without a push recommendation).
3. **Given** suggested quantity would exceed available stock at a source, **When** the suggestion is shown, **Then** suggested quantity is capped at that source’s available quantity.
4. **Given** multiple sources have stock, **When** suggestions are ranked, **Then** sources that can meaningfully cover recent demand are preferred over empty or near-empty sites.
5. **Given** a suggestion is shown, **When** the user acts on it, **Then** the system does **not** auto-create a stock transfer—suggestion is advisory for human operational transfer.

---

### User Story 4 - Permission-gated access with admin assignment (Priority: P1)

Admins manage a **new dedicated permission** for Shopify Stock Showdown. Only users granted that permission see the dashboard and can load its data. The permission is independent of Cosmetics Stock Comparer, Item Trends, and Store Stock Count.

**Why this priority**: User explicitly required a new permission; wrong people must not see inventory transfer planning data.

**Independent Test**: Grant permission → page visible and loads. Revoke → denied. Confirm existing unrelated permissions alone do not grant access.

**Acceptance Scenarios**:

1. **Given** an admin managing roles, **When** they assign the new Shopify Stock Showdown permission, **Then** that role can open the dashboard.
2. **Given** a user has other inventory permissions but not this one, **When** they browse the app, **Then** they do not get access to Shopify Stock Showdown.
3. **Given** permission is removed from a user, **When** they next open the dashboard URL, **Then** they are denied.

---

### User Story 5 - Adjust focus within the low-stock set (Priority: P2)

Beyond the default (<=3 including OOS), the user can narrow or clarify the working set—for example focus on **out of stock only (0)** vs **all <=3**—so replenishment triage matches the day’s priority without leaving the dashboard.

**Why this priority**: Improves daily triage; default still covers the full <=3 rule if the user changes nothing.

**Independent Test**: Toggle to “out of stock only”; items with stock 1–3 disappear; toggle back to default; they return.

**Acceptance Scenarios**:

1. **Given** the default view (stock <= 3), **When** the user filters to out-of-stock only, **Then** only items with Shopify stock 0 remain.
2. **Given** a filter is applied, **When** the user clears it or returns to default, **Then** the full <=3 set is shown again.

---

### Edge Cases

- Item exists on Shopify but has no matching identity in ERP/shops: show in low-stock list with Shopify stock; comparison shows “no matched inventory elsewhere.”
- Item matched in ERP but Shopify stock unavailable/stale: show a clear data-unavailable state for Shopify stock rather than inventing zero.
- Negative or fractional stock values from a source: treat negatives as zero for “available to transfer” suggestions; do not recommend transferring negative stock.
- Multiple shops share the same item with different stock: list each shop source separately with its quantity.
- Last-30-day sales window with incomplete recent data: still compute on available sales in the window; if sales data cannot load, show stock comparison without transfer quantity and indicate suggestions unavailable.
- Very large catalogs: default list remains limited to <=3 Shopify stock so the working set stays operable.
- User selects a different Shopify destination shop (when more than one Shopify shop exists): list and suggestions recalculate for that destination’s stock and sales.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dedicated **Shopify Stock Showdown** dashboard reachable only by users with a **new** permission created for this feature.
- **FR-002**: By default, the dashboard MUST list Shopify items whose Shopify on-hand stock is **less than or equal to 3**, including out-of-stock (0).
- **FR-003**: Each listed item MUST display identity fields needed for operations (at minimum SKU and product name) and current Shopify on-hand quantity.
- **FR-004**: For each listed item, the system MUST show on-hand stock at **other ERP locations** and **shops** that hold the same item, for side-by-side comparison with Shopify.
- **FR-005**: Comparison MUST include **both** ERP locations and shops as stock sources (not only one category).
- **FR-006**: System MUST compute **transfer suggestions toward Shopify** using **last 30 days of sales** for the item (Shopify demand), naming suggested source location/shop and suggested quantity.
- **FR-007**: Suggested transfer quantity MUST NOT exceed available stock at the suggested source.
- **FR-008**: Transfer suggestions MUST be **advisory only** in this feature; the system MUST NOT execute warehouse/shop stock transfers automatically.
- **FR-009**: Users without the new permission MUST NOT see navigation to the dashboard or load its data.
- **FR-010**: System MUST present a clear empty/elsewhere-unavailable state when no other location or shop has stock for a listed item.
- **FR-011**: When more than one Shopify shop is in scope, the user MUST be able to choose which Shopify shop is the destination for stock threshold, comparison, and suggestions.
- **FR-012**: System MUST allow filtering the default working set to **out-of-stock only** without changing the default on first load (default remains <=3).

### Key Entities

- **Shopify showdown item**: A product tracked for Shopify replenishment; key attributes: identity (SKU/name), Shopify on-hand qty, last-30-day Shopify sales units.
- **Stock source (ERP location or shop)**: A non-destination place holding the same item; attributes: source type (ERP location vs shop), name, on-hand qty.
- **Transfer suggestion**: Recommended move from a stock source to the selected Shopify destination; attributes: source, destination, suggested qty, basis (last-30-day sales), advisory flag.
- **Showdown permission**: Dedicated access right controlling who may open and use the dashboard.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Authorized users can open the dashboard and see the default <=3 Shopify stock list in under **30 seconds** on a typical working catalog (including out-of-stock items).
- **SC-002**: For at least **95%** of listed items that have stock elsewhere, the comparison shows named ERP locations and/or shops with quantities (or an explicit “none elsewhere” state when truly none).
- **SC-003**: When last-30-day sales and source stock are available, **100%** of such items receive either a transfer suggestion or an explicit “no transfer needed / demand zero” message—never a silent blank.
- **SC-004**: Users without the new permission cannot open the dashboard (**0** unauthorized successful loads in access checks).
- **SC-005**: In a pilot with replenishment staff, **80%** report they can decide a source location for a low Shopify SKU from the showdown view without opening a separate stock report.
- **SC-006**: Suggested quantities never exceed source available stock in review sampling (**0** over-suggest cases).

## Assumptions

- “Stock == 3 logic” means inclusive threshold **stock <= 3** (0, 1, 2, and 3), matching the user’s “stock <==3” wording.
- Destination for replenishment is **Shopify** (selected Shopify shop when multiple exist); sources are **other ERP locations and retail shops**, not the destination itself.
- Last-30-day sales used for suggestions are **Shopify-channel sales** for that item (units sold into the Shopify destination), not company-wide retail sales, unless a later clarification expands the window definition.
- Suggested quantity defaults to covering the gap implied by recent demand: roughly **max(0, last-30-day Shopify units − current Shopify stock)**, split/capped across sources by available qty; exact ranking among sources prefers higher available stock when demand cannot be met from one site.
- This feature does **not** replace Cosmetics Stock Comparer, Item Trends outlet balance, or Store Stock Count; it is a Shopify-focused low-stock showdown with its own permission.
- Physical stock movement remains an offline/ERP operational process; this dashboard only recommends.
- Matching items across Shopify, ERP locations, and shops uses the organization’s existing SKU/item identity conventions.
- Default role assignment for the new permission is left to admins; no role receives it automatically beyond what admins configure after release.
