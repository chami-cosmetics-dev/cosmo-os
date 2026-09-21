# Feature Specification: VAT OSF Column Access & Shop Columns

**Feature Branch**: `058-vat-osf-column-access`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "now we have three OSF main, vat, others, we have built function to give access users what they can see (column) when they download OSF, now it match for main OSF vat OSF different file i want set access selection part for it also when other users download vat OSF what they can see columns, also in vat OSF rename it vat items OSF, also for vat OSF we only use cosmetics.lk and shops, other locations column no need for vat OSF, also when we create new shop ware house in erp1 for cosmetics it should create new column in OSF with related data that can get from erp(stock, items details like wise"

## Clarifications

### Session 2026-09-21

- Q: When VAT Items and Others get their own column Access, what should existing users start with? → A: Start empty for VAT Items and Others — restricted users get core identity only until marked for that variant (do not copy Main marks; do not share one mark set across variants).
- Q: Which ERP1 warehouses should auto-create a new OSF shop column? → A: Cosmetics ERP1 warehouse whose name matches existing shop-floor naming rules (contains “shop”; exclude website / transit / WIP / finished goods / “all warehouses”).
- Q: When a new shop column is auto-created, which OSF uses should it enable by default? → A: Auto-enable stock + ROP (and derived order columns) like existing Cosmetics shop columns; the new shop appears on all three OSFs (Main, VAT Items, Others) wherever shop columns are available — not VAT Items only. Stock/item data covers all items in that warehouse (catalog membership still follows each variant’s SKU rules).
- Q: Besides Cosmetics.lk + shop location columns, what non-location columns should VAT Items OSF include? → A: Same shared non-location columns as Main (pricing, margins, sales, etc.), plus Cosmetics.lk + shops only for locations; still filtered by per-user Access.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Per-user column access for VAT Items OSF (Priority: P1)

An assigner who already configures which columns each purchasing user may see on **Main OSF** can configure the same kind of column access for **VAT Items OSF** (and for the Non-VAT / Others OSF). Main, VAT Items, and Others remain separate download files; column marks for one variant do not silently apply to another unless the assigner sets them that way.

When a restricted user downloads VAT Items OSF, their file includes only the columns marked for them on that variant (plus always-included core identity columns). Users with unrestricted OSF access (manage / column-permission holders) still receive the full standard column set for that variant.

**Why this priority**: VAT Items OSF is a different workbook; without its own access selection, sensitive or irrelevant columns leak or buyers cannot be limited the same way as Main.

**Independent Test**: Mark User A for Cosmetics.lk stock + one shop column on VAT Items OSF only; leave User B unmarked for those; each downloads VAT Items OSF; only A sees the marked columns; Main OSF downloads still follow Main marks independently.

**Acceptance Scenarios**:

1. **Given** an assigner with OSF column-permission rights, **When** they open the OSF column-access UI, **Then** they can select or switch among Main OSF, VAT Items OSF, and Others (Non-VAT) OSF and mark columns per user for the selected variant.
2. **Given** User A has VAT Items columns X and Y marked and User B does not, **When** each downloads VAT Items OSF, **Then** only User A’s file includes X and Y (plus core identity); User B’s file omits them.
3. **Given** the same users have different Main vs VAT Items marks, **When** each downloads Main then VAT Items, **Then** each file honors that variant’s marks independently.
4. **Given** Access marks for VAT Items are saved, **When** an assignee next downloads VAT Items OSF, **Then** the file reflects the new set without a code deploy.
5. **Given** holders of OSF manage or column-permission roles, **When** they download VAT Items OSF, **Then** they receive the full standard VAT Items column set for that variant.
6. **Given** a restricted user who already has Main Access marks but none for VAT Items or Others, **When** per-variant Access is introduced, **Then** their VAT Items and Others downloads start with core identity only until an assigner marks columns for those variants (Main marks are not copied).

---

### User Story 2 - Rename VAT OSF to VAT Items OSF (Priority: P1)

Everywhere users choose or identify the VAT workbook (generate/download labels, filenames or sheet identity, and related UI copy), the product name is **VAT Items OSF** instead of “VAT OSF.” Behavior of the variant is unchanged by the rename alone.

**Why this priority**: Clear naming avoids confusing VAT workbook with unrelated VAT tax concepts; stakeholders asked for this label explicitly.

**Independent Test**: Open generate/download UI and inspect a downloaded file identity; label reads “VAT Items OSF” (or equivalent unambiguous wording); no remaining primary UI label still says only “VAT OSF” for this variant.

**Acceptance Scenarios**:

1. **Given** a user permitted to generate OSF, **When** they open the variant chooser, **Then** the VAT catalog option is labeled **VAT Items OSF**.
2. **Given** generation succeeds, **When** the file is downloaded, **Then** filename or sheet identity identifies **VAT Items OSF** (not ambiguous “VAT” alone if that could confuse).
3. **Given** column-access UI lists variants, **When** the assigner views options, **Then** the VAT variant appears as **VAT Items OSF**.

---

### User Story 3 - VAT Items OSF columns limited to Cosmetics.lk and shops (Priority: P1)

On **VAT Items OSF only**, location/company columns other than **Cosmetics.lk** and **Cosmetics.lk shops** do not appear. Stock, ROP, order qty, and related per-location fields for other companies/locations (e.g. LMJ, LWK, MNK, and other non–Cosmetics.lk OSF locations used on Main) are omitted from VAT Items OSF. **Shared non-location columns** (identity, pricing/cost, margins, sales units, and other non-location purchasing columns used on Main) **remain available** on VAT Items OSF, subject to per-user Access marks.

Main OSF and Others (Non-VAT) OSF keep their existing multi-location column layouts.

**Why this priority**: Stakeholders only replenish VAT items against Cosmetics.lk and shops; other location columns clutter and confuse VAT buying.

**Independent Test**: Generate VAT Items OSF and inspect headers: Cosmetics.lk and shop columns present; other company/location columns absent. Generate Main: other locations still present.

**Acceptance Scenarios**:

1. **Given** VAT Items OSF generation, **When** headers are inspected, **Then** Cosmetics.lk and shop-related location columns are present and other non–Cosmetics.lk location/company columns are absent.
2. **Given** the same catalog, **When** Main or Others OSF is generated, **Then** existing non–Cosmetics.lk location columns still appear as today.
3. **Given** a restricted user downloads VAT Items OSF, **When** Access marks are applied, **Then** assignable and delivered columns are drawn only from the VAT Items column set: shared non-location columns (same catalog as Main) plus Cosmetics.lk + shops — never other-location columns.
4. **Given** prior VAT-variant ROP rules (Cosmetics.lk ROP + shop ROPs; Total ROP = Cosmetics.lk ROP only), **When** VAT Items OSF is generated, **Then** those ROP rules remain in force alongside the narrowed location column set.
5. **Given** Main includes pricing, margin, or sales columns, **When** VAT Items OSF is generated for an unrestricted user, **Then** those same non-location column types are present (location set still Cosmetics.lk + shops only).

---

### User Story 4 - New Cosmetics shop warehouse in ERP1 becomes an OSF column (Priority: P2)

When a new **shop warehouse** is created in **ERP1** for Cosmetics — meaning a Cosmetics company warehouse whose name matches existing shop-floor naming rules (name contains “shop”; excludes website, transit, work-in-progress, finished goods, and “all warehouses”) — Cosmo OSF gains a matching **new shop column** (or column family: stock, ROP, order qty, and related shop fields consistent with existing shop columns). On the next OSF generate, that column is populated with data available from ERP for that warehouse (stock and item-related figures in the same pattern as existing shop columns).

The new column appears on **Main, VAT Items, and Others** wherever shop columns are already part of that variant’s layout (VAT Items still omits non–Cosmetics.lk locations; the new shop is included with Cosmetics.lk shops). Stock and related ERP fields reflect inventory for items present in that warehouse; which SKU rows appear still follows each variant’s catalog rules (full / VAT-only / non-VAT). Assignable Access lists include the new column name on each variant that exposes shop columns; restricted users do not see it until marked (fail closed).

**Why this priority**: Manual column setup for every new shop warehouse is error-prone; ERP is the source of truth for Cosmetics shops.

**Independent Test**: Introduce a new Cosmetics shop warehouse in ERP1 that meets shop-floor naming rules; after sync/recognition, generate Main, VAT Items, and Others; new shop column appears on each with stock (and related fields) aligned to ERP for items in that warehouse; Access list offers the new column unmarked by default for restricted users.

**Acceptance Scenarios**:

1. **Given** a new Cosmetics ERP1 warehouse whose name matches shop-floor naming rules (contains “shop”; not website/transit/WIP/finished goods/all warehouses), **When** OSF columns are refreshed/synced and OSF is generated, **Then** a new shop column set appears named consistently with that shop/warehouse, with stock and ROP (and derived order fields) enabled like existing Cosmetics shop columns.
2. **Given** ERP has stock (and other standard shop fields) for that warehouse, **When** Main, VAT Items, or Others OSF is generated, **Then** the new shop column appears on each variant that includes shop columns and shows ERP-aligned values for items in that warehouse (SKU rows still filtered by variant membership).
3. **Given** the new column exists, **When** an assigner opens column Access for a variant that includes shop columns, **Then** the new column name is available to mark; restricted downloaders without a mark do not receive it.
4. **Given** a Cosmetics warehouse that fails shop-floor naming rules (e.g. website, stores-only, transit) or a non-Cosmetics warehouse, **When** sync runs, **Then** it does not create an OSF shop column.
5. **Given** a shop warehouse is deactivated or removed from OSF scope in ERP, **When** columns are refreshed, **Then** the shop column stops appearing on new generates (historical marks for that column become inert / ignored safely).
6. **Given** the new shop column is auto-created, **When** an admin inspects column flags, **Then** stock and ROP participation are on by default (not inactive, not VAT-only).

---

### Edge Cases

- User has Main Access marks but none for VAT Items or Others: those variants start empty (core identity only for restricted users); Main marks are never copied or shared into VAT Items / Others.
- VAT Items Access marks reference a location column that no longer exists on VAT Items (other-location columns removed): marks for omitted columns are ignored; file never includes those columns.
- New shop column appears between Access edit sessions: existing unrestricted downloaders see it immediately; restricted users stay fail-closed until marked.
- ERP1 shop warehouse created but stock sync not yet available: column may appear with blank/missing stock per existing missing-stock behavior; ROP can still be set once the column exists.
- Duplicate or renamed warehouse in ERP: system must not create duplicate OSF shop columns for the same shop identity; rename updates label without orphaning ROP data when identity is stable.
- Others (Non-VAT) OSF: column access configurable like Main/VAT Items; location layout remains full (or existing Non-VAT layout), not the Cosmetics-only VAT Items restriction.
- Empty VAT Items catalog: generate still succeeds with clear empty/no-SKU outcome; Access UI still editable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow assigners with OSF column-permission rights to configure per-user downloadable columns separately for **Main OSF**, **VAT Items OSF**, and **Others (Non-VAT) OSF**.
- **FR-002**: When a user downloads a given OSF variant, the system MUST apply that variant’s column Access marks (with the existing unrestricted full-column exception for OSF manage / column-permission holders).
- **FR-003**: Core identity columns (SKU / barcode / product name or the project’s established core set) MUST remain in every permitted download for every variant.
- **FR-004**: Restricted users with no marks for a variant MUST receive core identity columns only for that variant (fail closed for non-core columns). When VAT Items and Others Access profiles are first introduced, they MUST start empty for all restricted users — existing Main marks MUST NOT be copied into those profiles and MUST NOT be reused as a shared mark set across variants.
- **FR-005**: Product UI and download identity MUST name the VAT variant **VAT Items OSF** (not merely “VAT OSF” as the primary label).
- **FR-006**: VAT Items OSF MUST include Cosmetics.lk and Cosmetics.lk shop location-related columns and MUST omit other company/location columns used on Main OSF. VAT Items OSF MUST still offer the same shared non-location column types as Main (pricing/cost, margins, sales units, and other non-location purchasing columns), subject to Access marks.
- **FR-007**: Main OSF and Others OSF MUST retain their existing multi-location column behavior; the location restriction in FR-006 applies only to VAT Items OSF.
- **FR-008**: VAT Items OSF MUST continue to use Cosmetics.lk ROP + shop-wise ROP with Total ROP equal to Cosmetics.lk ROP only (shop ROPs not summed into Total ROP), consistent with the VAT variants feature.
- **FR-009**: Column Access options offered for VAT Items OSF MUST be limited to columns that actually exist on VAT Items OSF (shared non-location columns plus Cosmetics.lk + shops — no assignable “ghost” other-location columns).
- **FR-010**: When a new Cosmetics company warehouse is created in ERP1 and its name matches shop-floor naming rules (contains “shop”; excludes website, transit, work-in-progress, finished goods, and “all warehouses”), the system MUST create the corresponding OSF shop column set with stock and ROP (and derived order fields) enabled by default, matching existing Cosmetics shop columns, and MUST surface that shop column on **Main, VAT Items, and Others** wherever shop columns are available (not VAT Items only). Generate MUST populate the column from ERP-sourced data for items in that warehouse; SKU row membership still follows each variant’s catalog rules.
- **FR-011**: Newly created shop columns MUST appear in Access lists for each variant that includes shop columns and MUST default to unmarked (hidden) for restricted downloaders until marked.
- **FR-012**: Non–Cosmetics warehouses and Cosmetics warehouses that fail shop-floor naming rules MUST NOT create OSF shop columns.
- **FR-013**: Column Access MUST never grant download rights; existing OSF download permissions still gate who may generate each variant.
- **FR-014**: Deactivated or out-of-scope shop warehouses MUST stop appearing as columns on subsequent generates without breaking other shops’ data.

### Key Entities

- **OSF variant**: Main | VAT Items | Others (Non-VAT) — separate workbook and separate column-access profile.
- **Variant column access**: Per Cosmo user, per variant, the set of non-core columns allowed on download.
- **VAT Items OSF column set**: Same shared non-location columns as Main, plus Cosmetics.lk and shop location columns only (no other company/location columns).
- **Cosmetics shop warehouse**: Cosmetics company ERP1 warehouse whose name matches shop-floor naming rules (contains “shop”; excludes website / transit / WIP / finished goods / “all warehouses”); source for an OSF shop column.
- **OSF shop column set**: Stock, ROP, order qty, and related fields for one shop, aligned with ERP warehouse data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An assigner can set different column Access for Main vs VAT Items for the same user in under 2 minutes without editing code.
- **SC-002**: In a spot-check of 10 restricted downloads of VAT Items OSF, 100% of files contain only marked + core columns (zero unmarked non-core columns).
- **SC-003**: 100% of primary generate/download labels for the VAT workbook use **VAT Items OSF** wording in the product UI under test.
- **SC-004**: Auditors reviewing a VAT Items OSF file find zero non–Cosmetics.lk location/company columns while Cosmetics.lk, configured shops, and expected shared non-location columns (for an unrestricted download) remain present.
- **SC-005**: After a qualifying new Cosmetics shop warehouse appears in ERP1, the next successful generate of Main, VAT Items, and Others each includes that shop’s column (where shops apply) with stock + ROP enabled and ERP-aligned stock for items in that warehouse (or documented missing-stock blank), without a manual column configuration step.
- **SC-006**: Restricted users do not receive a brand-new shop column until Access is marked; 100% fail-closed in a sample of unmarked downloaders.

## Assumptions

- Three OSF variants already exist (Main, VAT, Others/Non-VAT) from the VAT variants work; this feature extends access, naming, VAT column scope, and shop auto-columns.
- Existing Main OSF per-user Access UI and full-access exceptions (`purchasing.osf.manage` / column-permission) are the pattern to extend, not replace.
- “Others” means the Non-VAT OSF variant (catalog excluding VAT items).
- “Other locations” means non–Cosmetics.lk company/location OSF columns (e.g. other warehouses/companies already on Main), not Cosmetics.lk shops. Dropping other locations does not remove shared non-location columns (pricing, margins, sales, etc.) from VAT Items OSF.
- ERP1 is the system of record for Cosmetics shop warehouses; a warehouse auto-creates an OSF shop column when it is under Cosmetics and matches shop-floor naming rules (contains “shop”; exclude website / transit / WIP / finished goods / “all warehouses”). Detection may run on sync or at generate time as long as new shops appear without manual Cosmo column setup.
- Shop column data “from ERP” means the same stock and item/warehouse fields already used for existing Cosmetics shop columns on OSF; values cover items present in that warehouse, while each OSF variant still filters which SKU rows are listed.
- Auto-created shop columns default to stock + ROP enabled and appear on all three OSF variants where shop columns are available.
- Vault OSF remains out of scope.
- ROP import/template flows should include new shop ROP columns once those shops are active, consistent with existing shop ROP import behavior.
