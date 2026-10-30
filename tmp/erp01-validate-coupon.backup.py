# FINAL TEST (2026-10-17) — EXISTING SALES INVOICE / BEFORE SAVE SCRIPT ONLY
# VAT26 + VATCD overlap on a Brand. Guard against any additional *in-hook*
# native pricing lookups, and strip only their stale coupon Pricing Rule IDs
# from item rows; keep real non-coupon Pricing Rules and all discount rules.
# VAT26: Cash/Bank Transfer. VATCD: Credit Card. User selection wins.
# IMPORTANT LIMIT: ERPNext native validate/get_item_details happens BEFORE
# Before Save; if it throws MultiplePricingRuleConflict there, this hook never
# executes and NO Before Save-only edit can catch or prevent that error.
# Does NOT require switching on 'Ignore Pricing Rule' in the POS Profile.
#
# FIX (2026-10-17 POS VAT26/VATCD): Resolve two overlapping VAT coupon/offer
# rows BEFORE payment validation: prefer the explicit coupon header, use the
# single applied row when unambiguous, or choose by actual payment mode only
# when both were marked applied. An unchosen payment never auto-selects VAT.
# This prevents competing VAT selections INSIDE this Before Save script; native
# ERPNext/POS item pricing errors that occur before this event are separate.
# No new scripts, fields, or event changes.
#
# FIX (2026-10-16 POS): Avoid calling script-local helper functions from
# other functions in Frappe restricted Server Scripts. Inline rule-name
# normalization inside both rule-check functions. Also remove the external
# customer_group reference from coupon eligibility helper.
# Event remains Before Save. No additional Server Scripts or fields.
#
# FIX (2026-10-16): BEFORE SAVE / ERPNext v14 coupon-rule reference safety.
# Coupon discounts remain on item.discount_percentage and discount_amount,
# but their linked coupon Pricing Rules are NOT written to item.pricing_rules.
# Only genuinely winning non-coupon item Pricing Rules are stored there.
# This prevents this script from persisting a transaction-level coupon rule
# where ERPNext later tries to validate it as an item-level Pricing Rule.
# IMPORTANT: an existing Draft with invalid pricing_rules may still fail
# during ERPNext.validate(), which runs BEFORE the Before Save hook.
# For that Draft, set Ignore Pricing Rule on the invoice before its first save.
#
# FIX (2026-10-16): Native non-coupon Pricing Rules are detected in normal Sales
# Invoices using the same safe_exec-compatible evaluator already used by POS.
# Preserve the linked native rule on the item (including across POS totals
# recalculation); avoid treating a previously applied, verified 10% rule rate
# as a manual edit when a higher eligible coupon is selected. Manual rates
# without valid rule/offer provenance remain protected.
#
# HLW15: Cash / Bank Transfer only (15% from linked Pricing Rule).
# HLW10: Credit Card only (10% from linked Pricing Rule).
# Both require actual coupon selection; matching POS Offers alone cannot select them.
# Cosmetics LK 2 production — Validate Coupon Payment Type
# COS5: 5%, Cash / COD / Bank Transfer only — must be explicitly selected (not auto-applied).
# COS20: 20%, Cash / Bank Transfer only — must be explicitly selected (not auto-applied).
# PD10: Cash / Bank Transfer only — discount % comes from linked Pricing Rule.
# PD5: Credit Card only — discount % comes from linked Pricing Rule.
# F2F15: KOKO / MintPay only — the ONLY discount allowed on KOKO / MintPay.
# F2F25: blocked on KOKO / MintPay; allowed on other payment modes.
# F2F SELECTED-COUPON FIX (2026-10-09): only the F2F coupon actually selected by the cashier may participate; the overlapping Palmers coupon is excluded before highest-discount logic.
# POS ITEM-WISE FIX (2026-10-09): normal payments preserve each item's own genuine Pricing Rule even when it equals the coupon %, while KOKO/MintPay removes every discount except F2F15 on F2F15-eligible items.
# DISCOUNT DISPLAY FIX (2026-10-08): item discounts now populate discount_percentage, discount_amount and base_discount_amount instead of only lowering Rate.
# Loyalty: LOYALCS (10%, Gold) and LOYALCS2 (15%, Platinum) auto-apply by group.
# JULYV20: 20% off Grand Total, any customer group, must be explicitly selected via coupon code. (added 2026-07-25)
# CHANGE: POS branch manually fetches native ERPNext Pricing Rule results using get_item_details,
#         then compares those discounts with coupon discounts and keeps the highest per item.
#         Coupon restrictions and POS auto-application logic remain intact.
#
# FIX (this version): effective_payment_type detection no longer blindly reads payments[0].
#         It now scans all payment rows, gives KOKO/MintPay priority whenever either has a nonzero
#         amount (regardless of other zero-amount rows present, e.g. Cash/Bank Transfer/
#         Credit Card placeholder rows left over from POS UI), otherwise uses the first
#         row with a nonzero amount, and only falls back to payments[0].mode_of_payment
#         if every row has a zero amount.
#
# FIX (rounded_total): After all calculations are done, rounded_total is forced to equal
#         grand_total so POSA always collects the exact invoice amount without rounding.
#         Runs unconditionally at the end of the POS branch, outside the coupon block.
#
# FIX (2026-07-27): Coupons whose linked Pricing Rule restricts eligibility to a Brand /
#         Item Code / Item Group (e.g. JULYV20 -> PRLE-0014, Brand-restricted) were being
#         applied as a flat percentage to every line item in both the normal-invoice and
#         POS branches, ignoring the Pricing Rule's own condition entirely. This let items
#         outside the rule's brand list (e.g. Cetaphil, or items with no brand set) receive
#         the discount too (see Sales Invoice 600-001694). Added get_coupon_pricing_rule_eligible_keys()
#         below, which reads the coupon's Pricing Rule apply_on/Brand/Item Code/Item Group
#         condition directly and gates the coupon's per-item percentage accordingly. Rules
#         configured as "Transaction" (COS5, LOYALCS, LOYALCS2, SAVE15, JUNE15, STAFFVAT,
#         FREESP, SLAB50, BT10 — all whole-cart, unrestricted) are unaffected and keep
#         today's exact behaviour. (Returns a dict instead of a tuple — this sandbox's
#         RestrictedPython exec does not support tuple-unpack assignment.)
#
# FIX (2026-10-03): Normal Sales Invoice brand/item/group-restricted coupons no longer
#         preserve a pre-filled coupon discount from item.discount_percentage on an
#         ineligible item. Existing discounts are preserved only when item.pricing_rules
#         points to genuine non-coupon Pricing Rule(s).

# FIX (2026-10-12 OGF PRICE LIST): OGF Price List is a strict no-discount price list.
#         Coupons, POS Offers, native Pricing Rules, free-item rules, header discounts,
#         line discounts and manually reduced rates are removed; items return to their
#         OGF Price List Rate in both POS and normal Sales Invoices.

allowed_payment_types = ["Cash On Delivery", "Cash", "Bank Transfer"]
cos20_allowed_payment_types = ["Cash", "Bank Transfer"]
pd10_allowed_payment_types = ["Cash", "Bank Transfer"]
pd5_allowed_payment_types = ["Credit Card"]
vat26_allowed_payment_types = ["Cash", "Bank Transfer"]
vatcd_allowed_payment_types = ["Credit Card"]
hlw15_allowed_payment_types = ["Cash", "Bank Transfer"]
hlw10_allowed_payment_types = ["Credit Card"]
f2f15_allowed_payment_types = ["KOKO", "MINTPAY"]
f2f25_blocked_payment_types = ["KOKO", "MINTPAY"]

payment_type = str(doc.custom_payment_type or "").strip()

# =========================================================================
# OGF PRICE LIST — GLOBAL NO-DISCOUNT GUARD
# =========================================================================
# Pricing Rules may leave "For Price List" blank so they can work on the other
# selling price lists. OGF Price List is centrally excluded here. Clear coupon /
# POS Offer selection before payment/coupon validation and keep ERPNext native
# Pricing Rules disabled. The final OGF block at the end restores every item to
# its OGF Price List Rate as a last line of defence.
blocked_discount_price_list = "OGF Price List"
ogf_price_list_restricted = (
    str(doc.get("selling_price_list") or "").strip().lower()
    == blocked_discount_price_list.lower()
)

if ogf_price_list_restricted:
    doc.ignore_pricing_rule = 1
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    doc.discount_amount = 0.0
    doc.base_discount_amount = 0.0

    for ogf_early_coupon_row in doc.get("posa_coupons") or []:
        ogf_early_coupon_row.applied = 0

    for ogf_early_offer_row in doc.get("posa_offers") or []:
        ogf_early_offer_row.applied = 0
        if ogf_early_offer_row.get("offer_applied") is not None:
            ogf_early_offer_row.offer_applied = 0

# IMPORTANT FOR POS:
# POS Awesome can have custom_payment_type/default payment values and zero-amount
# payment rows BEFORE the cashier opens Pay and chooses the real Mode of Payment.
# For POS, do not treat those defaults/placeholders as a chosen payment method.
# A POS payment is considered chosen only when a payment row has a non-zero amount.
# Detect POS as early as possible so default custom_payment_type (often Cash) is ignored
# before the cashier actually selects/enters a payment in the Pay dialog.
is_pos_context = bool(doc.get("posa_pos_opening_shift")) or bool(doc.get("pos_profile")) or bool(doc.get("is_pos"))

# The existing script manages POS pricing itself. Set this at the earliest
# possible point INSIDE Before Save (rather than waiting for the POS branch),
# so a totals recalculation from this script cannot re-enter the native
# overlapping Brand rules. This cannot change earlier validate processing.
if is_pos_context:
    doc.ignore_pricing_rule = 1

if is_pos_context:
    effective_payment_type = ""
    payment_chosen = 0
else:
    effective_payment_type = payment_type
    payment_chosen = 1 if payment_type else 0

if doc.get("payments"):
    pay_rows = doc.get("payments") or []
    restricted_payment_found = ""
    first_nonzero_mop = ""

    for row in pay_rows:
        mop = str((row.mode_of_payment or "")).strip()
        mop_key = mop.upper()
        amount = frappe.utils.flt(row.get("amount") or 0)

        if mop and amount > 0:
            if not first_nonzero_mop:
                first_nonzero_mop = mop

            # KOKO and MintPay are both zero-discount payment methods.
            # Give either one priority over zero-value/default placeholder rows.
            if mop_key == "KOKO":
                restricted_payment_found = "KOKO"
            elif mop_key == "MINTPAY" and not restricted_payment_found:
                restricted_payment_found = "MintPay"

    if restricted_payment_found:
        effective_payment_type = restricted_payment_found
        payment_chosen = 1
    elif first_nonzero_mop:
        effective_payment_type = first_nonzero_mop
        payment_chosen = 1
    elif pay_rows and not is_pos_context:
        # Preserve the old fallback for normal Sales Invoices only.
        mop = str((pay_rows[0].mode_of_payment or "")).strip()
        if mop:
            effective_payment_type = mop
            payment_chosen = 1

# =========================================================================
# VAT26 / VATCD — RESOLVE OVERLAPPING POS COUPONS BEFORE VALIDATION
# =========================================================================
# Their POS Offers target the same Brand. POS Awesome may mark both coupon
# rows / offer rows as applied before the cashier chooses a payment method.
# Never validate or process both at once. The selected coupon in the Sales
# Invoice header takes precedence. Only when there is no header selection do
# we consult applied coupon rows. If both are applied, use the payment mode
# ONLY if one has actually been chosen; otherwise neither is selected yet.
# This applies to POS only; normal Sales Invoice behaviour is unchanged.
if is_pos_context:
    vat_header_key = str(doc.get("coupon_code") or "").strip().lower()
    selected_vat_pos_key = ""
    applied_vat_pos_keys = []

    if vat_header_key in ("vat26", "vatcd"):
        selected_vat_pos_key = vat_header_key
    elif not vat_header_key:
        for vat_coupon_row in doc.get("posa_coupons") or []:
            vat_code_key = str(
                vat_coupon_row.get("coupon")
                or vat_coupon_row.get("coupon_code")
                or ""
            ).strip().lower()
            if vat_code_key in ("vat26", "vatcd") and vat_coupon_row.get("applied"):
                if vat_code_key not in applied_vat_pos_keys:
                    applied_vat_pos_keys.append(vat_code_key)

        if len(applied_vat_pos_keys) == 1:
            selected_vat_pos_key = applied_vat_pos_keys[0]
        elif len(applied_vat_pos_keys) > 1 and payment_chosen:
            vat_payment_key = str(effective_payment_type or "").strip().upper()
            if vat_payment_key in ("CASH", "BANK TRANSFER"):
                selected_vat_pos_key = "vat26"
            elif vat_payment_key == "CREDIT CARD":
                selected_vat_pos_key = "vatcd"

    if selected_vat_pos_key:
        doc.coupon_code = selected_vat_pos_key.upper()

    # Only the actually selected VAT coupon may remain applied. This is
    # important before the existing STEP 1 payment-method validation.
    for vat_coupon_row in doc.get("posa_coupons") or []:
        vat_code_key = str(
            vat_coupon_row.get("coupon")
            or vat_coupon_row.get("coupon_code")
            or ""
        ).strip().lower()
        if vat_code_key in ("vat26", "vatcd"):
            vat_coupon_row.applied = 1 if vat_code_key == selected_vat_pos_key else 0

    # These are coupon-based POS Offers, not genuine independent discounts.
    # An overlapping auto-match must not count as selecting the other VAT.
    for vat_offer_row in doc.get("posa_offers") or []:
        vat_offer_code = str(vat_offer_row.get("coupon") or "").strip().lower()
        vat_offer_title = str(
            vat_offer_row.get("offer_name")
            or vat_offer_row.get("offer")
            or vat_offer_row.get("name")
            or ""
        ).strip().lower()
        if vat_offer_code == "vat26" or "vat26" in vat_offer_title:
            vat_offer_row.applied = 1 if selected_vat_pos_key == "vat26" else 0
        elif vat_offer_code == "vatcd" or "vatcd" in vat_offer_title:
            vat_offer_row.applied = 1 if selected_vat_pos_key == "vatcd" else 0

# =========================================================================
# HLW15 / HLW10 — SELECT ONE POS COUPON BEFORE PAYMENT VALIDATION
# =========================================================================
# HLW15 and HLW10 may match the same items/Brand. Only a selected coupon
# may participate. Do NOT treat a matching POS Offer as coupon selection.
# Header selection takes precedence; if both coupon rows are applied with
# no header selection, resolve by payment method only after payment is chosen.
if is_pos_context:
    hlw_header_key = str(doc.get("coupon_code") or "").strip().lower()
    selected_hlw_pos_key = ""
    applied_hlw_pos_keys = []

    if hlw_header_key in ("hlw15", "hlw10"):
        selected_hlw_pos_key = hlw_header_key
    elif not hlw_header_key:
        for hlw_coupon_row in doc.get("posa_coupons") or []:
            hlw_code_key = str(
                hlw_coupon_row.get("coupon")
                or hlw_coupon_row.get("coupon_code")
                or ""
            ).strip().lower()
            if hlw_code_key in ("hlw15", "hlw10") and hlw_coupon_row.get("applied"):
                if hlw_code_key not in applied_hlw_pos_keys:
                    applied_hlw_pos_keys.append(hlw_code_key)

        if len(applied_hlw_pos_keys) == 1:
            selected_hlw_pos_key = applied_hlw_pos_keys[0]
        elif len(applied_hlw_pos_keys) > 1 and payment_chosen:
            hlw_payment_key = str(effective_payment_type or "").strip().upper()
            if hlw_payment_key in ("CASH", "BANK TRANSFER"):
                selected_hlw_pos_key = "hlw15"
            elif hlw_payment_key == "CREDIT CARD":
                selected_hlw_pos_key = "hlw10"

    if selected_hlw_pos_key:
        doc.coupon_code = selected_hlw_pos_key.upper()

    for hlw_coupon_row in doc.get("posa_coupons") or []:
        hlw_code_key = str(
            hlw_coupon_row.get("coupon")
            or hlw_coupon_row.get("coupon_code")
            or ""
        ).strip().lower()
        if hlw_code_key in ("hlw15", "hlw10"):
            hlw_coupon_row.applied = 1 if hlw_code_key == selected_hlw_pos_key else 0

    # Disable the other overlapping coupon-based offer; do not treat
    # auto-matched POS Offers as genuine extra discount selections.
    for hlw_offer_row in doc.get("posa_offers") or []:
        hlw_offer_code = str(hlw_offer_row.get("coupon") or "").strip().lower()
        hlw_offer_title = str(
            hlw_offer_row.get("offer_name")
            or hlw_offer_row.get("offer")
            or hlw_offer_row.get("name")
            or ""
        ).strip().lower()
        if hlw_offer_code == "hlw15" or "hlw15" in hlw_offer_title:
            hlw_offer_row.applied = 1 if selected_hlw_pos_key == "hlw15" else 0
        elif hlw_offer_code == "hlw10" or "hlw10" in hlw_offer_title:
            hlw_offer_row.applied = 1 if selected_hlw_pos_key == "hlw10" else 0

# =========================================================================
# F2F15 / F2F25 — SELECTED COUPON FIRST, PAYMENT VALIDATION SECOND
# =========================================================================
# Both coupons can target the same Palmers brand. POS Awesome / ERPNext may
# therefore see both matching POS Offers/Pricing Rules before payment is chosen.
# That matching must NOT decide which coupon is active.
#
# Selection source of truth:
#   1) Sales Invoice coupon_code header
#   2) an actually-applied POS Coupon Detail row
#
# POS Offer rows are intentionally NOT treated as coupon selection because both
# F2F15 and F2F25 offers can auto-match the same Palmers item.
#
# Payment behavior:
#   F2F15 -> KOKO / MintPay only
#   F2F25 -> NOT allowed on KOKO / MintPay
#   No payment chosen yet -> keep selected coupon pending; do not throw
selected_f2f_coupon_key = ""

f2f_header_key = str(doc.get("coupon_code") or "").strip().upper()
if f2f_header_key in ("F2F15", "F2F25"):
    selected_f2f_coupon_key = f2f_header_key

if not selected_f2f_coupon_key:
    for f2f_coupon_row in doc.get("posa_coupons") or []:
        f2f_coupon_code = str(
            f2f_coupon_row.get("coupon")
            or f2f_coupon_row.get("coupon_code")
            or ""
        ).strip().upper()

        if (
            f2f_coupon_code in ("F2F15", "F2F25")
            and f2f_coupon_row.get("applied")
        ):
            selected_f2f_coupon_key = f2f_coupon_code
            break

if selected_f2f_coupon_key:
    doc.coupon_code = selected_f2f_coupon_key

    # Ensure the other overlapping F2F coupon row cannot remain applied.
    for f2f_coupon_row in doc.get("posa_coupons") or []:
        f2f_coupon_code = str(
            f2f_coupon_row.get("coupon")
            or f2f_coupon_row.get("coupon_code")
            or ""
        ).strip().upper()

        if f2f_coupon_code in ("F2F15", "F2F25"):
            f2f_coupon_row.applied = 1 if f2f_coupon_code == selected_f2f_coupon_key else 0

if (
    selected_f2f_coupon_key == "F2F15"
    and payment_chosen
    and str(effective_payment_type or "").strip().upper() not in f2f15_allowed_payment_types
):
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'F2F15' can only be used with <u>KOKO</u> or <u>MintPay</u>.",
        title="Invalid Payment Method",
    )

if (
    selected_f2f_coupon_key == "F2F25"
    and payment_chosen
    and str(effective_payment_type or "").strip().upper() in f2f25_blocked_payment_types
):
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'F2F25' cannot be used with <u>KOKO</u> or <u>MintPay</u>. Only <b>F2F15</b> is allowed for these payment methods.",
        title="Invalid Payment Method",
    )


customer_group = ""
if doc.customer:
    cust_key = str(doc.customer or "").strip()
    cg = frappe.db.get_value("Customer", cust_key, "customer_group")
    if not cg:
        cg = frappe.db.get_value(
            "Customer",
            {"customer_name": cust_key},
            "customer_group",
        )
    if not cg:
        matches = frappe.get_all(
            "Customer",
            filters={"customer_name": ["like", "%" + cust_key + "%"]},
            fields=["name", "customer_group"],
            limit=1,
        )
        if matches:
            cg = matches[0].get("customer_group")
            if not cust_key.isdigit() and matches[0].get("name"):
                doc.customer = matches[0].get("name")
    customer_group = str(cg or "").strip().lower()


def get_coupon_pricing_rule_eligible_keys(
    pricing_rule_name,
    items,
    coupon_code=None,
    invoice_doc=None
):
    # Deterministic validation for the SELECTED coupon's linked Pricing Rule.
    # This deliberately does NOT call ERPNext's multi-rule resolver, because
    # overlapping coupon rules can conflict before this script gets a chance
    # to exclude the coupon that was not selected.

    result = {
        "valid": False,
        "restricted": True,
        "eligible_keys": set()
    }

    if not pricing_rule_name or not invoice_doc:
        return result

    pr = frappe.get_doc("Pricing Rule", pricing_rule_name)

    # ---------------------------------------------------------
    # RULE STATUS / TYPE
    # ---------------------------------------------------------
    if frappe.utils.cint(pr.get("disable") or 0) == 1:
        return result

    if frappe.utils.cint(pr.get("selling") or 0) != 1:
        return result

    if str(pr.get("price_or_product_discount") or "").strip() not in ("", "Price"):
        return result

    # ---------------------------------------------------------
    # SELECTED COUPON MUST LINK TO THIS RULE
    # ---------------------------------------------------------
    selected_coupon = str(coupon_code or invoice_doc.get("coupon_code") or "").strip()

    if frappe.utils.cint(pr.get("coupon_code_based") or 0) == 1:
        if not selected_coupon:
            return result

        linked_rule = frappe.db.get_value(
            "Coupon Code",
            {"coupon_code": selected_coupon},
            "pricing_rule"
        )

        if str(linked_rule or "").strip() != str(pricing_rule_name).strip():
            return result

    # ---------------------------------------------------------
    # DATE VALIDITY
    # ---------------------------------------------------------
    check_date = (
        invoice_doc.get("posting_date")
        or invoice_doc.get("transaction_date")
        or frappe.utils.today()
    )
    check_date = frappe.utils.getdate(check_date)

    if pr.get("valid_from") and check_date < frappe.utils.getdate(pr.get("valid_from")):
        return result

    if pr.get("valid_upto") and check_date > frappe.utils.getdate(pr.get("valid_upto")):
        return result

    # Coupon's own validity dates / usage, when available.
    if selected_coupon:
        coupon_info = frappe.db.get_value(
            "Coupon Code",
            {"coupon_code": selected_coupon},
            ["valid_from", "valid_upto", "maximum_use", "used"],
            as_dict=True,
        )

        if coupon_info:
            if coupon_info.get("valid_from") and check_date < frappe.utils.getdate(coupon_info.get("valid_from")):
                return result

            if coupon_info.get("valid_upto") and check_date > frappe.utils.getdate(coupon_info.get("valid_upto")):
                return result

            maximum_use = frappe.utils.cint(coupon_info.get("maximum_use") or 0)
            used = frappe.utils.cint(coupon_info.get("used") or 0)

            if maximum_use and used >= maximum_use:
                return result

    # ---------------------------------------------------------
    # DOCUMENT-LEVEL RESTRICTIONS
    # ---------------------------------------------------------
    exact_field_map = {
        "company": "company",
        "customer": "customer",
        "campaign": "campaign",
        "sales_partner": "sales_partner",
    }

    for rule_field in exact_field_map:
        rule_value = str(pr.get(rule_field) or "").strip()
        if rule_value:
            doc_value = str(invoice_doc.get(exact_field_map[rule_field]) or "").strip()
            if rule_value != doc_value:
                return result

    if pr.get("customer_group"):
        # Resolve locally instead of relying on customer_group defined outside
        # this function (which may be unavailable in safe_exec function scope).
        doc_customer_group = str(invoice_doc.get("customer_group") or "").strip()
        if not doc_customer_group and invoice_doc.get("customer"):
            doc_customer_group = str(
                frappe.db.get_value(
                    "Customer", invoice_doc.get("customer"), "customer_group"
                ) or ""
            ).strip().lower()
        if str(pr.get("customer_group") or "").strip() != doc_customer_group:
            return result

    if pr.get("territory"):
        if str(pr.get("territory") or "").strip() != str(invoice_doc.get("territory") or "").strip():
            return result

    if pr.get("for_price_list"):
        if str(pr.get("for_price_list") or "").strip() != str(invoice_doc.get("selling_price_list") or "").strip():
            return result

    if pr.get("currency"):
        if str(pr.get("currency") or "").strip() != str(invoice_doc.get("currency") or "").strip():
            return result

    # Dynamic Condition, if configured.
    # Frappe v14 restricted Server Scripts do not expose frappe.safe_eval.
    # Evaluate only an exact coupon_code == "CODE" condition here.
    # Other condition expressions fail closed rather than being ignored.
    coupon_rule_condition = str(pr.get("condition") or "").strip()
    if coupon_rule_condition:
        condition_parts = coupon_rule_condition.split("==")
        condition_supported = False
        if len(condition_parts) == 2:
            left_side = str(condition_parts[0] or "").strip()
            right_side = str(condition_parts[1] or "").strip()
            if left_side == "coupon_code" and len(right_side) >= 2:
                quote_char = right_side[0]
                if quote_char in ("'", '"') and right_side[-1] == quote_char:
                    expected_coupon_code = right_side[1:-1]
                    if expected_coupon_code:
                        condition_supported = True
                        actual_coupon_code = str(invoice_doc.get("coupon_code") or "").strip()
                        if actual_coupon_code != expected_coupon_code:
                            return result
        if not condition_supported:
            return result

    # ---------------------------------------------------------
    # TRANSACTION-WIDE QUANTITY / AMOUNT LIMITS
    # ---------------------------------------------------------
    total_qty = frappe.utils.flt(invoice_doc.get("total_qty") or 0)
    if not total_qty:
        for item in items or []:
            total_qty = total_qty + frappe.utils.flt(item.qty or 0)

    total_amount = frappe.utils.flt(
        invoice_doc.get("total")
        or invoice_doc.get("net_total")
        or 0
    )

    min_qty = frappe.utils.flt(pr.get("min_qty") or 0)
    max_qty = frappe.utils.flt(pr.get("max_qty") or 0)
    min_amt = frappe.utils.flt(pr.get("min_amt") or 0)
    max_amt = frappe.utils.flt(pr.get("max_amt") or 0)

    if min_qty and total_qty < min_qty:
        return result
    if max_qty and total_qty > max_qty:
        return result
    if min_amt and total_amount < min_amt:
        return result
    if max_amt and total_amount > max_amt:
        return result

    # ---------------------------------------------------------
    # ITEM ELIGIBILITY
    # ---------------------------------------------------------
    apply_on = str(pr.get("apply_on") or "").strip()

    if apply_on == "Transaction":
        return {
            "valid": True,
            "restricted": False,
            "eligible_keys": set(),
        }

    if apply_on not in ("Brand", "Item Code", "Item Group"):
        return result

    eligible_keys = set()

    # Build the allowed child rows once.
    allowed_brands = {}
    allowed_items = {}
    allowed_groups = {}

    if apply_on == "Brand":
        for row in frappe.get_all(
            "Pricing Rule Brand",
            filters={"parent": pricing_rule_name},
            fields=["brand", "uom"],
        ):
            key = str(row.get("brand") or "").strip()
            if key:
                allowed_brands[key] = str(row.get("uom") or "").strip()

    elif apply_on == "Item Code":
        for row in frappe.get_all(
            "Pricing Rule Item Code",
            filters={"parent": pricing_rule_name},
            fields=["item_code", "uom"],
        ):
            key = str(row.get("item_code") or "").strip()
            if key:
                allowed_items[key] = str(row.get("uom") or "").strip()

    elif apply_on == "Item Group":
        for row in frappe.get_all(
            "Pricing Rule Item Group",
            filters={"parent": pricing_rule_name},
            fields=["item_group", "uom"],
        ):
            key = str(row.get("item_group") or "").strip()
            if key:
                allowed_groups[key] = str(row.get("uom") or "").strip()

    for item in items or []:
        item_key = item.name or str(item.idx or "") or str(item.item_code or "")
        item_uom = str(item.uom or item.stock_uom or "").strip()
        item_warehouse = str(item.warehouse or invoice_doc.get("set_warehouse") or "").strip()

        # Pricing Rule-level warehouse restriction.
        rule_warehouse = str(pr.get("warehouse") or "").strip()
        if rule_warehouse and rule_warehouse != item_warehouse:
            continue

        matched = False
        required_uom = ""

        if apply_on == "Brand":
            item_brand = str(
                frappe.db.get_value("Item", item.item_code, "brand") or ""
            ).strip()

            if item_brand in allowed_brands:
                matched = True
                required_uom = allowed_brands.get(item_brand) or ""

        elif apply_on == "Item Code":
            code = str(item.item_code or "").strip()
            if code in allowed_items:
                matched = True
                required_uom = allowed_items.get(code) or ""

        elif apply_on == "Item Group":
            item_group = str(
                frappe.db.get_value("Item", item.item_code, "item_group") or ""
            ).strip()

            if item_group in allowed_groups:
                matched = True
                required_uom = allowed_groups.get(item_group) or ""

        if not matched:
            continue

        # Child-row UOM restriction, when configured.
        if required_uom and required_uom != item_uom:
            continue

        eligible_keys.add(item_key)

    return {
        "valid": True if eligible_keys else False,
        "restricted": True,
        "eligible_keys": eligible_keys,
    }


def is_non_coupon_pricing_rule(rule_names):
    # Return True only when every Pricing Rule listed on the item is a genuine
    # non-coupon Pricing Rule. This prevents an already-applied coupon discount
    # from being mistaken for a separate normal Pricing Rule discount.
    # Inline normalization: function-to-function calls can raise NameError in
    # Frappe safe_exec because the script's functions live in local scope.
    names_text = str(rule_names or "").strip()
    names_text = names_text.replace("[", ",").replace("]", ",")
    names_text = names_text.replace('"', "").replace("'", "")
    names_text = names_text.replace("\n", ",")
    names = []
    for part in names_text.split(","):
        rule_name = str(part or "").strip()
        if rule_name and rule_name not in names:
            names.append(rule_name)
    if not names:
        return False

    for rule_name in names:
        coupon_based = frappe.db.get_value(
            "Pricing Rule",
            rule_name,
            "coupon_code_based",
        )

        if coupon_based is None or frappe.utils.cint(coupon_based) == 1:
            return False

        # Any Pricing Rule linked from a Coupon Code is coupon-controlled even
        # when coupon_code_based was not enabled on the Pricing Rule itself.
        linked_coupon = frappe.db.get_value(
            "Coupon Code",
            {"pricing_rule": rule_name},
            "name",
        )
        if linked_coupon:
            return False

    return True


def has_coupon_pricing_rule(rule_names):
    # Return True when at least one Pricing Rule on the item is coupon-based.
    # Used when a coupon is removed from an already-saved Draft so stale
    # coupon discounts can be cleared without deleting genuine normal rules.
    # Inline normalization: function-to-function calls can raise NameError in
    # Frappe safe_exec because the script's functions live in local scope.
    names_text = str(rule_names or "").strip()
    names_text = names_text.replace("[", ",").replace("]", ",")
    names_text = names_text.replace('"', "").replace("'", "")
    names_text = names_text.replace("\n", ",")
    names = []
    for part in names_text.split(","):
        rule_name = str(part or "").strip()
        if rule_name and rule_name not in names:
            names.append(rule_name)
    if not names:
        return False

    for rule_name in names:
        coupon_based = frappe.db.get_value(
            "Pricing Rule",
            rule_name,
            "coupon_code_based",
        )

        if frappe.utils.cint(coupon_based or 0) == 1:
            return True

        linked_coupon = frappe.db.get_value(
            "Coupon Code",
            {"pricing_rule": rule_name},
            "name",
        )
        if linked_coupon:
            return True

    return False


def get_native_pricing_rule_map(items, invoice_doc):
    # ---------------------------------------------------------------------
    # Deterministic evaluation of genuine NON-coupon Pricing Rules per item.
    #
    # WHY THIS EXISTS (2026-10-06 SAFE_EXEC):
    # frappe.get_attr / frappe.safe_eval / frappe.get_traceback are NOT exposed
    # to Server Scripts. The previous lookups (get_item_details, _get_pricing_rules,
    # filter_pricing_rules) therefore raised AttributeError on every run, the
    # surrounding try/except swallowed it, and the native maps were always empty.
    # That is why normal Pricing Rules (e.g. PRLE-0006) never competed with coupons.
    #
    # Rules considered here:
    #   enabled, Selling, Price discount, apply_on Item Code / Item Group / Brand,
    #   NOT coupon_code_based and NOT linked from any Coupon Code.
    # Checked: company, validity dates, price list, currency, customer, customer
    # group (incl. parent groups), territory (incl. parents), campaign, sales
    # partner, warehouse, child-row UOM, item variant_of, item group parents,
    # min/max qty and min/max amount (per item, or across matching items when
    # Mixed Conditions is ticked).
    #
    # Rules with a Python Condition, Apply Rule On Other or Is Cumulative cannot
    # be fully evaluated inside safe_exec. They are only honoured when ERPNext
    # itself already stamped them on the item (item.pricing_rules or the Pricing
    # Rule Detail table) and they pass the date/party checks above.
    #
    # Fully self-contained: does not call any other function in this script.
    # ---------------------------------------------------------------------
    out = {"by_item": {}, "candidates_by_item": {}, "error": ""}

    try:
        work_items = []
        for item in items or []:
            if frappe.utils.cint(item.get("is_free_item") or 0) == 1:
                continue
            if not str(item.get("item_code") or "").strip():
                continue
            work_items.append(item)

        if not work_items:
            return out

        rules = frappe.get_all(
            "Pricing Rule",
            filters={
                "disable": 0,
                "selling": 1,
                "apply_on": ["in", ["Item Code", "Item Group", "Brand"]],
            },
            fields=[
                "name",
                "apply_on",
                "price_or_product_discount",
                "rate_or_discount",
                "discount_percentage",
                "discount_amount",
                "rate",
                "coupon_code_based",
                "company",
                "customer",
                "customer_group",
                "territory",
                "campaign",
                "sales_partner",
                "valid_from",
                "valid_upto",
                "for_price_list",
                "currency",
                "warehouse",
                "min_qty",
                "max_qty",
                "min_amt",
                "max_amt",
                "mixed_conditions",
                "is_cumulative",
                "apply_rule_on_other",
                "condition",
                "priority",
            ],
        ) or []

        if not rules:
            return out

        coupon_linked_rules = set()
        for coupon_row in frappe.get_all("Coupon Code", fields=["pricing_rule"]) or []:
            coupon_linked_name = str(coupon_row.get("pricing_rule") or "").strip()
            if coupon_linked_name:
                coupon_linked_rules.add(coupon_linked_name)

        check_date = frappe.utils.getdate(
            invoice_doc.get("posting_date") or frappe.utils.today()
        )
        inv_company = str(invoice_doc.get("company") or "").strip()
        inv_price_list = str(invoice_doc.get("selling_price_list") or "").strip()
        inv_currency = str(invoice_doc.get("currency") or "").strip()
        inv_customer = str(invoice_doc.get("customer") or "").strip()
        inv_campaign = str(invoice_doc.get("campaign") or "").strip()
        inv_sales_partner = str(invoice_doc.get("sales_partner") or "").strip()

        inv_customer_group = str(invoice_doc.get("customer_group") or "").strip()
        inv_territory = str(invoice_doc.get("territory") or "").strip()
        if inv_customer and (not inv_customer_group or not inv_territory):
            customer_row = frappe.db.get_value(
                "Customer",
                inv_customer,
                ["customer_group", "territory"],
                as_dict=True,
            ) or {}
            if not inv_customer_group:
                inv_customer_group = str(customer_row.get("customer_group") or "").strip()
            if not inv_territory:
                inv_territory = str(customer_row.get("territory") or "").strip()

        # Customer Group and its parents (a rule on a parent group applies).
        customer_group_chain = []
        walk_value = inv_customer_group
        walk_depth = 0
        while walk_value and walk_depth < 30 and walk_value not in customer_group_chain:
            customer_group_chain.append(walk_value)
            walk_value = str(
                frappe.db.get_value("Customer Group", walk_value, "parent_customer_group") or ""
            ).strip()
            walk_depth = walk_depth + 1

        # Territory and its parents.
        territory_chain = []
        walk_value = inv_territory
        walk_depth = 0
        while walk_value and walk_depth < 30 and walk_value not in territory_chain:
            territory_chain.append(walk_value)
            walk_value = str(
                frappe.db.get_value("Territory", walk_value, "parent_territory") or ""
            ).strip()
            walk_depth = walk_depth + 1

        valid_rules = []
        unsupported_rules = {}

        for rule in rules:
            rule_name = str(rule.get("name") or "").strip()
            if not rule_name:
                continue
            if frappe.utils.cint(rule.get("coupon_code_based") or 0) == 1:
                continue
            if rule_name in coupon_linked_rules:
                continue
            if str(rule.get("price_or_product_discount") or "").strip() not in ("", "Price"):
                continue

            rule_company = str(rule.get("company") or "").strip()
            if rule_company and rule_company != inv_company:
                continue
            if rule.get("valid_from") and check_date < frappe.utils.getdate(rule.get("valid_from")):
                continue
            if rule.get("valid_upto") and check_date > frappe.utils.getdate(rule.get("valid_upto")):
                continue

            rule_price_list = str(rule.get("for_price_list") or "").strip()
            if rule_price_list and rule_price_list != inv_price_list:
                continue
            rule_currency = str(rule.get("currency") or "").strip()
            if rule_currency and rule_currency != inv_currency:
                continue

            rule_customer = str(rule.get("customer") or "").strip()
            if rule_customer and rule_customer != inv_customer:
                continue
            rule_customer_group = str(rule.get("customer_group") or "").strip()
            if rule_customer_group and rule_customer_group not in customer_group_chain:
                continue
            rule_territory = str(rule.get("territory") or "").strip()
            if rule_territory and rule_territory not in territory_chain:
                continue
            rule_campaign = str(rule.get("campaign") or "").strip()
            if rule_campaign and rule_campaign != inv_campaign:
                continue
            rule_sales_partner = str(rule.get("sales_partner") or "").strip()
            if rule_sales_partner and rule_sales_partner != inv_sales_partner:
                continue

            if (
                str(rule.get("condition") or "").strip()
                or frappe.utils.cint(rule.get("apply_rule_on_other") or 0) == 1
                or str(rule.get("apply_rule_on_other") or "").strip() not in ("", "0")
                or frappe.utils.cint(rule.get("is_cumulative") or 0) == 1
            ):
                unsupported_rules[rule_name] = rule
                continue

            valid_rules.append(rule)

        # Child rows (Item Code / Item Group / Brand) for the valid rules.
        child_rows = {}
        valid_rule_names = []
        for rule in valid_rules:
            valid_rule_names.append(str(rule.get("name") or "").strip())

        if valid_rule_names:
            child_configs = [
                {"doctype": "Pricing Rule Item Code", "field": "item_code"},
                {"doctype": "Pricing Rule Item Group", "field": "item_group"},
                {"doctype": "Pricing Rule Brand", "field": "brand"},
            ]
            for child_config in child_configs:
                for child in frappe.get_all(
                    child_config["doctype"],
                    filters={"parent": ["in", valid_rule_names]},
                    fields=["parent", child_config["field"], "uom"],
                ) or []:
                    child_parent = str(child.get("parent") or "").strip()
                    child_value = str(child.get(child_config["field"]) or "").strip()
                    if not child_parent or not child_value:
                        continue
                    if child_parent not in child_rows:
                        child_rows[child_parent] = []
                    child_rows[child_parent].append({
                        "value": child_value,
                        "uom": str(child.get("uom") or "").strip(),
                    })

        # Item master data (brand, group chain, template) once per item code.
        item_info = {}
        for item in work_items:
            item_code = str(item.get("item_code") or "").strip()
            if item_code in item_info:
                continue
            item_row = frappe.db.get_value(
                "Item",
                item_code,
                ["brand", "item_group", "variant_of"],
                as_dict=True,
            ) or {}
            group_chain = []
            walk_value = str(item_row.get("item_group") or item.get("item_group") or "").strip()
            walk_depth = 0
            while walk_value and walk_depth < 30 and walk_value not in group_chain:
                group_chain.append(walk_value)
                walk_value = str(
                    frappe.db.get_value("Item Group", walk_value, "parent_item_group") or ""
                ).strip()
                walk_depth = walk_depth + 1
            item_info[item_code] = {
                "brand": str(item_row.get("brand") or item.get("brand") or "").strip(),
                "variant_of": str(item_row.get("variant_of") or "").strip(),
                "group_chain": group_chain,
            }

        by_item = {}
        candidates_by_item = {}

        for rule in valid_rules:
            rule_name = str(rule.get("name") or "").strip()
            rows = child_rows.get(rule_name) or []
            if not rows:
                continue

            apply_on = str(rule.get("apply_on") or "").strip()
            rule_warehouse = str(rule.get("warehouse") or "").strip()
            matches = []

            for item in work_items:
                item_code = str(item.get("item_code") or "").strip()
                info = item_info.get(item_code) or {}
                item_uom = str(item.get("uom") or item.get("stock_uom") or "").strip()
                item_warehouse = str(
                    item.get("warehouse") or invoice_doc.get("set_warehouse") or ""
                ).strip()

                if rule_warehouse and rule_warehouse != item_warehouse:
                    continue

                candidates = []
                if apply_on == "Item Code":
                    candidates.append(item_code)
                    if info.get("variant_of"):
                        candidates.append(info.get("variant_of"))
                elif apply_on == "Item Group":
                    candidates = info.get("group_chain") or []
                elif apply_on == "Brand":
                    if info.get("brand"):
                        candidates.append(info.get("brand"))

                matched = False
                uom_bound = False
                for child in rows:
                    if child["value"] not in candidates:
                        continue
                    if child["uom"] and child["uom"] != item_uom:
                        continue
                    matched = True
                    uom_bound = True if child["uom"] else False
                    break

                if not matched:
                    continue

                item_plr = frappe.utils.flt(item.get("price_list_rate") or item.get("rate") or 0)
                item_qty = frappe.utils.flt(item.get("qty") or 0)
                item_cf = frappe.utils.flt(item.get("conversion_factor") or 1) or 1.0
                if uom_bound:
                    rule_qty = item_qty
                else:
                    rule_qty = frappe.utils.flt(item.get("stock_qty") or 0) or (item_qty * item_cf)

                matches.append({
                    "key": item.get("name") or str(item.get("idx") or "") or item_code,
                    "qty": rule_qty,
                    "amount": item_plr * item_qty,
                    "plr": item_plr,
                    "cf": item_cf,
                    "uom_bound": uom_bound,
                })

            if not matches:
                continue

            min_qty = frappe.utils.flt(rule.get("min_qty") or 0)
            max_qty = frappe.utils.flt(rule.get("max_qty") or 0)
            min_amt = frappe.utils.flt(rule.get("min_amt") or 0)
            max_amt = frappe.utils.flt(rule.get("max_amt") or 0)

            passing = []
            if frappe.utils.cint(rule.get("mixed_conditions") or 0) == 1:
                total_rule_qty = 0.0
                total_rule_amt = 0.0
                for match in matches:
                    total_rule_qty = total_rule_qty + match["qty"]
                    total_rule_amt = total_rule_amt + match["amount"]
                if (
                    (not min_qty or total_rule_qty >= min_qty)
                    and (not max_qty or total_rule_qty <= max_qty)
                    and (not min_amt or total_rule_amt >= min_amt)
                    and (not max_amt or total_rule_amt <= max_amt)
                ):
                    passing = matches
            else:
                for match in matches:
                    if min_qty and match["qty"] < min_qty:
                        continue
                    if max_qty and match["qty"] > max_qty:
                        continue
                    if min_amt and match["amount"] < min_amt:
                        continue
                    if max_amt and match["amount"] > max_amt:
                        continue
                    passing.append(match)

            rate_or_discount = str(rule.get("rate_or_discount") or "").strip()
            rule_priority = frappe.utils.cint(rule.get("priority") or 0)

            for match in passing:
                match_plr = match["plr"]
                pct = 0.0
                if rate_or_discount in ("", "Discount Percentage"):
                    pct = frappe.utils.flt(rule.get("discount_percentage") or 0)
                elif rate_or_discount == "Discount Amount":
                    if match_plr > 0:
                        pct = (frappe.utils.flt(rule.get("discount_amount") or 0) / match_plr) * 100.0
                elif rate_or_discount == "Rate":
                    rule_rate = frappe.utils.flt(rule.get("rate") or 0)
                    if not match["uom_bound"]:
                        rule_rate = rule_rate * match["cf"]
                    if match_plr > 0 and rule_rate > 0 and rule_rate < match_plr:
                        pct = ((match_plr - rule_rate) / match_plr) * 100.0

                if pct > 100.0:
                    pct = 100.0
                if pct <= 0.0:
                    continue

                # Retain every eligible rate for source identification. Example:
                # an old native 10% rate must not be considered manual merely
                # because a newly selected coupon offers 20%.
                if match["key"] not in candidates_by_item:
                    candidates_by_item[match["key"]] = []
                candidates_by_item[match["key"]].append({
                    "pct": pct,
                    "rule": rule_name,
                })

                current = by_item.get(match["key"])
                if (
                    not current
                    or pct > current["pct"]
                    or (pct == current["pct"] and rule_priority > current["priority"])
                ):
                    by_item[match["key"]] = {
                        "pct": pct,
                        "rule": rule_name,
                        "priority": rule_priority,
                    }

        # Rules that safe_exec cannot fully evaluate: honour them only when
        # ERPNext already stamped them on this item (JSON like ["PRLE-0006"]
        # or a plain comma list), so a stale/expired/coupon rule cannot leak.
        if unsupported_rules:
            detail_rows = invoice_doc.get("pricing_rules") or []
            for item in work_items:
                item_key = item.get("name") or str(item.get("idx") or "") or str(item.get("item_code") or "")
                stamped_text = str(item.get("pricing_rules") or "").strip()

                for detail_row in detail_rows:
                    detail_rule = str(detail_row.get("pricing_rule") or "").strip()
                    if not detail_rule:
                        continue
                    detail_child = str(detail_row.get("child_docname") or "").strip()
                    detail_item_code = str(detail_row.get("item_code") or "").strip()
                    if (
                        (detail_child and detail_child == str(item.get("name") or ""))
                        or (not detail_child and detail_item_code == str(item.get("item_code") or ""))
                    ):
                        stamped_text = stamped_text + "," + detail_rule

                if stamped_text.startswith("[") and stamped_text.endswith("]"):
                    stamped_text = stamped_text[1:-1]
                stamped_text = stamped_text.replace("[", ",").replace("]", ",")

                item_plr = frappe.utils.flt(item.get("price_list_rate") or item.get("rate") or 0)
                item_cf = frappe.utils.flt(item.get("conversion_factor") or 1) or 1.0

                for part in stamped_text.replace("\n", ",").split(","):
                    stamped_name = str(part or "").strip().strip('"').strip("'").strip()
                    if not stamped_name or stamped_name not in unsupported_rules:
                        continue
                    rule = unsupported_rules[stamped_name]
                    rate_or_discount = str(rule.get("rate_or_discount") or "").strip()
                    pct = 0.0
                    if rate_or_discount in ("", "Discount Percentage"):
                        pct = frappe.utils.flt(rule.get("discount_percentage") or 0)
                    elif rate_or_discount == "Discount Amount":
                        if item_plr > 0:
                            pct = (frappe.utils.flt(rule.get("discount_amount") or 0) / item_plr) * 100.0
                    elif rate_or_discount == "Rate":
                        rule_rate = frappe.utils.flt(rule.get("rate") or 0) * item_cf
                        if item_plr > 0 and rule_rate > 0 and rule_rate < item_plr:
                            pct = ((item_plr - rule_rate) / item_plr) * 100.0
                    if pct > 100.0:
                        pct = 100.0
                    if pct <= 0.0:
                        continue
                    if item_key not in candidates_by_item:
                        candidates_by_item[item_key] = []
                    candidates_by_item[item_key].append({
                        "pct": pct,
                        "rule": stamped_name,
                    })
                    rule_priority = frappe.utils.cint(rule.get("priority") or 0)
                    current = by_item.get(item_key)
                    if not current or pct > current["pct"]:
                        by_item[item_key] = {
                            "pct": pct,
                            "rule": stamped_name,
                            "priority": rule_priority,
                        }

        out["by_item"] = by_item
        out["candidates_by_item"] = candidates_by_item

    except Exception as native_error:
        out["by_item"] = {}
        out["candidates_by_item"] = {}
        out["error"] = str(native_error)

    return out


# =========================================================================
# POS VAT/HLW COUPON RULE REFERENCE CLEANUP — BEFORE SCRIPT-LOCAL RECALCULATION
# =========================================================================
# POS Awesome can send pricing_rules values prefilled on the item. The VAT/HLW
# coupon rule IDs are NOT genuine independent, non-coupon item rules; leaving
# overlapping rules on item.pricing_rules can make ERPNext load unchosen
# coupons. Preserve every other Pricing Rule reference, including native rules.
# This takes effect ONLY when this Before Save event is actually reached.
if is_pos_context and doc.get("items"):
    vat_coupon_rule_names = set()
    for vat_code_for_cleanup in ("VAT26", "VATCD", "HLW15", "HLW10"):
        vat_rule_for_cleanup = frappe.db.get_value(
            "Coupon Code",
            {"coupon_code": vat_code_for_cleanup},
            "pricing_rule",
        )
        if vat_rule_for_cleanup:
            vat_coupon_rule_names.add(str(vat_rule_for_cleanup).strip())

    if vat_coupon_rule_names:
        for vat_item_for_cleanup in doc.get("items") or []:
            vat_old_rules = str(vat_item_for_cleanup.get("pricing_rules") or "").strip()
            if not vat_old_rules:
                continue
            vat_clean_text = vat_old_rules.replace("[", ",").replace("]", ",")
            vat_clean_text = vat_clean_text.replace('"', "").replace("'", "")
            vat_remaining_rules = []
            vat_removed_a_rule = False
            for vat_rule_part in vat_clean_text.split(","):
                vat_rule_part = str(vat_rule_part or "").strip()
                if vat_rule_part in vat_coupon_rule_names:
                    vat_removed_a_rule = True
                elif vat_rule_part and vat_rule_part not in vat_remaining_rules:
                    vat_remaining_rules.append(vat_rule_part)
            if vat_removed_a_rule:
                vat_item_for_cleanup.pricing_rules = ",".join(vat_remaining_rules)

# =========================================================================
# STEP 1: Validate loyalty coupons against Customer Group
# =========================================================================
if doc.customer:
    applied_codes = []
    selected_payment_pair_coupon_key = str(doc.get("coupon_code") or "").strip().lower()

    if doc.get("coupon_code"):
        applied_codes.append(str(doc.coupon_code or "").strip().lower())

    for row in doc.get("posa_coupons") or []:
        if row.get("applied"):
            c = row.get("coupon") or row.get("coupon_code") or ""
            if c:
                c_key = str(c).strip().lower()

                # VAT26/VATCD and HLW15/HLW10 are payment-restricted coupon
                # pairs. Never validate an unchosen row marked applied by POS.
                if c_key in ("vat26", "vatcd", "hlw15", "hlw10") and selected_payment_pair_coupon_key in ("vat26", "vatcd", "hlw15", "hlw10"):
                    if c_key == selected_payment_pair_coupon_key:
                        applied_codes.append(c_key)
                else:
                    applied_codes.append(c_key)

    for row in doc.get("posa_offers") or []:
        if row.get("applied"):
            offer = str(row.get("offer") or row.get("name") or "").strip().lower()
            if "loyalcs2" in offer or "loyal cs2" in offer:
                applied_codes.append("loyalcs2")
            elif "loyalcs" in offer or "loyal cs" in offer:
                applied_codes.append("loyalcs")
            elif "cos20" in offer:
                applied_codes.append("cos20")
            elif "cos5" in offer or ("cash" in offer and "5%" in offer):
                applied_codes.append("cos5")
            elif "julyv20" in offer:
                applied_codes.append("julyv20")
            elif "pd10" in offer:
                applied_codes.append("pd10")
            elif "pd5" in offer:
                applied_codes.append("pd5")
            # F2F15 / F2F25 are intentionally NOT taken from POS Offer rows.
            # Both can auto-match the same Palmers brand; only coupon_code or an
            # applied POS Coupon Detail row counts as cashier selection.
            elif "codho05" in offer:
                applied_codes.append("codho05")
            # VAT26/VATCD and HLW15/HLW10 are intentionally NOT taken from
            # posa_offers; only an actual coupon selection counts.

    for code in applied_codes:
        if (
            code == "f2f15"
            and payment_chosen
            and str(effective_payment_type or "").strip().upper() not in f2f15_allowed_payment_types
        ):
            doc.coupon_code = ""
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'F2F15' is strictly valid only for <u>KOKO</u> or <u>MintPay</u> payments.",
                title="Invalid Payment Method",
            )

        if (
            code == "f2f25"
            and payment_chosen
            and str(effective_payment_type or "").strip().upper() in f2f25_blocked_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'F2F25' cannot be used with <u>KOKO</u> or <u>MintPay</u>. Only <b>F2F15</b> is allowed for these payment methods.",
                title="Invalid Payment Method",
            )

        if code in ("loyalcs",) and customer_group != "gold":
            frappe.throw(
                msg="<b>Coupon Rejected:</b> Coupon 'LOYALCS' is only valid for Gold customers. This customer is not in the Gold group.",
                title="Invalid Coupon",
            )
        if code in ("loyalcs2",) and customer_group != "platinum":
            frappe.throw(
                msg="<b>Coupon Rejected:</b> Coupon 'LOYALCS2' is only valid for Platinum customers. This customer is not in the Platinum group.",
                title="Invalid Coupon",
            )
        if code in ("cos5",) and customer_group in ("gold", "platinum"):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'COS5' does not apply to Gold/Platinum customers. The loyalty discount for this customer group applies automatically.",
                title="Invalid Coupon",
            )
        if (
            code in ("cos5",)
            and payment_chosen
            and effective_payment_type not in allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'COS5' is strictly valid only for <u>Cash On Delivery</u>, <u>Cash</u>, or <u>Bank Transfer</u> orders. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("cos20",)
            and payment_chosen
            and effective_payment_type not in cos20_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'COS20' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("pd10",)
            and payment_chosen
            and effective_payment_type not in pd10_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'PD10' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("pd5",)
            and payment_chosen
            and effective_payment_type not in pd5_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'PD5' is strictly valid only for <u>Credit Card</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("vat26",)
            and payment_chosen
            and effective_payment_type not in vat26_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'VAT26' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("vatcd",)
            and payment_chosen
            and effective_payment_type not in vatcd_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'VATCD' is strictly valid only for <u>Credit Card</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code == "hlw15"
            and payment_chosen
            and effective_payment_type not in hlw15_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'HLW15' is valid only for <u>Cash</u> or <u>Bank Transfer</u> payments.",
                title="Invalid Payment Method",
            )
        if (
            code == "hlw10"
            and payment_chosen
            and effective_payment_type not in hlw10_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'HLW10' is valid only for <u>Credit Card</u> payments.",
                title="Invalid Payment Method",
            )
        if code in ("codho05",):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'CODHO05' is not valid on this site. Use coupon <b>COS5</b> for cash payment discounts.",
                title="Invalid Coupon",
            )


# =========================================================================
# STEP 2: COS5 — Cash, Cash On Delivery, or Bank Transfer only
# =========================================================================
if (
    str(doc.coupon_code) == "COS5"
    and payment_chosen
    and effective_payment_type not in allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'COS5' is strictly valid only for <u>Cash On Delivery</u>, <u>Cash</u>, or <u>Bank Transfer</u> orders. Please switch the payment type or clear the coupon code to proceed.",
        title="Invalid Payment Method",
    )


# =========================================================================
# COS20 — Cash or Bank Transfer only
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "COS20"
    and payment_chosen
    and effective_payment_type not in cos20_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'COS20' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
        title="Invalid Payment Method",
    )


# =========================================================================
# PD10 — Cash or Bank Transfer only
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "PD10"
    and payment_chosen
    and effective_payment_type not in pd10_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'PD10' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
        title="Invalid Payment Method",
    )


# =========================================================================
# PD5 — Credit Card only
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "PD5"
    and payment_chosen
    and effective_payment_type not in pd5_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'PD5' is strictly valid only for <u>Credit Card</u> payments. Please switch the payment type or clear the coupon code to proceed.",
        title="Invalid Payment Method",
    )


# =========================================================================
# VAT26 — Cash or Bank Transfer only
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "VAT26"
    and payment_chosen
    and effective_payment_type not in vat26_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'VAT26' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
        title="Invalid Payment Method",
    )


# =========================================================================
# VATCD — Credit Card only
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "VATCD"
    and payment_chosen
    and effective_payment_type not in vatcd_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'VATCD' is strictly valid only for <u>Credit Card</u> payments. Please switch the payment type or clear the coupon code to proceed.",
        title="Invalid Payment Method",
    )


# =========================================================================
# HLW15 — Cash or Bank Transfer only
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "HLW15"
    and payment_chosen
    and effective_payment_type not in hlw15_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'HLW15' is valid only for <u>Cash</u> or <u>Bank Transfer</u> payments.",
        title="Invalid Payment Method",
    )


# =========================================================================
# HLW10 — Credit Card only
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "HLW10"
    and payment_chosen
    and effective_payment_type not in hlw10_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'HLW10' is valid only for <u>Credit Card</u> payments.",
        title="Invalid Payment Method",
    )


# =========================================================================
# F2F15 — KOKO / MintPay only
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "F2F15"
    and payment_chosen
    and str(effective_payment_type or "").strip().upper() not in f2f15_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    doc.discount_amount = 0.0
    doc.base_discount_amount = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'F2F15' is strictly valid only for <u>KOKO</u> or <u>MintPay</u> payments.",
        title="Invalid Payment Method",
    )


# =========================================================================
# F2F25 — blocked on KOKO / MintPay
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "F2F25"
    and payment_chosen
    and str(effective_payment_type or "").strip().upper() in f2f25_blocked_payment_types
):
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'F2F25' cannot be used with <u>KOKO</u> or <u>MintPay</u>. Only <b>F2F15</b> is allowed for these payment methods.",
        title="Invalid Payment Method",
    )


# Use the same context predicate for the POS branch as the early protection.
# A POS draft may not have every POS Profile field populated yet.
is_pos_sale = is_pos_context
normal_invoice_coupon_code = str(doc.coupon_code or "").strip()

# IMPORTANT:
# For a normal Sales Invoice with a selected coupon, this Server Script handles
# Pricing Rule selection itself. Lock ERPNext native Pricing Rule reapplication
# BEFORE any earlier calculate_taxes_and_totals() call in this script.
#
# Without this early lock, the Non-Tax Invoice tax-cleanup block below can call
# calculate_taxes_and_totals() while ignore_pricing_rule is still 0, causing
# ERPNext to evaluate overlapping coupon rules (for example PRLE-0018 and
# PRLE-0021) and throw MultiplePricingRuleConflict before our custom validation
# gets a chance to filter them.
if not is_pos_sale and normal_invoice_coupon_code:
    doc.ignore_pricing_rule = 1

# Tax Invoice only: fetch MRP from the "Standard Selling" Price List.
# Does not affect price_list_rate, rate, discounts, coupons, or POS logic.
if doc.get("custom_tax_invoice") and not is_pos_sale and doc.items:
    for item in doc.items:
        mrp_rate = frappe.db.get_value(
            "Item Price",
            {
                "item_code": item.item_code,
                "price_list": "Standard Selling"
            },
            "price_list_rate"
        )
        item.custom_mrp = frappe.utils.flt(mrp_rate or 0.0)

# Non-Tax Invoice only:
# Remove each item's Item Tax Template and remove only the tax rows that
# came from those Item Tax Templates. Other unrelated tax rows are untouched.
if not doc.get("custom_tax_invoice") and not is_pos_sale and doc.items:
    item_tax_accounts = set()

    for item in doc.items:
        item_tax_template = str(item.get("item_tax_template") or "").strip()

        if item_tax_template:
            template_doc = frappe.get_doc(
                "Item Tax Template",
                item_tax_template
            )

            for tax_detail in template_doc.get("taxes") or []:
                tax_account = str(
                    tax_detail.get("tax_type") or ""
                ).strip()

                if tax_account:
                    item_tax_accounts.add(tax_account)

            item.item_tax_template = ""

    if item_tax_accounts and doc.get("taxes"):
        for tax_row in list(doc.get("taxes") or []):
            if str(tax_row.get("account_head") or "").strip() in item_tax_accounts:
                doc.remove(tax_row)

        doc.calculate_taxes_and_totals()

if not is_pos_sale:
    for row in list(doc.get("posa_coupons") or []):
        doc.remove(row)
    for row in doc.get("posa_offers") or []:
        row.applied = 0

    # =========================================================================
    # KOKO / MintPay restriction for normal Sales Invoices
    # F2F15 is the ONLY coupon/discount allowed for KOKO or MintPay.
    # Every other coupon, Pricing Rule discount and manual discounted rate remains blocked.
    # =========================================================================
    if str(effective_payment_type).strip().upper() in ("KOKO", "MINTPAY"):
        normal_coupon_key = str(normal_invoice_coupon_code or "").strip().upper()

        if normal_coupon_key and normal_coupon_key != "F2F15":
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> Only coupon <b>F2F15</b> is allowed for <u>KOKO</u> or <u>MintPay</u> payments.",
                title="Invalid Payment Method",
            )

        # Disable ERPNext native Pricing Rules for KOKO/MintPay. If F2F15 is
        # selected, the custom coupon logic below applies that coupon only.
        doc.ignore_pricing_rule = 1

        if normal_coupon_key != "F2F15":
            normal_invoice_coupon_code = ""

            if doc.items:
                for item in doc.items:
                    price_list_rate = float(item.price_list_rate or item.rate or 0.0)
                    item_qty = float(item.qty or 0.0)

                    item.discount_percentage = 0.0
                    item.discount_amount = 0.0
                    item.base_discount_amount = 0.0
                    item.pricing_rules = ""
                    item.margin_type = ""
                    item.margin_rate_or_amount = 0.0

                    item.rate = price_list_rate
                    item.amount = price_list_rate * item_qty
                    item.base_rate = price_list_rate
                    item.base_amount = item.amount
                    item.net_rate = price_list_rate
                    item.net_amount = item.amount
                    item.base_net_rate = price_list_rate
                    item.base_net_amount = item.amount

            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0
            doc.calculate_taxes_and_totals()

    # =========================================================================
    # NORMAL SALES INVOICE COUPON LOGIC
    # Desk / non-POS only. Uses Coupon Code -> Pricing Rule discount %.
    # =========================================================================
    if normal_invoice_coupon_code:
        coupon_code = normal_invoice_coupon_code
        coupon_key = coupon_code.strip().lower()

        doc.coupon_code = coupon_code

        if coupon_key == "loyalcs" and customer_group != "gold":
            doc.coupon_code = ""
            frappe.throw(
                msg="<b>Coupon Rejected:</b> Coupon 'LOYALCS' is only valid for Gold customers. This customer is not in the Gold group.",
                title="Invalid Coupon",
            )

        if coupon_key == "loyalcs2" and customer_group != "platinum":
            doc.coupon_code = ""
            frappe.throw(
                msg="<b>Coupon Rejected:</b> Coupon 'LOYALCS2' is only valid for Platinum customers. This customer is not in the Platinum group.",
                title="Invalid Coupon",
            )

        if (
            coupon_key == "cos5"
            and payment_chosen
            and effective_payment_type not in allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'COS5' is strictly valid only for <u>Cash On Delivery</u>, <u>Cash</u>, or <u>Bank Transfer</u> orders.",
                title="Invalid Payment Method",
            )

        if (
            coupon_key == "cos20"
            and payment_chosen
            and effective_payment_type not in cos20_allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'COS20' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments.",
                title="Invalid Payment Method",
            )

        if (
            coupon_key == "pd10"
            and payment_chosen
            and effective_payment_type not in pd10_allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'PD10' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments.",
                title="Invalid Payment Method",
            )

        if (
            coupon_key == "pd5"
            and payment_chosen
            and effective_payment_type not in pd5_allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'PD5' is strictly valid only for <u>Credit Card</u> payments.",
                title="Invalid Payment Method",
            )

        if (
            coupon_key == "vat26"
            and payment_chosen
            and effective_payment_type not in vat26_allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'VAT26' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments.",
                title="Invalid Payment Method",
            )

        if (
            coupon_key == "vatcd"
            and payment_chosen
            and effective_payment_type not in vatcd_allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'VATCD' is strictly valid only for <u>Credit Card</u> payments.",
                title="Invalid Payment Method",
            )

        if (
            coupon_key == "hlw15"
            and payment_chosen
            and effective_payment_type not in hlw15_allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'HLW15' is valid only for <u>Cash</u> or <u>Bank Transfer</u> payments.",
                title="Invalid Payment Method",
            )

        if (
            coupon_key == "hlw10"
            and payment_chosen
            and effective_payment_type not in hlw10_allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'HLW10' is valid only for <u>Credit Card</u> payments.",
                title="Invalid Payment Method",
            )

        if coupon_key == "cos5" and customer_group in ("gold", "platinum"):
            doc.coupon_code = ""
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'COS5' does not apply to Gold/Platinum customers.",
                title="Invalid Coupon",
            )

        coupon_pct = 0.0

        # KOKO / MintPay restriction for normal Sales Invoices only.
        # F2F15 is the only coupon allowed for these two payment methods.
        if (
            str(effective_payment_type).strip().upper() in ("KOKO", "MINTPAY")
            and coupon_key != "f2f15"
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> Only coupon <b>F2F15</b> is allowed for <u>KOKO</u> or <u>MintPay</u> payments.",
                title="Invalid Payment Method",
            )

        coupon = frappe.db.get_value(
            "Coupon Code",
            {"coupon_code": coupon_code},
            ["name", "pricing_rule"],
            as_dict=True,
        )

        coupon_pricing_rule = None
        if coupon and coupon.get("pricing_rule"):
            coupon_pricing_rule = coupon.get("pricing_rule")
            pr = frappe.db.get_value(
                "Pricing Rule",
                coupon_pricing_rule,
                ["discount_percentage", "discount_amount"],
                as_dict=True,
            )

            if pr:
                coupon_pct = float(pr.get("discount_percentage") or 0.0)

        # Only items matching the coupon's own Pricing Rule condition (Brand /
        # Item Code / Item Group) get the coupon discount. Rules configured as
        # "Transaction" remain whole-cart/unrestricted.
        coupon_restricted = False
        coupon_eligible_keys = set()

        if coupon_pricing_rule and coupon_pct > 0.0:
            eligibility = get_coupon_pricing_rule_eligible_keys(
                coupon_pricing_rule,
                doc.items or [],
                coupon_code=doc.coupon_code,
                invoice_doc=doc
            )
            coupon_restricted = eligibility["restricted"]
            coupon_eligible_keys = eligibility["eligible_keys"]

            if not eligibility.get("valid"):
                coupon_pct = 0.0


        # =====================================================================
        # NORMAL SALES INVOICE: verify genuine non-coupon Pricing Rules.
        # =====================================================================
        # The old implementation used frappe.get_attr() to call ERPNext's
        # internal pricing functions. frappe.get_attr() is NOT exposed to
        # Server Script safe_exec, so the exception path silently discarded
        # every native rule and made old 10% rule rates look manually edited.
        #
        # Reuse the same safe_exec-compatible, direct Pricing Rule evaluator
        # used by POS. It checks the item/rule eligibility and excludes every
        # Coupon Code-linked Pricing Rule BEFORE comparing percentages.
        native_pricing_rule_pct_map = {}
        native_pricing_rule_name_map = {}
        native_rule_candidates_by_item = {}

        if not ogf_price_list_restricted:
            native_lookup = get_native_pricing_rule_map(doc.items or [], doc)
            native_by_item = native_lookup.get("by_item") or {}
            native_rule_candidates_by_item = (
                native_lookup.get("candidates_by_item") or {}
            )

            if native_lookup.get("error"):
                try:
                    frappe.log_error(
                        title="Normal Invoice Pricing Rule Lookup Failed",
                        message=str(native_lookup.get("error")),
                    )
                except Exception:
                    pass
                # Never save an incorrect invoice by silently falling back to
                # treating every old discounted rate as a manual override.
                frappe.throw(
                    msg="Cannot verify item Pricing Rules, so this invoice was not saved. "
                        + "Check the Error Log for 'Normal Invoice Pricing Rule Lookup Failed'.",
                    title="Pricing Rule Lookup Failed",
                )

            for native_key in native_by_item:
                native_entry = native_by_item[native_key]
                native_pct = frappe.utils.flt(native_entry.get("pct") or 0)
                native_name = str(native_entry.get("rule") or "").strip()
                if native_pct > 0.0 and native_name:
                    native_pricing_rule_pct_map[native_key] = native_pct
                    native_pricing_rule_name_map[native_key] = native_name

        # KOKO / MintPay may use F2F15 only. Even if a normal Pricing Rule was
        # discovered above, it must not compete with F2F15 on these payments.
        if str(effective_payment_type).strip().upper() in ("KOKO", "MINTPAY"):
            native_pricing_rule_pct_map = {}
            native_pricing_rule_name_map = {}
            native_rule_candidates_by_item = {}

        # =====================================================================
        # MANUAL RATE EDIT SUPPORT
        #
        # Capture the previous saved row rates so a genuine user Rate edit can be
        # distinguished from a rate produced by the coupon / Pricing Rule logic.
        #
        # Manual Rate wins for that item. Coupon/payment eligibility is still
        # validated normally; we simply do not overwrite an explicitly edited Rate.
        # =====================================================================
        previous_item_rate_map = {}
        previous_item_rule_map = {}
        previous_item_discount_map = {}
        previous_item_price_list_rate_map = {}

        try:
            previous_rate_doc = doc.get_doc_before_save()
        except Exception:
            previous_rate_doc = None

        if previous_rate_doc:
            for previous_item in previous_rate_doc.get("items") or []:
                previous_key = (
                    previous_item.name
                    or str(previous_item.idx or "")
                    or str(previous_item.item_code or "")
                )

                previous_item_rate_map[previous_key] = frappe.utils.flt(
                    previous_item.rate or 0
                )
                previous_item_rule_map[previous_key] = str(
                    previous_item.pricing_rules or ""
                ).strip()
                previous_item_discount_map[previous_key] = frappe.utils.flt(
                    previous_item.discount_percentage or 0
                )
                previous_item_price_list_rate_map[previous_key] = frappe.utils.flt(
                    previous_item.price_list_rate
                    or previous_item.rate
                    or 0
                )

        # =====================================================================
        # Calculate every item from a clean base.
        #
        # Existing item.discount_percentage is intentionally ignored.
        #
        # Eligible item:
        #   max(valid normal Pricing Rule %, selected coupon %)
        #
        # Ineligible item:
        #   valid normal Pricing Rule % only
        # =====================================================================
        final_item_pct_map = {}
        final_item_rule_map = {}
        final_item_rate_map = {}
        final_item_manual_map = {}

        running_total = 0.0
        running_base_total = 0.0

        if doc.items:
            for item in doc.items:
                item_key = item.name or str(item.idx or "") or str(item.item_code or "")
                price_list_rate = float(item.price_list_rate or item.rate or 0.0)
                item_qty = float(item.qty or 0.0)

                normal_rule_pct = float(
                    native_pricing_rule_pct_map.get(item_key) or 0.0
                )
                normal_rule_names = str(
                    native_pricing_rule_name_map.get(item_key) or ""
                ).strip()

                item_coupon_pct = coupon_pct

                if coupon_restricted and item_key not in coupon_eligible_keys:
                    item_coupon_pct = 0.0

                if normal_rule_pct > item_coupon_pct:
                    final_pct = normal_rule_pct
                    # Genuine non-coupon item Pricing Rule won. Preserve its
                    # reference so later saves can identify its discount source.
                    final_rule_names = normal_rule_names
                else:
                    final_pct = item_coupon_pct
                    # A coupon is identified by doc.coupon_code, not by storing
                    # its linked rule on the Sales Invoice Item. In particular,
                    # a transaction-wide coupon Pricing Rule cannot be processed
                    # by ERPNext v14's item-level update_pricing_rule_uom().
                    # Stamping that rule here causes validation to fail on the
                    # NEXT save (TypeError: NoneType is not iterable).
                    # Discount % / amount / rate are still saved per item.
                    final_rule_names = ""

                # -------------------------------------------------------------
                # MANUAL RATE DETECTION
                # -------------------------------------------------------------
                current_rate = frappe.utils.flt(item.rate or 0.0)

                expected_rule_rate = price_list_rate
                if final_pct > 0.0:
                    expected_rule_rate = price_list_rate * (1.0 - final_pct / 100.0)

                previous_rate = previous_item_rate_map.get(item_key)
                manual_rate_override = False

                # A valid non-coupon rule can have produced the current/saved
                # price even when ERPNext/POS Awesome stripped its rule reference
                # and discount_percentage. This is NOT a manual edit.
                # Compare against ALL independently verified rule candidates,
                # not just the highest percentage. Allow price rounding to cents.
                current_matches_native_rule = False
                previous_matches_native_rule = False
                previous_plr = frappe.utils.flt(
                    previous_item_price_list_rate_map.get(item_key)
                    or price_list_rate
                )
                for native_candidate in native_rule_candidates_by_item.get(item_key) or []:
                    candidate_pct = frappe.utils.flt(native_candidate.get("pct") or 0)
                    if candidate_pct <= 0:
                        continue
                    native_current_rate = price_list_rate * (1.0 - candidate_pct / 100.0)
                    native_previous_rate = previous_plr * (1.0 - candidate_pct / 100.0)
                    if abs(current_rate - native_current_rate) <= 0.02:
                        current_matches_native_rule = True
                    if previous_rate is not None and abs(previous_rate - native_previous_rate) <= 0.02:
                        previous_matches_native_rule = True

                # Existing row: manual Rate detection is strictly ITEM-WISE.
                #
                # A row is treated as manually edited only when THIS row's current
                # Rate differs from:
                #   1) its own previously-saved Rate,
                #   2) its own expected coupon/Pricing Rule Rate, and
                #   3) its own Price List Rate.
                #
                # The third check is important because ERPNext can temporarily reset
                # a different coupon-discounted row back to Price List Rate while
                # another row is being edited. That automatic reset must NOT be
                # mistaken for a manual edit on the coupon row.
                if previous_rate is not None:
                    previous_rules = str(
                        previous_item_rule_map.get(item_key) or ""
                    ).strip()
                    previous_discount = frappe.utils.flt(
                        previous_item_discount_map.get(item_key) or 0
                    )
                    previous_price_list_rate = frappe.utils.flt(
                        previous_item_price_list_rate_map.get(item_key)
                        or price_list_rate
                        or 0
                    )

                    # Case 1: the user changed THIS row's Rate during the current
                    # save/submit action.
                    if (
                        abs(current_rate - previous_rate) > 0.000001
                        and abs(current_rate - expected_rule_rate) > 0.000001
                        and abs(current_rate - price_list_rate) > 0.000001
                        and not current_matches_native_rule
                    ):
                        manual_rate_override = True

                    # Case 2: THIS row was ALREADY saved previously as a manual
                    # Rate. Preserve that manual state on later Save / Submit.
                    #
                    # A previously-saved manual row has:
                    # - no Pricing Rule stamped on it,
                    # - no Discount % stamped on it,
                    # - a Rate different from its own Price List Rate, and
                    # - a Rate different from the rate the current valid
                    #   coupon/Pricing Rule would calculate.
                    elif (
                        not previous_rules
                        and previous_discount == 0
                        and previous_rate > 0
                        and abs(previous_rate - previous_price_list_rate) > 0.000001
                        and abs(previous_rate - expected_rule_rate) > 0.000001
                        and not previous_matches_native_rule
                    ):
                        manual_rate_override = True
                        final_manual_saved_rate = previous_rate

                        # ERPNext may have altered item.rate while preparing Submit.
                        # Use the known saved manual value unless the user has made
                        # a new explicit manual edit in Case 1 above.
                        current_rate = final_manual_saved_rate

                # New/unsaved row: this check is also ITEM-WISE. When no Pricing
                # Rule is stamped on THIS row and its entered Rate differs from both
                # its Price List Rate and its own calculated rule result, preserve it
                # as a manual Rate.
                else:
                    existing_row_rules = str(item.pricing_rules or "").strip()
                    existing_row_pct = frappe.utils.flt(item.discount_percentage or 0)

                    if (
                        not existing_row_rules
                        and existing_row_pct == 0
                        and current_rate > 0
                        and abs(current_rate - price_list_rate) > 0.000001
                        and abs(current_rate - expected_rule_rate) > 0.000001
                        and not current_matches_native_rule
                    ):
                        manual_rate_override = True

                if manual_rate_override:
                    final_rate = current_rate

                    # Do not falsely label a manually-entered price as having been
                    # produced by a Pricing Rule.
                    final_display_pct = 0.0
                    final_display_rules = ""
                else:
                    final_rate = expected_rule_rate
                    final_display_pct = final_pct
                    final_display_rules = final_rule_names

                final_item_pct_map[item_key] = final_display_pct
                final_item_rule_map[item_key] = final_display_rules
                final_item_rate_map[item_key] = final_rate
                final_item_manual_map[item_key] = 1 if manual_rate_override else 0

                # Write the final discount as a real ERPNext item discount.
                # Rate still carries the net selling rate, while discount_amount
                # records the per-unit reduction from Price List Rate.
                final_unit_discount_amount = 0.0
                if final_display_pct > 0.0 and price_list_rate > final_rate:
                    final_unit_discount_amount = price_list_rate - final_rate

                item.discount_percentage = final_display_pct
                item.discount_amount = final_unit_discount_amount
                item.base_discount_amount = (
                    final_unit_discount_amount
                    * frappe.utils.flt(doc.get("conversion_rate") or 1)
                )
                item.pricing_rules = final_display_rules
                item.margin_type = ""
                item.margin_rate_or_amount = 0.0

                item.rate = final_rate
                item.amount = item.rate * item_qty
                item.base_rate = item.rate
                item.base_amount = item.amount
                item.net_rate = item.rate
                item.net_amount = item.amount
                item.base_net_rate = item.rate
                item.base_net_amount = item.amount

                running_total = running_total + (price_list_rate * item_qty)
                running_base_total = running_base_total + item.amount

            doc.total = running_total
            doc.base_total = running_total
            doc.net_total = running_base_total
            doc.base_net_total = running_base_total

            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0

            # This Server Script now owns the final item discounts while a coupon
            # is selected. Do not let ERPNext apply Pricing Rules again afterward.
            doc.ignore_pricing_rule = 1

            doc.calculate_taxes_and_totals()

            # calculate_taxes_and_totals() can rewrite item fields. Restore the exact
            # per-item results from our clean calculation instead of reading whatever
            # percentage/rule ERPNext left on the row.
            running_total = 0.0
            running_base_total = 0.0

            for item in doc.items or []:
                item_key = item.name or str(item.idx or "") or str(item.item_code or "")
                price_list_rate = float(item.price_list_rate or item.rate or 0.0)
                item_qty = float(item.qty or 0.0)

                final_pct = float(final_item_pct_map.get(item_key) or 0.0)
                final_rule_names = str(final_item_rule_map.get(item_key) or "").strip()
                final_rate = frappe.utils.flt(
                    final_item_rate_map.get(item_key)
                    if item_key in final_item_rate_map
                    else item.rate
                )

                final_unit_discount_amount = 0.0
                if final_pct > 0.0 and price_list_rate > final_rate:
                    final_unit_discount_amount = price_list_rate - final_rate

                item.discount_percentage = final_pct
                item.discount_amount = final_unit_discount_amount
                item.base_discount_amount = (
                    final_unit_discount_amount
                    * frappe.utils.flt(doc.get("conversion_rate") or 1)
                )
                item.pricing_rules = final_rule_names
                item.margin_type = ""
                item.margin_rate_or_amount = 0.0

                # Restore the exact rate chosen above. This is especially important
                # for manual Rate overrides because calculate_taxes_and_totals()
                # may otherwise rewrite the row.
                item.rate = final_rate
                item.amount = item.rate * item_qty
                item.base_rate = item.rate
                item.base_amount = item.amount
                item.net_rate = item.rate
                item.net_amount = item.amount
                item.base_net_rate = item.rate
                item.base_net_amount = item.amount

                running_total = running_total + (price_list_rate * item_qty)
                running_base_total = running_base_total + item.amount

            doc.total = running_total
            doc.base_total = running_total
            doc.net_total = running_base_total
            doc.base_net_total = running_base_total

            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0

    else:
        # No coupon is currently selected. If this is an existing Draft where a
        # coupon was just removed, clear the old coupon-generated line discount.
        # Genuine non-coupon Pricing Rules are preserved.
        previous_coupon_code = ""
        previous_coupon_pct = 0.0

        try:
            previous_doc = doc.get_doc_before_save()
        except Exception:
            previous_doc = None

        if previous_doc:
            previous_coupon_code = str(previous_doc.get("coupon_code") or "").strip()

        if previous_coupon_code:
            previous_coupon = frappe.db.get_value(
                "Coupon Code",
                {"coupon_code": previous_coupon_code},
                ["pricing_rule"],
                as_dict=True,
            )

            if previous_coupon and previous_coupon.get("pricing_rule"):
                previous_coupon_pct = frappe.utils.flt(
                    frappe.db.get_value(
                        "Pricing Rule",
                        previous_coupon.get("pricing_rule"),
                        "discount_percentage",
                    ) or 0.0
                )

        if previous_coupon_code and doc.items:
            for item in doc.items:
                item_rule_names = str(item.pricing_rules or "").strip()
                item_pct = frappe.utils.flt(item.discount_percentage or 0.0)

                stale_coupon_discount = has_coupon_pricing_rule(item_rule_names)

                # ERPNext can clear pricing_rules before this Server Script runs but
                # leave the old percentage behind. If the percentage is exactly the
                # removed coupon's percentage and there is no genuine normal rule,
                # treat it as stale coupon state.
                if (
                    not stale_coupon_discount
                    and previous_coupon_pct > 0.0
                    and frappe.utils.flt(item_pct, 6) == frappe.utils.flt(previous_coupon_pct, 6)
                    and not is_non_coupon_pricing_rule(item_rule_names)
                ):
                    stale_coupon_discount = True

                if stale_coupon_discount:
                    price_list_rate = float(item.price_list_rate or item.rate or 0.0)
                    item_qty = float(item.qty or 0.0)

                    item.discount_percentage = 0.0
                    item.discount_amount = 0.0
                    item.base_discount_amount = 0.0
                    item.pricing_rules = ""
                    item.margin_type = ""
                    item.margin_rate_or_amount = 0.0

                    item.rate = price_list_rate
                    item.amount = price_list_rate * item_qty
                    item.base_rate = price_list_rate
                    item.base_amount = item.amount
                    item.net_rate = price_list_rate
                    item.net_amount = item.amount
                    item.base_net_rate = price_list_rate
                    item.base_net_amount = item.amount

        # Return normal invoices to ERPNext's normal Pricing Rule behaviour when
        # there is no coupon selected. OGF Price List is the exception: native
        # Pricing Rules remain disabled because OGF is a strict no-discount list.
        doc.ignore_pricing_rule = 1 if ogf_price_list_restricted else 0
        doc.coupon_code = ""
        doc.additional_discount_percentage = 0.0
        doc.discount_amount = 0.0
        doc.base_discount_amount = 0.0
        doc.calculate_taxes_and_totals()
else:
    # VAT coupon percentages are read from their linked Pricing Rules so this
    # script only controls payment eligibility and does not hard-code the discount.
    vat26_pct = 0.0
    vatcd_pct = 0.0
    hlw15_pct = 0.0
    hlw10_pct = 0.0
    pd10_pct = 0.0
    pd5_pct = 0.0
    f2f15_pct = 0.0

    pd10_coupon = frappe.db.get_value(
        "Coupon Code",
        {"coupon_code": "PD10"},
        ["pricing_rule"],
        as_dict=True,
    )
    if pd10_coupon and pd10_coupon.get("pricing_rule"):
        pd10_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule",
                pd10_coupon.get("pricing_rule"),
                "discount_percentage",
            ) or 0.0
        )

    pd5_coupon = frappe.db.get_value(
        "Coupon Code",
        {"coupon_code": "PD5"},
        ["pricing_rule"],
        as_dict=True,
    )
    if pd5_coupon and pd5_coupon.get("pricing_rule"):
        pd5_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule",
                pd5_coupon.get("pricing_rule"),
                "discount_percentage",
            ) or 0.0
        )

    vat26_coupon = frappe.db.get_value(
        "Coupon Code",
        {"coupon_code": "VAT26"},
        ["pricing_rule"],
        as_dict=True,
    )
    if vat26_coupon and vat26_coupon.get("pricing_rule"):
        vat26_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule",
                vat26_coupon.get("pricing_rule"),
                "discount_percentage",
            ) or 0.0
        )

    vatcd_coupon = frappe.db.get_value(
        "Coupon Code",
        {"coupon_code": "VATCD"},
        ["pricing_rule"],
        as_dict=True,
    )
    if vatcd_coupon and vatcd_coupon.get("pricing_rule"):
        vatcd_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule",
                vatcd_coupon.get("pricing_rule"),
                "discount_percentage",
            ) or 0.0
        )

    hlw15_coupon = frappe.db.get_value(
        "Coupon Code",
        {"coupon_code": "HLW15"},
        ["pricing_rule"],
        as_dict=True,
    )
    if hlw15_coupon and hlw15_coupon.get("pricing_rule"):
        hlw15_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule",
                hlw15_coupon.get("pricing_rule"),
                "discount_percentage",
            ) or 0.0
        )

    hlw10_coupon = frappe.db.get_value(
        "Coupon Code",
        {"coupon_code": "HLW10"},
        ["pricing_rule"],
        as_dict=True,
    )
    if hlw10_coupon and hlw10_coupon.get("pricing_rule"):
        hlw10_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule",
                hlw10_coupon.get("pricing_rule"),
                "discount_percentage",
            ) or 0.0
        )

    f2f15_coupon = frappe.db.get_value(
        "Coupon Code",
        {"coupon_code": "F2F15"},
        ["pricing_rule"],
        as_dict=True,
    )
    if f2f15_coupon and f2f15_coupon.get("pricing_rule"):
        f2f15_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule",
                f2f15_coupon.get("pricing_rule"),
                "discount_percentage",
            ) or 0.0
        )

    f2f25_pct = 0.0
    f2f25_coupon = frappe.db.get_value(
        "Coupon Code",
        {"coupon_code": "F2F25"},
        ["pricing_rule"],
        as_dict=True,
    )
    if f2f25_coupon and f2f25_coupon.get("pricing_rule"):
        f2f25_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule",
                f2f25_coupon.get("pricing_rule"),
                "discount_percentage",
            ) or 0.0
        )

    COUPON_PCT_MAP = {
        "cos5": 5.0,
        "cos20": 20.0,
        "pd10": pd10_pct,
        "pd5": pd5_pct,
        "f2f15": f2f15_pct,
        "f2f25": f2f25_pct,
        "loyalcs": 10.0,
        "loyalcs2": 15.0,
        "julyv20": 20.0,
        "wha25": 25.0,
        "vat26": vat26_pct,
        "vatcd": vatcd_pct,
        "hlw15": hlw15_pct,
        "hlw10": hlw10_pct,
        "ngb20": 20.0,
    }
    COUPON_HEADER_MAP = {
        "cos5": "COS5",
        "cos20": "COS20",
        "pd10": "PD10",
        "pd5": "PD5",
        "f2f15": "F2F15",
        "f2f25": "F2F25",
        "loyalcs": "LOYALCS",
        "loyalcs2": "LOYALCS2",
        "julyv20": "JULYV20",
        "wha25": "WHA25",
        "vat26": "VAT26",
        "vatcd": "VATCD",
        "hlw15": "HLW15",
        "hlw10": "HLW10",
        "ngb20": "NGB20",
    }

    payment_ok = 1 if effective_payment_type in allowed_payment_types else 0
    cos20_payment_ok = 1 if effective_payment_type in cos20_allowed_payment_types else 0
    pd10_payment_ok = 1 if effective_payment_type in pd10_allowed_payment_types else 0
    pd5_payment_ok = 1 if effective_payment_type in pd5_allowed_payment_types else 0
    vat26_payment_ok = 1 if effective_payment_type in vat26_allowed_payment_types else 0
    vatcd_payment_ok = 1 if effective_payment_type in vatcd_allowed_payment_types else 0
    hlw15_payment_ok = 1 if effective_payment_type in hlw15_allowed_payment_types else 0
    hlw10_payment_ok = 1 if effective_payment_type in hlw10_allowed_payment_types else 0

    # Multi-company POS: offer titles include company suffix (e.g. [MNK]).
    # POS UI matches posa_coupons.pos_offer to get_offers — must use company row.
    company_name = str(doc.company or "").strip()
    loyalcs_pos_offer = "LOYAL CS 10% Discount (LOYALCS)"
    loyalcs2_pos_offer = "LOYAL CS2 15% Discount (LOYALCS2)"
    cos5_pos_offer = "5% Cash Discount (COS5)"
    cos20_pos_offer = "COS20"
    pd10_pos_offer = ""
    pd5_pos_offer = ""
    f2f15_pos_offer = "F2F15"
    f2f25_pos_offer = "F2F25"
    julyv20_pos_offer = "20% off on Net Total via JULYV20"
    wha25_pos_offer = "WHA25"
    vat26_pos_offer = "VAT26"
    vatcd_pos_offer = "VATCD"
    hlw15_pos_offer = ""
    hlw10_pos_offer = ""
    ngb20_pos_offer = "NGB20"
    if company_name:
        lc_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%LOYAL CS 10% Discount (LOYALCS)%"],
            },
            fields=["name"],
            limit=1,
        )
        if lc_rows:
            loyalcs_pos_offer = lc_rows[0].name
        l2_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%LOYAL CS2 15% Discount (LOYALCS2)%"],
            },
            fields=["name"],
            limit=1,
        )
        if l2_rows:
            loyalcs2_pos_offer = l2_rows[0].name
        c5_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%5% Cash Discount (COS5)%"],
            },
            fields=["name"],
            limit=1,
        )
        if c5_rows:
            cos5_pos_offer = c5_rows[0].name
        c20_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%COS20%"],
            },
            fields=["name"],
            limit=1,
        )
        if c20_rows:
            cos20_pos_offer = c20_rows[0].name

        pd10_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%PD10%"],
            },
            fields=["name"],
            limit=1,
        )
        if pd10_rows:
            pd10_pos_offer = pd10_rows[0].name

        pd5_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%PD5%"],
            },
            fields=["name"],
            limit=1,
        )
        if pd5_rows:
            pd5_pos_offer = pd5_rows[0].name

        f2f15_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%F2F15%"],
            },
            fields=["name"],
            limit=1,
        )
        if f2f15_rows:
            f2f15_pos_offer = f2f15_rows[0].name


        f2f25_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%F2F25%"],
            },
            fields=["name"],
            limit=1,
        )
        if f2f25_rows:
            f2f25_pos_offer = f2f25_rows[0].name


        jv_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%JULYV20%"],
            },
            fields=["name"],
            limit=1,
        )
        if jv_rows:
            julyv20_pos_offer = jv_rows[0].name
        wha25_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%WHA25%"],
            },
            fields=["name"],
            limit=1,
        )
        if wha25_rows:
            wha25_pos_offer = wha25_rows[0].name
        vat26_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%VAT26%"],
            },
            fields=["name"],
            limit=1,
        )
        if vat26_rows:
            vat26_pos_offer = vat26_rows[0].name
        vatcd_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%VATCD%"],
            },
            fields=["name"],
            limit=1,
        )
        if vatcd_rows:
            vatcd_pos_offer = vatcd_rows[0].name
        hlw15_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%HLW15%"],
            },
            fields=["name"],
            limit=1,
        )
        if hlw15_rows:
            hlw15_pos_offer = hlw15_rows[0].name
        hlw10_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%HLW10%"],
            },
            fields=["name"],
            limit=1,
        )
        if hlw10_rows:
            hlw10_pos_offer = hlw10_rows[0].name
        ngb20_rows = frappe.get_all(
            "POS Offer",
            filters={
                "company": company_name,
                "disable": 0,
                "coupon_based": 1,
                "title": ["like", "%Negombo opening All Products%"],
            },
            fields=["name"],
            limit=1,
        )
        if ngb20_rows:
            ngb20_pos_offer = ngb20_rows[0].name

    for row in list(doc.get("posa_coupons") or []):
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "loyalcs" and customer_group != "gold":
            doc.remove(row)
        elif code == "loyalcs2" and customer_group != "platinum":
            doc.remove(row)
        elif code == "cos5" and customer_group in ("gold", "platinum"):
            doc.remove(row)
        elif code == "codho05":
            doc.remove(row)

    has_loyalcs = 0
    has_loyalcs2 = 0
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "loyalcs":
            has_loyalcs = 1
        elif code == "loyalcs2":
            has_loyalcs2 = 1

    # Loyalty only — do not auto-tick COS5 or COS20; cashier must select them explicitly.
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "loyalcs":
            row.pos_offer = loyalcs_pos_offer
        elif code == "loyalcs2":
            row.pos_offer = loyalcs2_pos_offer
        elif code == "cos5":
            row.pos_offer = cos5_pos_offer
        elif code == "cos20":
            row.pos_offer = cos20_pos_offer
        elif code == "pd10":
            if pd10_pos_offer:
                row.pos_offer = pd10_pos_offer
        elif code == "pd5":
            if pd5_pos_offer:
                row.pos_offer = pd5_pos_offer
        elif code == "f2f15":
            if f2f15_pos_offer:
                row.pos_offer = f2f15_pos_offer
        elif code == "f2f25":
            if f2f25_pos_offer:
                row.pos_offer = f2f25_pos_offer
        elif code == "julyv20":
            row.pos_offer = julyv20_pos_offer
        elif code == "wha25":
            row.pos_offer = wha25_pos_offer
        elif code == "vat26":
            row.pos_offer = vat26_pos_offer
        elif code == "vatcd":
            row.pos_offer = vatcd_pos_offer
        elif code == "hlw15":
            if hlw15_pos_offer:
                row.pos_offer = hlw15_pos_offer
        elif code == "hlw10":
            if hlw10_pos_offer:
                row.pos_offer = hlw10_pos_offer
        elif code == "ngb20":
            row.pos_offer = ngb20_pos_offer

    loyalcs_selected = 0
    loyalcs2_selected = 0
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "loyalcs" and row.get("applied"):
            loyalcs_selected = 1
        elif code == "loyalcs2" and row.get("applied"):
            loyalcs2_selected = 1
    for row in doc.get("posa_offers") or []:
        if not row.get("applied"):
            continue
        offer = str(row.get("offer") or row.get("name") or "").strip().lower()
        if "loyalcs2" in offer or "loyal cs2" in offer:
            loyalcs2_selected = 1
        elif ("loyalcs" in offer or "loyal cs" in offer) and "loyalcs2" not in offer:
            loyalcs_selected = 1

    cos5_selected = 0
    if customer_group not in ("gold", "platinum"):
        for row in doc.get("posa_coupons") or []:
            code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
            if code == "cos5" and row.get("applied"):
                cos5_selected = 1
        for row in doc.get("posa_offers") or []:
            if not row.get("applied"):
                continue
            offer = str(row.get("offer") or row.get("name") or "").strip().lower()
            if "cos5" in offer:
                cos5_selected = 1

    cos20_selected = 0
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "cos20" and row.get("applied"):
            cos20_selected = 1
    for row in doc.get("posa_offers") or []:
        if not row.get("applied"):
            continue
        offer = str(row.get("offer") or row.get("name") or "").strip().lower()
        if "cos20" in offer:
            cos20_selected = 1

    pd10_selected = 0
    pd5_selected = 0
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "pd10" and row.get("applied"):
            pd10_selected = 1
        elif code == "pd5" and row.get("applied"):
            pd5_selected = 1
    for row in doc.get("posa_offers") or []:
        if not row.get("applied"):
            continue
        offer = str(row.get("offer") or row.get("name") or "").strip().lower()
        if "pd10" in offer:
            pd10_selected = 1
        elif "pd5" in offer:
            pd5_selected = 1

    # F2F15 / F2F25 overlap on Palmers. Only the actual selected coupon
    # (header or applied POS Coupon Detail) participates. POS Offer applied flags
    # are not selection because both offers may auto-match the same item.
    selected_f2f_coupon = ""
    f2f_header = str(doc.coupon_code or "").strip().lower()

    if f2f_header in ("f2f15", "f2f25"):
        selected_f2f_coupon = f2f_header

    if not selected_f2f_coupon:
        for row in doc.get("posa_coupons") or []:
            code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
            if code in ("f2f15", "f2f25") and row.get("applied"):
                selected_f2f_coupon = code
                break

    f2f15_selected = 1 if selected_f2f_coupon == "f2f15" else 0
    f2f25_selected = 1 if selected_f2f_coupon == "f2f25" else 0

    julyv20_selected = 0
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "julyv20" and row.get("applied"):
            julyv20_selected = 1
    for row in doc.get("posa_offers") or []:
        if not row.get("applied"):
            continue
        offer = str(row.get("offer") or row.get("name") or "").strip().lower()
        if "julyv20" in offer:
            julyv20_selected = 1

    wha25_selected = 0
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "wha25" and row.get("applied"):
            wha25_selected = 1
    for row in doc.get("posa_offers") or []:
        if not row.get("applied"):
            continue
        offer = str(row.get("offer") or row.get("name") or "").strip().lower()
        if "wha25" in offer:
            wha25_selected = 1

    ngb20_selected = 0
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "ngb20" and row.get("applied"):
            ngb20_selected = 1
    for row in doc.get("posa_offers") or []:
        if not row.get("applied"):
            continue
        offer = str(row.get("offer") or row.get("name") or "").strip().lower()
        if "ngb20" in offer or "negombo" in offer:
            ngb20_selected = 1

    # =========================================================================
    # VAT26 / VATCD: use ONLY the coupon selected by the cashier.
    # Do not infer either VAT coupon from posa_offers because both offers can match
    # the same Brand and POS Awesome may mark both as applied.
    # =========================================================================
    selected_vat_coupon = ""

    # The early VAT disambiguation block already normalised the applied rows.
    # Use those normalised coupon rows, never overlapping POS Offer matches.
    for row in doc.get("posa_coupons") or []:
        if not row.get("applied"):
            continue
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code in ("vat26", "vatcd"):
            selected_vat_coupon = code
            break

    # If POS already populated the Coupon Code header with VAT26/VATCD, that is
    # also an explicit selection and can be used as the source of truth.
    header_coupon_key = str(doc.coupon_code or "").strip().lower()
    if header_coupon_key in ("vat26", "vatcd"):
        selected_vat_coupon = header_coupon_key

    vat26_selected = 1 if selected_vat_coupon == "vat26" else 0
    vatcd_selected = 1 if selected_vat_coupon == "vatcd" else 0

    # HLW15 / HLW10: treat only the chosen coupon as active, never both
    # overlapping POS Offer matches. The early block normalised the rows.
    selected_hlw_coupon = ""
    for row in doc.get("posa_coupons") or []:
        if not row.get("applied"):
            continue
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code in ("hlw15", "hlw10"):
            selected_hlw_coupon = code
            break

    header_coupon_key = str(doc.coupon_code or "").strip().lower()
    if header_coupon_key in ("hlw15", "hlw10"):
        selected_hlw_coupon = header_coupon_key

    best_code = ""
    best_pct = 0.0

    pos_payment_key = str(effective_payment_type or "").strip().upper()

    if pos_payment_key in ("KOKO", "MINTPAY"):
        # F2F15 is the ONLY discount allowed for KOKO / MintPay.
        # F2F25 is rejected by payment validation before this point.
        if f2f15_selected:
            best_code = "f2f15"
            best_pct = COUPON_PCT_MAP[best_code]

    else:
        # Before payment is chosen, either F2F coupon can remain selected pending
        # payment validation. After a non-KOKO/MintPay payment is chosen, F2F25
        # stays valid while F2F15 is rejected by the validation above.
        if f2f15_selected and not payment_chosen:
            best_code = "f2f15"
            best_pct = COUPON_PCT_MAP[best_code]
        elif f2f25_selected:
            best_code = "f2f25"
            best_pct = COUPON_PCT_MAP[best_code]

        # If VAT26/VATCD was explicitly selected, use ONLY that selected coupon
        # as the coupon-based discount candidate. Do not let the other overlapping
        # VAT coupon/POS Offer participate just because POS Awesome marked it applied.
        #
        # This does NOT give the VAT coupon priority over normal non-coupon Pricing
        # Rules. The native rule lookup below still runs per item, and the existing
        # highest-discount comparison keeps whichever is larger:
        # selected coupon discount vs eligible non-coupon Pricing Rule discount.
        elif selected_vat_coupon == "vat26":
            if not payment_chosen or vat26_payment_ok:
                best_code = "vat26"
                best_pct = COUPON_PCT_MAP[best_code]

        elif selected_vat_coupon == "vatcd":
            if not payment_chosen or vatcd_payment_ok:
                best_code = "vatcd"
                best_pct = COUPON_PCT_MAP[best_code]

        # HLW coupons use the same explicit-selection and payment rules as VAT.
        elif selected_hlw_coupon == "hlw15":
            if not payment_chosen or hlw15_payment_ok:
                best_code = "hlw15"
                best_pct = COUPON_PCT_MAP[best_code]

        elif selected_hlw_coupon == "hlw10":
            if not payment_chosen or hlw10_payment_ok:
                best_code = "hlw10"
                best_pct = COUPON_PCT_MAP[best_code]

        # If no VAT/HLW coupon was selected, keep the existing coupon logic.
        elif wha25_selected:
            best_code = "wha25"
            best_pct = COUPON_PCT_MAP[best_code]
        elif pd10_selected and (not payment_chosen or pd10_payment_ok):
            best_code = "pd10"
            best_pct = COUPON_PCT_MAP[best_code]
        elif pd5_selected and (not payment_chosen or pd5_payment_ok):
            best_code = "pd5"
            best_pct = COUPON_PCT_MAP[best_code]
        elif cos20_selected and (not payment_chosen or cos20_payment_ok):
            best_code = "cos20"
            best_pct = COUPON_PCT_MAP[best_code]
        elif ngb20_selected:
            best_code = "ngb20"
            best_pct = COUPON_PCT_MAP[best_code]
        elif customer_group == "gold" and loyalcs_selected:
            best_code = "loyalcs"
            best_pct = COUPON_PCT_MAP[best_code]
        elif customer_group == "platinum" and loyalcs2_selected:
            best_code = "loyalcs2"
            best_pct = COUPON_PCT_MAP[best_code]
        elif cos5_selected and customer_group not in ("gold", "platinum"):
            if not payment_chosen or payment_ok:
                best_code = "cos5"
                best_pct = COUPON_PCT_MAP[best_code]
        elif julyv20_selected:
            best_code = "julyv20"
            best_pct = COUPON_PCT_MAP[best_code]

    if best_code:
        doc.coupon_code = COUPON_HEADER_MAP.get(best_code, best_code.upper())
    elif selected_vat_coupon:
        # Keep the selected VAT coupon visible until validation rejects an
        # invalid payment, rather than silently substituting another coupon.
        doc.coupon_code = COUPON_HEADER_MAP.get(selected_vat_coupon, selected_vat_coupon.upper())
    elif selected_hlw_coupon:
        # Likewise preserve HLW selection for explicit payment validation.
        doc.coupon_code = COUPON_HEADER_MAP.get(selected_hlw_coupon, selected_hlw_coupon.upper())
    elif not best_code and str(doc.coupon_code or "").strip().upper() in ("COS5", "COS20", "PD10", "PD5", "F2F15", "F2F25", "LOYALCS", "LOYALCS2", "JULYV20", "WHA25", "VAT26", "VATCD", "HLW15", "HLW10", "NGB20"):
        doc.coupon_code = ""

    # Keep only the winning coupon row applied.
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "codho05":
            row.applied = 0
        elif code in ("cos5", "cos20", "pd10", "pd5", "f2f15", "f2f25", "loyalcs", "loyalcs2", "julyv20", "wha25", "vat26", "vatcd", "hlw15", "hlw10", "ngb20"):
            row.applied = 1 if code == best_code else 0

    # Coupon-based POS Offers follow the selected coupon.
    # IMPORTANT: leave unrelated/non-coupon POS Offers untouched. They can still
    # produce an eligible native/non-coupon discount, and the per-item logic below
    # will compare that discount with the selected coupon and keep the higher one.
    for row in doc.get("posa_offers") or []:
        offer = str(row.get("offer") or row.get("name") or "").strip().lower()
        code = ""
        if "loyalcs2" in offer or "loyal cs2" in offer:
            code = "loyalcs2"
        elif ("loyalcs" in offer or "loyal cs" in offer) and "loyalcs2" not in offer:
            code = "loyalcs"
        elif "cos20" in offer:
            code = "cos20"
        elif "pd10" in offer:
            code = "pd10"
        elif "pd5" in offer:
            code = "pd5"
        elif "f2f25" in offer or str(row.get("coupon") or "").strip().lower() == "f2f25":
            code = "f2f25"
        elif "f2f15" in offer or str(row.get("coupon") or "").strip().lower() == "f2f15":
            code = "f2f15"
        elif "cos5" in offer or ("cash" in offer and "5%" in offer):
            code = "cos5"
        elif "julyv20" in offer:
            code = "julyv20"
        elif "wha25" in offer:
            code = "wha25"
        elif "vat26" in offer:
            code = "vat26"
        elif "vatcd" in offer:
            code = "vatcd"
        elif "hlw15" in offer or str(row.get("coupon") or "").strip().lower() == "hlw15":
            code = "hlw15"
        elif "hlw10" in offer or str(row.get("coupon") or "").strip().lower() == "hlw10":
            code = "hlw10"
        elif "ngb20" in offer or "negombo" in offer:
            code = "ngb20"

        # Only alter offers that we positively identify as coupon-based offers.
        # Unknown/non-coupon offers keep their existing applied state.
        if code:
            row.applied = 1 if code == best_code else 0

    coupon_pct = float(best_pct or 0.0)
    code_key = str(doc.coupon_code or "").strip().lower()

    if coupon_pct == 0.0 and code_key in COUPON_PCT_MAP:
        coupon_pct = COUPON_PCT_MAP[code_key]

    # Only items matching the coupon's own Pricing Rule condition (Brand /
    # Item Code / Item Group) get the coupon discount. Rules configured as
    # "Transaction" (whole-cart, e.g. COS5/LOYALCS/LOYALCS2) stay unrestricted,
    # exactly as before this fix.
    coupon_restricted = False
    coupon_eligible_keys = set()
    if coupon_pct > 0.0 and doc.coupon_code:
        coupon_pricing_rule = frappe.db.get_value(
            "Coupon Code", {"coupon_code": doc.coupon_code}, "pricing_rule"
        )
        if coupon_pricing_rule:
            eligibility = get_coupon_pricing_rule_eligible_keys(
                coupon_pricing_rule,
                doc.items or [],
                coupon_code=doc.coupon_code,
                invoice_doc=doc,
            )
            coupon_restricted = eligibility["restricted"]
            coupon_eligible_keys = eligibility["eligible_keys"]

            if not eligibility.get("valid"):
                coupon_pct = 0.0

    # =========================================================================
    # POS: genuine NON-coupon Pricing Rules per item
    # =========================================================================
    # Do NOT call ERPNext get_item_details() here. F2F15 and F2F25 can target
    # the same Palmers brand, and ERPNext can raise MultiplePricingRuleConflict
    # before this script gets to the selected-coupon/payment logic.
    #
    # get_native_pricing_rule_map() evaluates genuine NON-coupon Pricing Rules
    # directly and excludes every Pricing Rule linked from a Coupon Code. This
    # means F2F15 and F2F25 can never compete with each other as native rules.
    native_pricing_rule_pct_map = {}
    native_pricing_rule_rate_map = {}
    native_pricing_rule_name_map = {}
    native_pricing_rule_discount_amount_map = {}

    # This script owns Pricing Rule selection from here onward.
    doc.ignore_pricing_rule = 1

    # KOKO / MintPay allows only F2F15, so ordinary Pricing Rules do not compete.
    if (
        not ogf_price_list_restricted
        and str(effective_payment_type).strip().upper() not in ("KOKO", "MINTPAY")
    ):
        native_lookup = get_native_pricing_rule_map(doc.items or [], doc)
        native_by_item = native_lookup.get("by_item") or {}

        if native_lookup.get("error"):
            try:
                frappe.log_error(
                    title="POS Pricing Rule Lookup Failed",
                    message=str(native_lookup.get("error")),
                )
            except Exception:
                pass

        for native_key in native_by_item:
            native_entry = native_by_item[native_key]
            native_pct = frappe.utils.flt(native_entry.get("pct") or 0.0)

            if native_pct > 0.0:
                native_pricing_rule_pct_map[native_key] = native_pct
                native_pricing_rule_name_map[native_key] = str(
                    native_entry.get("rule") or ""
                ).strip()

    running_total = 0.0
    running_base_total = 0.0

    # Do not disable Pricing Rules before the manual lookup above.
    # Final custom values are calculated below after comparing rule discount vs coupon discount.

    if doc.items:
        for item in doc.items:
            price_list_rate = float(item.price_list_rate or 0.0)
            item_qty = float(item.qty or 0.0)

            if price_list_rate == 0.0:
                price_list_rate = float(item.rate or 0.0)

            item_key = item.name or str(item.idx or "") or str(item.item_code or "")

            highest_rule_pct = 0.0

            # First choice: a rule returned by the native lookup that we already
            # verified is NOT coupon-based.
            item_discount_pct = float(
                native_pricing_rule_pct_map.get(item_key) or 0.0
            )
            fallback_non_coupon_rule_names = ""

            # Fallback: preserve an existing item discount only when the item's
            # pricing_rules field identifies genuine non-coupon Pricing Rule(s).
            # This prevents a stale/overlapping VAT26 coupon discount from being
            # mistaken for a normal 20% rule while VATCD is selected.
            if item_discount_pct == 0.0 and not ogf_price_list_restricted:
                existing_rule_names = str(item.pricing_rules or "").strip()
                existing_item_pct = float(item.discount_percentage or 0.0)

                if (
                    existing_item_pct > 0.0
                    and is_non_coupon_pricing_rule(existing_rule_names)
                ):
                    item_discount_pct = existing_item_pct
                    fallback_non_coupon_rule_names = existing_rule_names

            # This map contains only genuine NON-coupon Pricing Rules, so keep
            # every valid item rule as a candidate even when its percentage is
            # exactly the same as the selected coupon. Otherwise an unrelated
            # item with (for example) its own 15% rule would incorrectly lose
            # that discount while F2F15 is selected for a different brand item.
            if item_discount_pct > 0.0:
                highest_rule_pct = item_discount_pct

            item_coupon_pct = coupon_pct
            if coupon_restricted and item_key not in coupon_eligible_keys:
                item_coupon_pct = 0.0

            native_rule_wins = 0

            # KOKO / MintPay HARD RULE:
            # F2F15 is the ONLY discount allowed anywhere on the order.
            # - F2F15 applies only to items eligible under its linked Pricing Rule
            #   (e.g. Palmers brand).
            # - Every other item is forced to 0% discount even if it has its own
            #   Pricing Rule, POS Offer, stale discount or manually reduced rate.
            if ogf_price_list_restricted:
                # OGF overrides every coupon/Pricing Rule/payment exception, including
                # the F2F15 KOKO/MintPay exception. OGF is always full price.
                absolute_best_pct = 0.0
            elif str(effective_payment_type).strip().upper() in ("KOKO", "MINTPAY"):
                if best_code == "f2f15":
                    absolute_best_pct = item_coupon_pct
                else:
                    absolute_best_pct = 0.0
            else:
                # Normal payment methods keep the usual per-item highest-discount
                # behavior: selected coupon (only when this item is eligible)
                # versus this item's own genuine non-coupon Pricing Rule.
                if highest_rule_pct > item_coupon_pct:
                    absolute_best_pct = highest_rule_pct
                    native_rule_wins = 1
                else:
                    absolute_best_pct = item_coupon_pct

            item.discount_percentage = absolute_best_pct

            if str(effective_payment_type).strip().upper() in ("KOKO", "MINTPAY"):
                item.pricing_rules = ""
                item.margin_type = ""
                item.margin_rate_or_amount = 0.0
            elif native_rule_wins:
                # Preserve the actual winning non-coupon rule, including rules
                # already on the row when the native lookup could not resolve
                # a rule using the supported conditions.
                item.pricing_rules = (
                    native_pricing_rule_name_map.get(item_key)
                    or fallback_non_coupon_rule_names
                    or ""
                )
            else:
                # Coupon won (or there is no discount). Do not leave a stale native
                # rule stamped on the row, because that can be re-read later as if
                # it had won the highest-discount comparison.
                item.pricing_rules = ""

            # For non-KOKO/MintPay payments, the winning native rule remains
            # item-wise. A brand-restricted coupon never removes a valid discount
            # from an unrelated item.

            calculated_discount = 0.0
            if absolute_best_pct > 0.0:
                calculated_discount = price_list_rate * (absolute_best_pct / 100.0)
                item.rate = price_list_rate - calculated_discount
            else:
                item.rate = price_list_rate

            # Keep the discount represented in ERPNext's discount fields instead
            # of only lowering Rate. This makes reports/print formats recognise it.
            item.discount_amount = calculated_discount
            item.base_discount_amount = (
                calculated_discount
                * frappe.utils.flt(doc.get("conversion_rate") or 1)
            )

            item.amount = item.rate * item_qty
            item.base_amount = item.rate * item_qty
            item.net_rate = item.rate
            item.net_amount = item.amount
            item.base_net_rate = item.rate
            item.base_net_amount = item.amount

            running_total = running_total + (price_list_rate * item_qty)
            running_base_total = running_base_total + item.amount

        doc.total = running_total
        doc.base_total = running_total
        doc.net_total = running_base_total
        doc.base_net_total = running_base_total
        doc.grand_total = running_base_total
        doc.base_grand_total = running_base_total

        has_line_discount = any(float(item.discount_percentage or 0) > 0 for item in doc.items)
        if coupon_pct > 0.0 or has_line_discount:
            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0

        # Snapshot per-item discount before calculate_taxes_and_totals() can reset them.
        # Post-loop uses this to restore the correct per-item rate rather than
        # flattening all items to coupon_pct, which would override higher pricing-rule discounts.
        item_discount_map = {}
        item_rule_name_map = {}
        for item in doc.items:
            item_key = item.name or str(item.idx or "") or str(item.item_code or "")
            item_discount_map[item_key] = float(item.discount_percentage or 0.0)
            item_rule_name_map[item_key] = str(item.pricing_rules or "").strip()

        # The custom POS logic has already selected the valid coupon and the
        # winning genuine non-coupon Pricing Rule. Keep ERPNext's resolver disabled
        # so overlapping F2F coupon rules cannot re-enter during validation.
        doc.ignore_pricing_rule = 1

        doc.calculate_taxes_and_totals()

        # calculate_taxes_and_totals() may clear item.pricing_rules even though
        # the custom resolver has already chosen an eligible non-coupon rule.
        # Restore the exact rule reference AFTER ERPNext's totals calculation,
        # whether or not a coupon is selected on this POS invoice.
        for item in doc.items or []:
            item_key = item.name or str(item.idx or "") or str(item.item_code or "")
            item.pricing_rules = item_rule_name_map.get(item_key) or ""

        if coupon_pct > 0.0 and doc.items:
            for item in doc.items:
                plr = float(item.price_list_rate or 0.0)
                if plr == 0.0:
                    plr = float(item.rate or 0.0)
                qty = float(item.qty or 0.0)
                # Use per-item discount from snapshot, not flat coupon_pct
                item_key = item.name or str(item.idx or "") or str(item.item_code or "")
                item_pct = item_discount_map.get(item_key, coupon_pct)
                disc_rate = plr * (1.0 - item_pct / 100.0)
                item.rate = disc_rate
                item.amount = disc_rate * qty
                item.base_rate = disc_rate
                item.base_amount = item.amount
                item.net_rate = disc_rate
                item.net_amount = item.amount
                item.base_net_rate = disc_rate
                item.base_net_amount = item.amount
                item.discount_percentage = item_pct

                restored_unit_discount = 0.0
                if item_pct > 0.0 and plr > disc_rate:
                    restored_unit_discount = plr - disc_rate
                item.discount_amount = restored_unit_discount
                item.base_discount_amount = (
                    restored_unit_discount
                    * frappe.utils.flt(doc.get("conversion_rate") or 1)
                )
            if best_code:
                doc.coupon_code = COUPON_HEADER_MAP.get(best_code, best_code.upper())
            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0

        # =====================================================================
        # Always sync rounded_total to grand_total after ALL calculations so
        # POSA collects the exact invoice amount without rounding. This runs
        # unconditionally — with coupon, without coupon, KOKO, MintPay, Credit Card,
        # Cash — every POS invoice gets the correct rounded_total here.
        # =====================================================================
        doc.rounded_total = doc.grand_total
        doc.base_rounded_total = doc.base_grand_total


# =========================================================================
# FINAL HARD KOKO / MINTPAY ENFORCEMENT
# =========================================================================
# This MUST stay at the very end of the Server Script.
#
# KOKO / MintPay normally remain zero-discount payment methods, with ONE exception:
# F2F15 is allowed and is the ONLY discount that may survive. F2F25 is explicitly rejected. Every other coupon,
# POS Offer, native Pricing Rule discount, stale line discount and manual discounted
# rate is removed. If F2F15 is selected, the final item rates are rebuilt from the
# F2F15 linked Pricing Rule while ERPNext native Pricing Rules stay disabled.
final_restricted_payment = str(effective_payment_type or "").strip().upper()

# Extra direct check of custom_payment_type for normal Sales Invoices.
if str(doc.get("custom_payment_type") or "").strip().upper() in ("KOKO", "MINTPAY"):
    final_restricted_payment = str(doc.get("custom_payment_type") or "").strip().upper()

# Extra direct check of payment rows. A non-zero KOKO/MintPay payment always wins.
for final_payment_row in doc.get("payments") or []:
    final_mop = str(final_payment_row.get("mode_of_payment") or "").strip().upper()
    final_amount = frappe.utils.flt(final_payment_row.get("amount") or 0)

    if final_amount > 0 and final_mop in ("KOKO", "MINTPAY"):
        final_restricted_payment = final_mop

if final_restricted_payment in ("KOKO", "MINTPAY"):
    doc.ignore_pricing_rule = 1

    # ---------------------------------------------------------
    # Which F2F coupon did the cashier actually select?
    # ---------------------------------------------------------
    # POS Offer auto-match is ignored because F2F15/F2F25 share the Palmers
    # criteria and both offers can appear as applied.
    final_selected_f2f_coupon = ""

    final_header_coupon = str(doc.get("coupon_code") or "").strip().upper()
    if final_header_coupon in ("F2F15", "F2F25"):
        final_selected_f2f_coupon = final_header_coupon

    if not final_selected_f2f_coupon:
        for final_coupon_row in doc.get("posa_coupons") or []:
            final_coupon_code = str(
                final_coupon_row.get("coupon")
                or final_coupon_row.get("coupon_code")
                or ""
            ).strip().upper()

            if (
                final_coupon_code in ("F2F15", "F2F25")
                and final_coupon_row.get("applied")
            ):
                final_selected_f2f_coupon = final_coupon_code
                break

    if final_selected_f2f_coupon == "F2F25":
        frappe.throw(
            msg="<b>Coupon Rejected:</b> 'F2F25' cannot be used with <u>KOKO</u> or <u>MintPay</u>. Only <b>F2F15</b> is allowed for these payment methods.",
            title="Invalid Payment Method",
        )

    final_f2f15_selected = 1 if final_selected_f2f_coupon == "F2F15" else 0

    # ---------------------------------------------------------
    # F2F15 selected: keep ONLY F2F15 and rebuild the discount.
    # ---------------------------------------------------------
    if final_f2f15_selected:
        final_f2f15_rule = str(
            frappe.db.get_value(
                "Coupon Code",
                {"coupon_code": "F2F15"},
                "pricing_rule",
            ) or ""
        ).strip()

        final_f2f15_pct = 0.0
        final_f2f15_restricted = False
        final_f2f15_eligible_keys = set()

        if final_f2f15_rule:
            final_f2f15_pct = frappe.utils.flt(
                frappe.db.get_value(
                    "Pricing Rule",
                    final_f2f15_rule,
                    "discount_percentage",
                ) or 0.0
            )

            final_f2f15_eligibility = get_coupon_pricing_rule_eligible_keys(
                final_f2f15_rule,
                doc.items or [],
                coupon_code="F2F15",
                invoice_doc=doc,
            )

            if final_f2f15_eligibility.get("valid"):
                final_f2f15_restricted = final_f2f15_eligibility.get("restricted") or False
                final_f2f15_eligible_keys = final_f2f15_eligibility.get("eligible_keys") or set()
            else:
                final_f2f15_pct = 0.0

        if final_f2f15_pct <= 0.0:
            frappe.throw(
                msg="<b>F2F15 could not be applied:</b> Check that Coupon Code <b>F2F15</b> is linked to an enabled Selling Pricing Rule with a valid discount percentage.",
                title="F2F15 Configuration Error",
            )

        doc.coupon_code = "F2F15"
        doc.additional_discount_percentage = 0.0
        doc.discount_amount = 0.0
        doc.base_discount_amount = 0.0

        # Keep only the F2F15 POS Coupon row applied.
        for final_coupon_row in doc.get("posa_coupons") or []:
            final_coupon_code = str(
                final_coupon_row.get("coupon")
                or final_coupon_row.get("coupon_code")
                or ""
            ).strip().upper()
            final_coupon_row.applied = 1 if final_coupon_code == "F2F15" else 0

        # Keep only the F2F15 POS Offer applied. All other coupon/POS offers are blocked.
        for final_offer_row in doc.get("posa_offers") or []:
            final_offer_text = str(
                final_offer_row.get("coupon")
                or final_offer_row.get("offer_name")
                or final_offer_row.get("offer")
                or final_offer_row.get("name")
                or ""
            ).strip().upper()
            final_offer_row.applied = 1 if "F2F15" in final_offer_text else 0

        if doc.items:
            for final_item in doc.items:
                final_price_list_rate = frappe.utils.flt(
                    final_item.price_list_rate
                    or final_item.rate
                    or 0
                )
                final_qty = frappe.utils.flt(final_item.qty or 0)
                final_item_key = final_item.name or str(final_item.idx or "") or str(final_item.item_code or "")

                final_item_pct = final_f2f15_pct
                if final_f2f15_restricted and final_item_key not in final_f2f15_eligible_keys:
                    final_item_pct = 0.0

                final_rate = final_price_list_rate * (1.0 - (final_item_pct / 100.0))

                final_unit_discount_amount = 0.0
                if final_item_pct > 0.0 and final_price_list_rate > final_rate:
                    final_unit_discount_amount = final_price_list_rate - final_rate

                final_item.discount_percentage = final_item_pct
                final_item.discount_amount = final_unit_discount_amount
                final_item.base_discount_amount = (
                    final_unit_discount_amount
                    * frappe.utils.flt(doc.get("conversion_rate") or 1)
                )

                # Do not stamp the coupon Pricing Rule into item.pricing_rules.
                # Keeping this blank prevents ERPNext from re-resolving it and also
                # guarantees that no normal Pricing Rule survives KOKO/MintPay.
                final_item.pricing_rules = ""
                final_item.margin_type = ""
                final_item.margin_rate_or_amount = 0.0

                final_item.rate = final_rate
                final_item.amount = final_rate * final_qty
                final_item.base_rate = final_rate
                final_item.base_amount = final_item.amount
                final_item.net_rate = final_rate
                final_item.net_amount = final_item.amount
                final_item.base_net_rate = final_rate
                final_item.base_net_amount = final_item.amount

        # Recalculate with every native Pricing Rule disabled.
        doc.calculate_taxes_and_totals()

        # Defensive re-assertion after totals calculation.
        if doc.items:
            for final_item in doc.items:
                final_price_list_rate = frappe.utils.flt(
                    final_item.price_list_rate
                    or final_item.rate
                    or 0
                )
                final_qty = frappe.utils.flt(final_item.qty or 0)
                final_item_key = final_item.name or str(final_item.idx or "") or str(final_item.item_code or "")

                final_item_pct = final_f2f15_pct
                if final_f2f15_restricted and final_item_key not in final_f2f15_eligible_keys:
                    final_item_pct = 0.0

                final_rate = final_price_list_rate * (1.0 - (final_item_pct / 100.0))

                final_unit_discount_amount = 0.0
                if final_item_pct > 0.0 and final_price_list_rate > final_rate:
                    final_unit_discount_amount = final_price_list_rate - final_rate

                final_item.discount_percentage = final_item_pct
                final_item.discount_amount = final_unit_discount_amount
                final_item.base_discount_amount = (
                    final_unit_discount_amount
                    * frappe.utils.flt(doc.get("conversion_rate") or 1)
                )
                final_item.pricing_rules = ""
                final_item.margin_type = ""
                final_item.margin_rate_or_amount = 0.0
                final_item.rate = final_rate
                final_item.amount = final_rate * final_qty
                final_item.base_rate = final_rate
                final_item.base_amount = final_item.amount
                final_item.net_rate = final_rate
                final_item.net_amount = final_item.amount
                final_item.base_net_rate = final_rate
                final_item.base_net_amount = final_item.amount

        # One final totals pass from the enforced F2F15-only item rates. Native
        # Pricing Rules remain disabled, so nothing else can re-enter here.
        doc.calculate_taxes_and_totals()

        # calculate_taxes_and_totals() can normalise item discount fields. Re-assert
        # the real per-unit F2F15 discount so reports and print formats can read it.
        if doc.items:
            for final_item in doc.items:
                final_price_list_rate = frappe.utils.flt(
                    final_item.price_list_rate
                    or final_item.rate
                    or 0
                )
                final_item_key = final_item.name or str(final_item.idx or "") or str(final_item.item_code or "")

                final_item_pct = final_f2f15_pct
                if final_f2f15_restricted and final_item_key not in final_f2f15_eligible_keys:
                    final_item_pct = 0.0

                final_unit_discount_amount = 0.0
                if final_item_pct > 0.0:
                    final_unit_discount_amount = (
                        final_price_list_rate * (final_item_pct / 100.0)
                    )

                final_item.discount_percentage = final_item_pct
                final_item.discount_amount = final_unit_discount_amount
                final_item.base_discount_amount = (
                    final_unit_discount_amount
                    * frappe.utils.flt(doc.get("conversion_rate") or 1)
                )

        doc.coupon_code = "F2F15"
        doc.additional_discount_percentage = 0.0
        doc.discount_amount = 0.0
        doc.base_discount_amount = 0.0
        doc.ignore_pricing_rule = 1

    # ---------------------------------------------------------
    # No F2F15: original hard zero-discount enforcement.
    # ---------------------------------------------------------
    else:
        doc.coupon_code = ""
        doc.additional_discount_percentage = 0.0
        doc.discount_amount = 0.0
        doc.base_discount_amount = 0.0

        for final_coupon_row in doc.get("posa_coupons") or []:
            final_coupon_row.applied = 0

        for final_offer_row in doc.get("posa_offers") or []:
            final_offer_row.applied = 0

        if doc.items:
            for final_item in doc.items:
                final_price_list_rate = frappe.utils.flt(
                    final_item.price_list_rate
                    or final_item.rate
                    or 0
                )
                final_qty = frappe.utils.flt(final_item.qty or 0)

                final_item.discount_percentage = 0.0
                final_item.discount_amount = 0.0
                final_item.base_discount_amount = 0.0
                final_item.pricing_rules = ""
                final_item.margin_type = ""
                final_item.margin_rate_or_amount = 0.0

                final_item.rate = final_price_list_rate
                final_item.amount = final_price_list_rate * final_qty
                final_item.base_rate = final_price_list_rate
                final_item.base_amount = final_item.amount
                final_item.net_rate = final_price_list_rate
                final_item.net_amount = final_item.amount
                final_item.base_net_rate = final_price_list_rate
                final_item.base_net_amount = final_item.amount

        doc.calculate_taxes_and_totals()

        if doc.items:
            for final_item in doc.items:
                final_price_list_rate = frappe.utils.flt(
                    final_item.price_list_rate
                    or final_item.rate
                    or 0
                )
                final_qty = frappe.utils.flt(final_item.qty or 0)

                final_item.discount_percentage = 0.0
                final_item.discount_amount = 0.0
                final_item.base_discount_amount = 0.0
                final_item.pricing_rules = ""
                final_item.margin_type = ""
                final_item.margin_rate_or_amount = 0.0
                final_item.rate = final_price_list_rate
                final_item.amount = final_price_list_rate * final_qty
                final_item.base_rate = final_price_list_rate
                final_item.base_amount = final_item.amount
                final_item.net_rate = final_price_list_rate
                final_item.net_amount = final_item.amount
                final_item.base_net_rate = final_price_list_rate
                final_item.base_net_amount = final_item.amount

        doc.coupon_code = ""
        doc.additional_discount_percentage = 0.0
        doc.discount_amount = 0.0
        doc.base_discount_amount = 0.0
        doc.ignore_pricing_rule = 1
        doc.calculate_taxes_and_totals()

        if doc.items:
            for final_item in doc.items:
                final_item.discount_percentage = 0.0
                final_item.discount_amount = 0.0
                final_item.base_discount_amount = 0.0
                final_item.pricing_rules = ""
                final_item.margin_type = ""
                final_item.margin_rate_or_amount = 0.0

        doc.coupon_code = ""
        doc.additional_discount_percentage = 0.0
        doc.discount_amount = 0.0
        doc.base_discount_amount = 0.0
        doc.ignore_pricing_rule = 1

    # Keep POS Awesome collection amount aligned after the final KOKO/MintPay enforcement.
    if is_pos_sale:
        doc.rounded_total = doc.grand_total
        doc.base_rounded_total = doc.base_grand_total

# =========================================================================
# FINAL HARD OGF PRICE LIST ENFORCEMENT
# =========================================================================
# This is intentionally the LAST pricing restriction in the script. OGF Price
# List must NEVER receive a discount, regardless of payment type (including
# KOKO/MintPay + F2F15). Remove every discount path and restore each normal item
# to the OGF Price List Rate already stored in item.price_list_rate.
if ogf_price_list_restricted:
    ogf_discount_removed = 0

    if str(doc.get("coupon_code") or "").strip():
        ogf_discount_removed = 1

    if (
        frappe.utils.flt(doc.get("additional_discount_percentage") or 0) > 0
        or frappe.utils.flt(doc.get("discount_amount") or 0) > 0
        or frappe.utils.flt(doc.get("base_discount_amount") or 0) > 0
    ):
        ogf_discount_removed = 1

    if doc.get("pricing_rules"):
        ogf_discount_removed = 1

    for ogf_notice_item in doc.get("items") or []:
        ogf_notice_plr = frappe.utils.flt(ogf_notice_item.get("price_list_rate") or 0)
        ogf_notice_rate = frappe.utils.flt(ogf_notice_item.get("rate") or 0)
        if (
            frappe.utils.flt(ogf_notice_item.get("discount_percentage") or 0) > 0
            or frappe.utils.flt(ogf_notice_item.get("discount_amount") or 0) > 0
            or frappe.utils.flt(ogf_notice_item.get("base_discount_amount") or 0) > 0
            or str(ogf_notice_item.get("pricing_rules") or "").strip()
            or frappe.utils.cint(ogf_notice_item.get("is_free_item") or 0) == 1
            or (
                ogf_notice_plr > 0
                and ogf_notice_rate > 0
                and ogf_notice_rate < ogf_notice_plr
            )
        ):
            ogf_discount_removed = 1

    # Do not block the sale; just tell the user that OGF discounts were removed.
    if ogf_discount_removed:
        frappe.msgprint(
            msg="<b>OGF Price List:</b> Discounts are not allowed on OGF Price List. Existing coupon/Pricing Rule discounts have been removed.",
            title="OGF Price List Discount Restriction",
            indicator="orange",
            alert=True,
        )

    doc.ignore_pricing_rule = 1
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    doc.discount_amount = 0.0
    doc.base_discount_amount = 0.0

    # Clear POS coupon/offer application state.
    for ogf_coupon_row in doc.get("posa_coupons") or []:
        ogf_coupon_row.applied = 0

    for ogf_offer_row in doc.get("posa_offers") or []:
        ogf_offer_row.applied = 0
        if ogf_offer_row.get("offer_applied") is not None:
            ogf_offer_row.offer_applied = 0

    # Remove free items created by Product-discount Pricing Rules.
    ogf_non_free_count = 0
    for ogf_item in doc.get("items") or []:
        if frappe.utils.cint(ogf_item.get("is_free_item") or 0) != 1:
            ogf_non_free_count = ogf_non_free_count + 1

    if ogf_non_free_count > 0:
        for ogf_item in list(doc.get("items") or []):
            if frappe.utils.cint(ogf_item.get("is_free_item") or 0) == 1:
                doc.remove(ogf_item)

    # No Pricing Rule Detail rows may survive on OGF.
    for ogf_detail_row in list(doc.get("pricing_rules") or []):
        doc.remove(ogf_detail_row)

    # Restore every normal item to the OGF Price List Rate.
    for ogf_item in doc.get("items") or []:
        ogf_price_list_rate = frappe.utils.flt(
            ogf_item.get("price_list_rate")
            or ogf_item.get("rate")
            or 0
        )
        ogf_qty = frappe.utils.flt(ogf_item.get("qty") or 0)

        ogf_item.discount_percentage = 0.0
        ogf_item.discount_amount = 0.0
        ogf_item.base_discount_amount = 0.0
        ogf_item.pricing_rules = ""
        ogf_item.margin_type = ""
        ogf_item.margin_rate_or_amount = 0.0

        ogf_item.rate = ogf_price_list_rate
        ogf_item.amount = ogf_price_list_rate * ogf_qty
        ogf_item.base_rate = ogf_price_list_rate
        ogf_item.base_amount = ogf_item.amount
        ogf_item.net_rate = ogf_price_list_rate
        ogf_item.net_amount = ogf_item.amount
        ogf_item.base_net_rate = ogf_price_list_rate
        ogf_item.base_net_amount = ogf_item.amount

    if is_pos_sale:
        doc.disable_rounded_total = 1

    # Recalculate with Pricing Rules disabled.
    doc.calculate_taxes_and_totals()

    # Defensive re-enforcement in case totals calculation rewrote item fields.
    for ogf_item in doc.get("items") or []:
        ogf_price_list_rate = frappe.utils.flt(
            ogf_item.get("price_list_rate")
            or ogf_item.get("rate")
            or 0
        )
        ogf_qty = frappe.utils.flt(ogf_item.get("qty") or 0)

        ogf_item.discount_percentage = 0.0
        ogf_item.discount_amount = 0.0
        ogf_item.base_discount_amount = 0.0
        ogf_item.pricing_rules = ""
        ogf_item.margin_type = ""
        ogf_item.margin_rate_or_amount = 0.0
        ogf_item.rate = ogf_price_list_rate
        ogf_item.amount = ogf_price_list_rate * ogf_qty
        ogf_item.base_rate = ogf_price_list_rate
        ogf_item.base_amount = ogf_item.amount
        ogf_item.net_rate = ogf_price_list_rate
        ogf_item.net_amount = ogf_item.amount
        ogf_item.base_net_rate = ogf_price_list_rate
        ogf_item.base_net_amount = ogf_item.amount

    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    doc.discount_amount = 0.0
    doc.base_discount_amount = 0.0
    doc.ignore_pricing_rule = 1

    doc.calculate_taxes_and_totals()

    # If POS Pay already populated an amount from a discounted total, move the
    # difference onto the first non-zero payment row so the invoice settles at
    # the full OGF total instead of leaving an outstanding balance.
    if is_pos_sale:
        ogf_payment_row = None
        ogf_total_payment_amount = 0.0

        for ogf_pay_row in doc.get("payments") or []:
            ogf_pay_amount = frappe.utils.flt(ogf_pay_row.get("amount") or 0)
            ogf_total_payment_amount = ogf_total_payment_amount + ogf_pay_amount
            if ogf_payment_row is None and ogf_pay_amount > 0:
                ogf_payment_row = ogf_pay_row

        if ogf_payment_row:
            ogf_target_total = frappe.utils.flt(doc.get("grand_total") or 0)
            ogf_payment_difference = ogf_target_total - ogf_total_payment_amount

            if abs(ogf_payment_difference) > 0.000001:
                ogf_new_payment_amount = (
                    frappe.utils.flt(ogf_payment_row.get("amount") or 0)
                    + ogf_payment_difference
                )
                if ogf_new_payment_amount < 0:
                    ogf_new_payment_amount = 0.0

                ogf_payment_row.amount = ogf_new_payment_amount
                ogf_payment_row.base_amount = (
                    ogf_new_payment_amount
                    * frappe.utils.flt(doc.get("conversion_rate") or 1)
                )
                doc.calculate_taxes_and_totals()

        doc.rounded_total = doc.grand_total
        doc.base_rounded_total = doc.base_grand_total
        doc.rounding_adjustment = 0.0
        doc.base_rounding_adjustment = 0.0

    # Last defensive clear for display/link fields after the final calculation.
    for ogf_item in doc.get("items") or []:
        ogf_item.discount_percentage = 0.0
        ogf_item.discount_amount = 0.0
        ogf_item.base_discount_amount = 0.0
        ogf_item.pricing_rules = ""
        ogf_item.margin_type = ""
        ogf_item.margin_rate_or_amount = 0.0

    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    doc.discount_amount = 0.0
    doc.base_discount_amount = 0.0
    doc.ignore_pricing_rule = 1



# POS: keep the in-hook native resolver switched off after the final totals
# calculation. Genuine independent item rules have already been evaluated
# and stamped by the script's non-coupon rule evaluator above.
if is_pos_context:
    doc.ignore_pricing_rule = 1