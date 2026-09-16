# Feature Specification: OSF VAT Variants

**Feature Branch**: `056-osf-vat-variants`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "OSF in cosmo os we have to maintain three seperate OSF one for main OSF, one for vat items only, one for others without vat items, also in vat items OSF we update cosmetics.lk ROP and also add shop wise ROP s, for the total ROP should cosmetics.lk ROP we are not plus shop wise ROP to it, for vat OSF we only need cosmetcis.lk ROP column and shop wise ROP columns only other company wise ROP column we can remove for vat OSF."

## Clarifications

### Session 2026-09-16

- Q: VAT item membership for VAT OSF → A (revised): ERP **Product Priority** = **Vat** (synced into Cosmo from Cosmetics.lk ERP Item Manufacturing field). Not Cosmo product-status `VAT_TOP_PRIORITY_BRAND`. A SKU is VAT when ERP1 and/or ERP2 Product Priority is `Vat` (same match style as today’s OSF ERP Product Priority filter).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate one of three OSF workbooks (Priority: P1)

A purchasing user opens OSF generation and chooses among three separate workbooks:

1. **Main OSF** — full catalog (current overall OSF).
2. **VAT OSF** — only VAT items.
3. **Non-VAT OSF** — catalog excluding VAT items.

Each choice downloads its own workbook so buyers can work VAT and non-VAT replenishment separately without filtering by hand.

**Why this priority**: Three maintained OSFs are the core ask; without a clear choice, VAT and non-VAT buying stay mixed in one file.

**Independent Test**: With a catalog that has both VAT and non-VAT SKUs, generate each variant and confirm SKU membership matches the variant rules; Main includes both.

**Acceptance Scenarios**:

1. **Given** a user permitted to generate OSF, **When** they open generate, **Then** they can choose Main OSF, VAT OSF, or Non-VAT OSF.
2. **Given** SKUs marked as VAT and SKUs that are not, **When** they generate VAT OSF, **Then** only VAT SKUs appear.
3. **Given** the same catalog, **When** they generate Non-VAT OSF, **Then** VAT SKUs are absent and non-VAT SKUs remain.
4. **Given** the same catalog, **When** they generate Main OSF, **Then** both VAT and non-VAT SKUs appear (subject to existing reorder / threshold filters that already apply to Main).
5. **Given** generation succeeds, **When** the file is downloaded, **Then** the filename or sheet identity makes the variant unambiguous (Main vs VAT vs Non-VAT).

---

### User Story 2 - VAT OSF ROP columns and Total ROP (Priority: P1)

On **VAT OSF only**, ROP layout differs from Main / Non-VAT:

- Buyers maintain and see **Cosmetics.lk ROP**.
- Buyers also maintain and see **shop-wise ROP** columns (one per shop that participates in VAT replenishment).
- **Total ROP equals Cosmetics.lk ROP only** — shop-wise ROP values are **not** added into Total ROP.
- **Other company-wise ROP columns** (non–Cosmetics.lk company / channel ROP columns used on Main OSF) **do not appear** on VAT OSF.

Shop-wise ROP columns remain visible for planning; they simply do not feed Total ROP.

**Why this priority**: Wrong Total ROP would drive wrong reorder %, thresholds, and buy qty for VAT items.

**Independent Test**: For a VAT SKU with Cosmetics.lk ROP = 100 and shop ROPs 10 + 20 + 30, VAT workbook Total ROP = 100 (not 160); shop ROP columns still show 10/20/30; no other company ROP headers appear.

**Acceptance Scenarios**:

1. **Given** VAT OSF generation, **When** the workbook headers are inspected, **Then** ROP columns present are Cosmetics.lk ROP and shop-wise ROP columns only (no other company-wise ROP columns).
2. **Given** a VAT SKU with Cosmetics.lk ROP set and one or more shop ROPs set, **When** VAT OSF is generated, **Then** Total ROP equals the Cosmetics.lk ROP value only.
3. **Given** Cosmetics.lk ROP is blank/missing and shop ROPs exist, **When** VAT OSF is generated, **Then** Total ROP is blank/zero per existing “missing ROP” rules (shop ROPs still show; they do not become Total ROP).
4. **Given** purchasing updates Cosmetics.lk ROP and/or shop-wise ROPs through the existing ROP maintenance / import flows, **When** VAT OSF is regenerated, **Then** those updated values appear in the matching columns.
5. **Given** Main or Non-VAT OSF, **When** generated, **Then** Total ROP continues to follow the existing Main rule (sum of included company/location ROP columns as today) — VAT-only Total ROP exception does not apply.

---

### User Story 3 - Maintain Cosmetics.lk and shop ROPs for VAT items (Priority: P2)

Purchasing can set and revise Cosmetics.lk ROP and each shop’s ROP for VAT items so VAT OSF stays current without relying on other companies’ ROP columns.

**Why this priority**: VAT OSF depends on those ROP values; without a clear maintenance path, the workbook is incomplete.

**Independent Test**: Set Cosmetics.lk ROP and at least one shop ROP for a VAT SKU; regenerate VAT OSF; confirm both values appear; change one value and regenerate; confirm the change.

**Acceptance Scenarios**:

1. **Given** a VAT SKU, **When** a user with ROP edit/import permission saves Cosmetics.lk ROP, **Then** the value is stored and later appears on VAT OSF.
2. **Given** a VAT SKU, **When** the user saves a shop-wise ROP for a configured shop column, **Then** that shop’s ROP appears on VAT OSF under that shop’s ROP column.
3. **Given** ROP import includes Cosmetics.lk and shop columns, **When** import succeeds, **Then** VAT OSF reflects imported quantities on the next generate.

---

### Edge Cases

- Catalog with only VAT SKUs: Non-VAT OSF may be empty or show a clear “no SKUs” outcome; Main and VAT still generate.
- Catalog with no VAT SKUs: VAT OSF may be empty or show a clear “no SKUs” outcome; Main and Non-VAT still generate.
- VAT SKU with shop ROPs but no Cosmetics.lk ROP: shop columns filled; Total ROP not invented from shop sum.
- VAT SKU with Cosmetics.lk ROP but all shop ROPs blank: Total ROP = Cosmetics.lk ROP; shop ROP cells blank.
- Existing below-threshold / reorder filters on Main: apply consistently; for VAT OSF, threshold math uses VAT Total ROP definition (Cosmetics.lk ROP only).
- Shop column configured but inactive: inactive shops do not appear as ROP columns.
- SKU ERP Product Priority changes from Vat to another value (or reverse) between generates: membership follows synced priority at generate time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST offer three distinct OSF generate variants: Main, VAT-only, and Non-VAT (excluding VAT items).
- **FR-002**: VAT-only OSF MUST include only SKUs classified as VAT items; Non-VAT OSF MUST exclude those SKUs; Main OSF MUST include the full catalog set currently eligible for Main OSF.
- **FR-003**: VAT item classification MUST use ERP **Product Priority** value **Vat** (as set on the ERP Item and synced to Cosmo). A SKU is VAT when its ERP1 and/or ERP2 Product Priority equals `Vat`. Cosmo product-status categories (including `VAT_TOP_PRIORITY_BRAND`) MUST NOT define VAT OSF membership.
- **FR-004**: On VAT OSF, ROP columns MUST be limited to Cosmetics.lk ROP plus shop-wise ROP columns; other company-wise ROP columns MUST be omitted.
- **FR-005**: On VAT OSF, Total ROP MUST equal Cosmetics.lk ROP only and MUST NOT sum shop-wise ROP into Total ROP.
- **FR-006**: On Main and Non-VAT OSF, Total ROP and ROP column sets MUST keep existing Main behavior (sum of included ROP columns / current company-wise layout).
- **FR-007**: Users MUST be able to maintain Cosmetics.lk ROP and shop-wise ROP values for SKUs so VAT OSF can show current figures (edit and/or import paths already used for OSF ROP).
- **FR-008**: Derived fields that depend on Total ROP on VAT OSF (for example % of ROP, 70% of total ROP, below-threshold inclusion when that filter is used) MUST use the VAT Total ROP definition (Cosmetics.lk ROP only).
- **FR-009**: Generated files MUST make the variant identifiable so users do not confuse Main, VAT, and Non-VAT downloads.
- **FR-010**: Stock and non-ROP columns on VAT OSF MAY continue to follow existing OSF column configuration unless a later decision narrows stock columns; ROP column restriction in FR-004 applies regardless.

### Key Entities

- **OSF variant**: Main | VAT | Non-VAT — which catalog slice and which ROP Total / column rules apply at generate time.
- **VAT item**: Catalog SKU whose synced ERP Product Priority is **Vat** on ERP1 and/or ERP2.
- **Cosmetics.lk ROP**: Reorder point for the Cosmetics.lk column; sole contributor to Total ROP on VAT OSF.
- **Shop-wise ROP**: Per-shop reorder points shown on VAT OSF for planning; excluded from VAT Total ROP.
- **Company-wise ROP**: ROP columns for other companies / non-shop Cosmetics entities present on Main OSF; omitted from VAT OSF.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A buyer can produce Main, VAT, and Non-VAT OSF downloads in one session without manually splitting the catalog spreadsheet.
- **SC-002**: Spot-check of 20 mixed SKUs: VAT workbook membership matches VAT classification 100%; Non-VAT workbook excludes those same VAT SKUs 100%.
- **SC-003**: For every sampled VAT row with Cosmetics.lk ROP and shop ROPs filled, Total ROP equals Cosmetics.lk ROP (0% of rows incorrectly sum shop ROPs).
- **SC-004**: VAT workbook ROP header set contains Cosmetics.lk and shop ROP columns only — auditors find zero other company-wise ROP headers on VAT files.
- **SC-005**: After updating Cosmetics.lk or a shop ROP for a VAT SKU, the next VAT generate reflects the new value without a separate manual patch of the file.

## Assumptions

- Main OSF remains the current full-catalog OSF (same ROP summing and company ROP columns as today).
- VAT vs Non-VAT is a partition by ERP Product Priority `Vat`; Main is the union (full eligible set), not a third disjoint slice.
- Cosmo already syncs ERP Product Priority (including option `Vat`) into `erp1` / `erp2` fields used by OSF generate today.
- “Shop-wise” means physical Cosmetics.lk shop OSF columns already modeled as shop / warehouse columns (not other companies).
- Cosmetics.lk ROP is the dedicated Cosmetics.lk (main) ROP column, distinct from individual shop ROP columns.
- Non-VAT and Main keep today’s Total ROP = sum of included ROP columns.
- Existing OSF permissions (`purchasing.osf.read` / `.manage` and related) gate all three variants unless a later permission split is requested.
- Vault OSF is out of scope; this feature targets Cosmo / Cosmetics.lk OSF generation.
- Stock column layout on VAT OSF stays as configured for v1; only ROP column presence and Total ROP math change as specified.
