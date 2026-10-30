# HLW15 / HLW10 — PAYMENT-RESTRICTED COUPONS (2026-10-23)
# HLW15: Cash or Bank Transfer; discount from linked Pricing Rule (expected 15%).
# HLW10: Credit Card; discount from linked Pricing Rule (expected 10%).
# They follow VAT26/VATCD explicit POS selection, rule eligibility and GCC rules.
# KOKO/MintPay and OGF Price List keep their existing zero-discount policy.
#
# FIX (2026-10-12 NORMAL SALES INVOICE DISCOUNT FIELDS):
# Preserve per-unit discount_amount/base_discount_amount for the winning
# coupon/pricing rule before and after taxes/totals recalculation.
# Keep the already-discounted rate and manual-rate override rules unchanged.
# Note: Custom print formats must use the saved discount fields correctly.
#
# Cosmetics LK 2 production — Validate Coupon Payment Type
# COS5: 5%, Cash / COD / Bank Transfer only — must be explicitly selected (not auto-applied).
# COS20: 20%, Cash / Bank Transfer only — must be explicitly selected (not auto-applied).
# PD10: Cash / Bank Transfer only — discount % comes from linked Pricing Rule.
# PD5: Credit Card only — discount % comes from linked Pricing Rule.
# Loyalty: LOYALCS (10%, Gold) and LOYALCS2 (15%, Platinum) apply only when the coupon is explicitly present/selected.
# JULYV20: 20% off Grand Total, any customer group, must be explicitly selected via coupon code. (added 2026-07-25)
# CHANGE: POS branch manually fetches native ERPNext Pricing Rule results using get_item_details,
#         then compares those discounts with coupon discounts and keeps the highest per item.
#         Coupon restrictions and explicit POS coupon-selection logic remain intact.
# FIX (2026-10-06 SAFE_EXEC): Removed helper-to-helper calls inside Server Script functions.\n#         RestrictedPython can raise NameError for functions defined in the same script;\n#         every coupon/native Pricing Rule classifier is now self-contained.\n# FIX (2026-10-06): A Pricing Rule linked from Coupon Code is always treated as coupon-controlled,
#         even if its coupon_code_based checkbox is off. This prevents LOYALCS/LOYALCS2 and
#         other coupon rules from entering the native POS/normal Pricing Rule fallback and
#         applying to customers who did not qualify/select that coupon.
# FIX (2026-10-07 ERPNext v14 validate crash): Transaction-level coupon Pricing
#         Rules are no longer stamped into Sales Invoice Item.pricing_rules. ERPNext
#         v14 update_pricing_rule_uom() only supports Item Code / Item Group / Brand
#         there; stamping a Transaction rule makes child_doc=None and causes
#         TypeError: 'NoneType' object is not iterable during Sales Invoice validate.
#         POS pricing is fully calculated by this script, so ignore_pricing_rule stays
#         enabled through ERPNext validation to prevent a second pricing pass.
#
# FIX (2026-10-29 unknown POS coupon): Campaign coupons not in COUPON_PCT_MAP
#         (e.g. NG15) still resolve discount_percentage from Coupon Code ->
#         Pricing Rule so max(coupon %, native item-rule %) can beat PRLE-0006.
#
# FIX (2026-10-07 loyalty manual-only): LOYALCS/LOYALCS2 never auto-apply from
#         Customer Group. Customer Group is only an eligibility check. A loyalty
#         discount is considered only when LOYALCS/LOYALCS2 is explicitly present
#         either in the standard Coupon Code header OR in an applied POS Coupon
#         Detail row created by the cashier selecting the coupon. POS Offer rows
#         alone can never select loyalty and this script never creates loyalty rows.
#         IMPORTANT UI CONFIG: Auto Apply must stay OFF on the LOYALCS/LOYALCS2 POS
#         Offer masters. KOKO/MintPay remain zero-discount payment methods.
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

# FIX (2026-10-06 CONSOLIDATED):
#   - frappe.get_attr / frappe.safe_eval / frappe.get_traceback are not exposed
#     to Server Scripts. The native Pricing Rule lookups (POS get_item_details and
#     normal-invoice _get_pricing_rules) therefore failed silently on every run,
#     so native rules never competed with coupons. Replaced by the self-contained
#     get_native_pricing_rule_map(): highest valid discount per item between a
#     genuine non-coupon rule and the eligible coupon, in POS and normal invoices.
#   - KOKO/MintPay decided once at the top (payment rows, then custom_payment_type);
#     no coupon/loyalty validation can throw for them; final enforcement also
#     clears the Pricing Rule Detail table and free items, keeps the KOKO/MintPay
#     payment row (incl. base_amount) and refreshes paid/outstanding amounts.
#   - POS: winning rule stamped per item (no stale coupon/native rule names), stale
#     margins cleared, Pricing Rule Detail rebuilt, VAT26/VATCD header selection
#     preserved, and rounding disabled so
#     rounded_total == grand_total without leaving an outstanding difference.
#   - Free items (is_free_item) are never re-priced by coupon/native logic.
#
# FIX (2026-10-09 POS PAY DISPLAY): POS now restores item.discount_amount and
#         base_discount_amount after calculate_taxes_and_totals(), so the Discount
#         Amount stays visible after Pay/validation instead of reverting to zero.
#
# FIX (2026-10-12 OGF PRICE LIST): OGF Price List is a strict no-discount price list.
#         Coupons, POS Offers, native Pricing Rules, free-item rules, header discounts,
#         line discounts and manually reduced rates are removed; items return to their
#         OGF Price List Rate in both POS and normal Sales Invoices.
#
# FIX (2026-10-13 GCC PRICE LIST): GCC PRICE LIST is coupon-only.
#         Genuine/non-coupon Pricing Rules, normal POS Offer discounts, free-item rules,
#         header/line discounts and manual reduced rates are blocked. When the cashier
#         explicitly selects a coupon, only that coupon's linked Pricing Rule may apply,
#         subject to the coupon rule's own eligibility/payment restrictions.

allowed_payment_types = ["Cash On Delivery", "Cash", "Bank Transfer"]
cos20_allowed_payment_types = ["Cash", "Bank Transfer"]
pd10_allowed_payment_types = ["Cash", "Bank Transfer"]
pd5_allowed_payment_types = ["Credit Card"]
vat26_allowed_payment_types = ["Cash", "Bank Transfer"]
vatcd_allowed_payment_types = ["Credit Card"]
hlw15_allowed_payment_types = ["Cash", "Bank Transfer"]
hlw10_allowed_payment_types = ["Credit Card"]

# Defensive normalization: POS Awesome/custom child tables can arrive as None
# on some draft/request paths. Keep them as empty child tables so neither this
# Server Script nor later POS Awesome hooks try to iterate over None.
if doc.get("posa_coupons") is None:
    doc.set("posa_coupons", [])
if doc.get("posa_offers") is None:
    doc.set("posa_offers", [])
if doc.get("pricing_rules") is None:
    doc.set("pricing_rules", [])
if doc.get("payments") is None:
    doc.set("payments", [])

payment_type = str(doc.custom_payment_type or "").strip()

# Track whether the KOKO/MintPay restriction notice has already been shown
# during this Server Script run, so POS/final enforcement does not duplicate it.
restricted_payment_notice_shown = 0

# IMPORTANT FOR POS:
# POS Awesome can have custom_payment_type/default payment values and zero-amount
# payment rows BEFORE the cashier opens Pay and chooses the real Mode of Payment.
# For POS, do not treat those defaults/placeholders as a chosen payment method.
# A POS payment is considered chosen only when a payment row has a non-zero amount.
# Detect POS as early as possible so default custom_payment_type (often Cash) is ignored
# before the cashier actually selects/enters a payment in the Pay dialog.
is_pos_context = bool(doc.get("posa_pos_opening_shift")) or bool(doc.get("pos_profile")) or bool(doc.get("is_pos"))

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

# KOKO / MintPay are valid payment methods, but they are always zero-discount.
# Do not reject/revert these payments because a discount or coupon already exists.
# The final hard enforcement removes every discount and keeps the chosen payment.
#
# Single source of truth (computed once, used by every branch, so earlier
# validations can never throw for a sale the final enforcement would allow):
#   1. a non-zero KOKO/MintPay payment row
#   2. else custom_payment_type KOKO/MintPay - for POS only while no other
#      payment row has an amount (POS defaults are placeholders until paid)
pos_has_nonzero_payment = 0
for detect_row in doc.get("payments") or []:
    if str(detect_row.get("mode_of_payment") or "").strip() and frappe.utils.flt(detect_row.get("amount") or 0) > 0:
        pos_has_nonzero_payment = 1

restricted_payment_key = str(effective_payment_type or "").strip().upper()
if restricted_payment_key not in ("KOKO", "MINTPAY"):
    restricted_payment_key = ""

custom_payment_key = str(doc.get("custom_payment_type") or "").strip().upper()
if not restricted_payment_key and custom_payment_key in ("KOKO", "MINTPAY"):
    if not is_pos_context or not pos_has_nonzero_payment:
        restricted_payment_key = custom_payment_key

if restricted_payment_key:
    effective_payment_type = "KOKO" if restricted_payment_key == "KOKO" else "MintPay"
    payment_chosen = 1

restricted_zero_discount_payment = True if restricted_payment_key else False

# OGF Price List is a strict no-discount price list. Pricing Rules can therefore
# leave For Price List blank and work on the other selling price lists, while this
# script centrally prevents every discount path on OGF.
blocked_discount_price_list = "OGF Price List"
ogf_price_list_restricted = (
    str(doc.get("selling_price_list") or "").strip().lower()
    == blocked_discount_price_list.lower()
)

# GCC PRICE LIST is not a zero-discount price list: explicitly selected coupons
# are allowed, but ALL genuine/non-coupon Pricing Rules and other discount paths
# are blocked. Coupon rules still have to pass their own Brand/Item/Group/date/
# customer/payment eligibility checks.
gcc_coupon_only_price_list = "GCC PRICE LIST"
gcc_coupon_only_restricted = (
    str(doc.get("selling_price_list") or "").strip().lower()
    == gcc_coupon_only_price_list.lower()
)

# Used by all coupon/native-rule selection paths. Keep the KOKO/MintPay flag
# separate as well because its final block also has payment-specific behavior.
discounts_globally_blocked = (
    restricted_zero_discount_payment or ogf_price_list_restricted
)

customer_group = ""
if doc.customer:
    cust_key = str(doc.customer or "").strip()

    # Customer is a Link field, so use exact matches only. A previous fuzzy
    # customer_name LIKE lookup could accidentally borrow another customer's
    # group and incorrectly grant a loyalty coupon.
    cg = frappe.db.get_value("Customer", cust_key, "customer_group")

    if not cg:
        cg = frappe.db.get_value(
            "Customer",
            {"customer_name": cust_key},
            "customer_group",
        )

    customer_group = str(cg or "").strip().lower()

# Snapshot: did this invoice arrive with ANY discount state? Used only for the
# KOKO/MintPay notice, so it still shows after earlier branches zeroed values.
incoming_discount_present = 0
if str(doc.get("coupon_code") or "").strip():
    incoming_discount_present = 1
if (
    frappe.utils.flt(doc.get("additional_discount_percentage") or 0) > 0
    or frappe.utils.flt(doc.get("discount_amount") or 0) > 0
):
    incoming_discount_present = 1
if doc.get("pricing_rules"):
    incoming_discount_present = 1
for incoming_item in doc.get("items") or []:
    incoming_plr = frappe.utils.flt(incoming_item.get("price_list_rate") or 0)
    incoming_rate = frappe.utils.flt(incoming_item.get("rate") or 0)
    if (
        frappe.utils.flt(incoming_item.get("discount_percentage") or 0) > 0
        or frappe.utils.flt(incoming_item.get("discount_amount") or 0) > 0
        or str(incoming_item.get("pricing_rules") or "").strip()
        or frappe.utils.cint(incoming_item.get("is_free_item") or 0) == 1
        or (incoming_plr > 0 and incoming_rate > 0 and incoming_rate < incoming_plr)
    ):
        incoming_discount_present = 1
for incoming_row in (doc.get("posa_coupons") or []) + (doc.get("posa_offers") or []):
    if incoming_row.get("applied"):
        incoming_discount_present = 1


# =========================================================================
# POS LOYALTY MANUAL-SELECTION GUARD
# =========================================================================
# Customer Group only controls eligibility:
#   Gold     -> LOYALCS
#   Platinum -> LOYALCS2
#   everyone else / no customer -> neither
#
# Loyalty is MANUAL ONLY. A loyalty coupon counts as selected when either:
#   1. the standard Sales Invoice coupon_code header contains LOYALCS/LOYALCS2, or
#   2. an applied POS Coupon Detail row contains LOYALCS/LOYALCS2.
#
# The second case is important for POS Awesome because an explicitly selected
# coupon can exist in posa_coupons before/without the header being populated.
# POS Offer rows NEVER count as selection, so an auto/stale POS Offer cannot
# grant loyalty by itself. This script also NEVER creates a loyalty coupon row.
pos_allowed_loyalty_code = ""
pos_selected_loyalty_code = ""
invalid_pos_loyalty_discount_found = 0

if is_pos_context:
    if doc.customer and customer_group == "gold":
        pos_allowed_loyalty_code = "loyalcs"
    elif doc.customer and customer_group == "platinum":
        pos_allowed_loyalty_code = "loyalcs2"

    # Header selection has first priority.
    loyalty_header_code = str(doc.get("coupon_code") or "").strip().lower()
    if loyalty_header_code in ("loyalcs", "loyalcs2"):
        pos_selected_loyalty_code = loyalty_header_code

    # If the header is still blank/non-loyalty, accept an APPLIED POS Coupon
    # Detail row as the cashier's explicit loyalty selection. Do not inspect
    # posa_offers here because POS Awesome can auto-match offers by itself.
    if not pos_selected_loyalty_code:
        for loyalty_coupon_row in doc.get("posa_coupons") or []:
            if not loyalty_coupon_row.get("applied"):
                continue

            loyalty_coupon_code = str(
                loyalty_coupon_row.get("coupon_code")
                or loyalty_coupon_row.get("coupon")
                or ""
            ).strip().lower()

            if loyalty_coupon_code in ("loyalcs", "loyalcs2"):
                pos_selected_loyalty_code = loyalty_coupon_code
                break

    # No customer means there is no loyalty eligibility at all.
    if not doc.customer:
        pos_allowed_loyalty_code = ""

    # A selected loyalty coupon must match Customer Group eligibility.
    # KOKO/MintPay are handled later as zero-discount payments and must never
    # be rejected simply because a coupon was already selected.
    if (
        pos_selected_loyalty_code
        and pos_selected_loyalty_code != pos_allowed_loyalty_code
    ):
        invalid_pos_loyalty_discount_found = 1

        if discounts_globally_blocked:
            doc.coupon_code = ""
            pos_selected_loyalty_code = ""
        # For normal payment methods leave the selected value/row in place so
        # the existing coupon validation below gives the proper Gold/Platinum
        # rejection message instead of silently removing the cashier's coupon.

    # When a valid applied POS Coupon Detail row was the source of selection,
    # sync the normal Coupon Code header. This is NOT auto-application: the
    # coupon already exists and is applied in posa_coupons.
    if (
        pos_selected_loyalty_code
        and pos_selected_loyalty_code == pos_allowed_loyalty_code
        and not discounts_globally_blocked
    ):
        doc.coupon_code = (
            "LOYALCS2"
            if pos_selected_loyalty_code == "loyalcs2"
            else "LOYALCS"
        )

    # Loyalty POS Offers never count as selection. They may remain applied only
    # when the matching manually selected coupon is present and valid.
    for loyalty_offer_row in doc.get("posa_offers") or []:
        loyalty_offer_text = str(
            loyalty_offer_row.get("offer")
            or loyalty_offer_row.get("name")
            or loyalty_offer_row.get("offer_name")
            or ""
        ).strip().lower()

        loyalty_offer_code = ""
        if "loyalcs2" in loyalty_offer_text or "loyal cs2" in loyalty_offer_text:
            loyalty_offer_code = "loyalcs2"
        elif (
            "loyalcs" in loyalty_offer_text
            or "loyal cs" in loyalty_offer_text
        ) and "loyalcs2" not in loyalty_offer_text:
            loyalty_offer_code = "loyalcs"

        if loyalty_offer_code:
            keep_loyalty_offer = (
                pos_selected_loyalty_code == loyalty_offer_code
                and pos_allowed_loyalty_code == loyalty_offer_code
                and not discounts_globally_blocked
            )

            if not keep_loyalty_offer:
                if (
                    loyalty_offer_row.get("applied")
                    or loyalty_offer_row.get("offer_applied")
                ):
                    invalid_pos_loyalty_discount_found = 1

                # POS Awesome v6 uses offer_applied on POS Offer Detail. Also
                # clear applied for compatibility with any custom/older row shape.
                loyalty_offer_row.offer_applied = 0
                loyalty_offer_row.applied = 0

    # Keep the manually selected valid loyalty POS Coupon Detail row. Remove only
    # stale/unselected loyalty rows. The script never appends a loyalty row.
    for loyalty_coupon_row in list(doc.get("posa_coupons") or []):
        loyalty_coupon_code = str(
            loyalty_coupon_row.get("coupon_code")
            or loyalty_coupon_row.get("coupon")
            or ""
        ).strip().lower()

        if loyalty_coupon_code in ("loyalcs", "loyalcs2"):
            row_is_selected = bool(loyalty_coupon_row.get("applied"))
            keep_loyalty_row = (
                row_is_selected
                and loyalty_coupon_code == pos_selected_loyalty_code
                and loyalty_coupon_code == pos_allowed_loyalty_code
                and not discounts_globally_blocked
            )

            # For a wrong-group coupon on a normal payment, keep the applied row
            # so STEP 1 below can reject it with the existing clear message.
            wrong_group_selected = (
                row_is_selected
                and loyalty_coupon_code == pos_selected_loyalty_code
                and loyalty_coupon_code != pos_allowed_loyalty_code
                and not discounts_globally_blocked
            )

            if not keep_loyalty_row and not wrong_group_selected:
                doc.remove(loyalty_coupon_row)

    # Clear transaction-level values written only by a stale/auto loyalty offer.
    # Do not clear a valid manually selected loyalty coupon.
    valid_manual_loyalty_selected = (
        pos_selected_loyalty_code
        and pos_selected_loyalty_code == pos_allowed_loyalty_code
        and not discounts_globally_blocked
    )

    if invalid_pos_loyalty_discount_found and not valid_manual_loyalty_selected:
        doc.additional_discount_percentage = 0.0
        doc.discount_amount = 0.0
        doc.base_discount_amount = 0.0


def get_coupon_pricing_rule_eligible_keys(
    pricing_rule_name,
    items,
    coupon_code=None,
    invoice_doc=None
):
    # Deterministic validation for the SELECTED coupon's linked Pricing Rule.
    # Returns a readable reason when the rule is invalid so loyalty coupons
    # can never silently submit with a 0% result.

    result = {
        "valid": False,
        "restricted": True,
        "eligible_keys": set(),
        "reason": ""
    }

    if not pricing_rule_name:
        result["reason"] = "The Coupon Code is not linked to a Pricing Rule."
        return result

    if not invoice_doc:
        result["reason"] = "The Sales Invoice could not be validated."
        return result

    pr = frappe.get_doc("Pricing Rule", pricing_rule_name)

    # ---------------------------------------------------------
    # RULE STATUS / TYPE
    # ---------------------------------------------------------
    if frappe.utils.cint(pr.get("disable") or 0) == 1:
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " is disabled."
        return result

    if frappe.utils.cint(pr.get("selling") or 0) != 1:
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " is not enabled for Selling."
        return result

    if str(pr.get("price_or_product_discount") or "").strip() not in ("", "Price"):
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " is not configured as a Price discount."
        return result

    # ---------------------------------------------------------
    # SELECTED COUPON MUST LINK TO THIS RULE
    # ---------------------------------------------------------
    selected_coupon = str(coupon_code or invoice_doc.get("coupon_code") or "").strip()

    rule_requires_coupon = 1 if frappe.utils.cint(pr.get("coupon_code_based") or 0) == 1 else 0

    if not rule_requires_coupon:
        linked_coupon_name = frappe.db.get_value(
            "Coupon Code",
            {"pricing_rule": pricing_rule_name},
            "name",
        )
        if linked_coupon_name:
            rule_requires_coupon = 1

    if rule_requires_coupon:
        if not selected_coupon:
            result["reason"] = "No Coupon Code is selected."
            return result

        linked_rule = frappe.db.get_value(
            "Coupon Code",
            {"coupon_code": selected_coupon},
            "pricing_rule"
        )

        if str(linked_rule or "").strip() != str(pricing_rule_name).strip():
            result["reason"] = "Coupon " + str(selected_coupon) + " is not linked to Pricing Rule " + str(pricing_rule_name) + "."
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
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " is not valid yet."
        return result

    if pr.get("valid_upto") and check_date > frappe.utils.getdate(pr.get("valid_upto")):
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " has expired."
        return result

    # Coupon's own validity dates / usage, when available.
    if selected_coupon:
        coupon_info = frappe.db.get_value(
            "Coupon Code",
            {"coupon_code": selected_coupon},
            ["valid_from", "valid_upto", "maximum_use", "used"],
            as_dict=True,
        )

        if not coupon_info:
            result["reason"] = "Coupon Code " + str(selected_coupon) + " does not exist."
            return result

        if coupon_info.get("valid_from") and check_date < frappe.utils.getdate(coupon_info.get("valid_from")):
            result["reason"] = "Coupon " + str(selected_coupon) + " is not valid yet."
            return result

        if coupon_info.get("valid_upto") and check_date > frappe.utils.getdate(coupon_info.get("valid_upto")):
            result["reason"] = "Coupon " + str(selected_coupon) + " has expired."
            return result

        maximum_use = frappe.utils.cint(coupon_info.get("maximum_use") or 0)
        used = frappe.utils.cint(coupon_info.get("used") or 0)

        if maximum_use and used >= maximum_use:
            result["reason"] = "Coupon " + str(selected_coupon) + " has reached its maximum usage limit."
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
                result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " does not match the invoice " + str(rule_field) + "."
                return result

    if pr.get("customer_group"):
        rule_customer_group = str(pr.get("customer_group") or "").strip().lower()

        # Do not read the outer-script customer_group variable from inside this
        # function. RestrictedPython may not expose script locals to function
        # globals. Resolve it directly from the invoice/customer instead.
        doc_customer_group = str(
            invoice_doc.get("customer_group") or ""
        ).strip().lower()

        if not doc_customer_group and invoice_doc.get("customer"):
            doc_customer_group = str(
                frappe.db.get_value(
                    "Customer",
                    invoice_doc.get("customer"),
                    "customer_group",
                ) or ""
            ).strip().lower()

        if rule_customer_group != doc_customer_group:
            result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " requires Customer Group " + str(pr.get("customer_group") or "") + "."
            return result

    if pr.get("territory"):
        if str(pr.get("territory") or "").strip() != str(invoice_doc.get("territory") or "").strip():
            result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " does not match the invoice Territory."
            return result

    if pr.get("for_price_list"):
        if str(pr.get("for_price_list") or "").strip() != str(invoice_doc.get("selling_price_list") or "").strip():
            result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " does not match the invoice Price List."
            return result

    if pr.get("currency"):
        if str(pr.get("currency") or "").strip() != str(invoice_doc.get("currency") or "").strip():
            result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " does not match the invoice Currency."
            return result

    # Dynamic Condition, if configured.
    # frappe.safe_eval is NOT exposed to Server Scripts (safe_exec), so a Python
    # condition cannot be evaluated here. This was already the effective result
    # before (the call always raised); the reason is now explicit.
    if str(pr.get("condition") or "").strip():
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " has a Python Condition, which a Server Script cannot evaluate. Use Applicable For / Min-Max fields instead of the Condition."
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
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " minimum quantity has not been reached."
        return result

    if max_qty and total_qty > max_qty:
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " maximum quantity has been exceeded."
        return result

    if min_amt and total_amount < min_amt:
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " minimum transaction amount has not been reached."
        return result

    if max_amt and total_amount > max_amt:
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " maximum transaction amount has been exceeded."
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
            "reason": ""
        }

    if apply_on not in ("Brand", "Item Code", "Item Group"):
        result["reason"] = "Pricing Rule " + str(pricing_rule_name) + " has an unsupported Apply On value: " + str(apply_on or "(blank)") + "."
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

    if not eligible_keys:
        result["reason"] = "No invoice item matches the Pricing Rule " + str(pricing_rule_name) + " criteria."

    return {
        "valid": True if eligible_keys else False,
        "restricted": True,
        "eligible_keys": eligible_keys,
        "reason": result.get("reason") or ""
    }


def is_non_coupon_pricing_rule(rule_names):
    # Return True only when every Pricing Rule listed on the item is a genuine
    # NON-coupon Pricing Rule.
    #
    # IMPORTANT FOR FRAPPE SAFE_EXEC:
    # This function is fully self-contained and does not call another function
    # defined in this Server Script.
    names_text = str(rule_names or "").strip()
    if not names_text:
        return False

    # ERPNext returns item.pricing_rules as a JSON string such as:
    #   ["PRLE-0006"]
    # Normalise that format before checking the rule names.
    clean_names_text = names_text
    if clean_names_text.startswith("[") and clean_names_text.endswith("]"):
        clean_names_text = clean_names_text[1:-1]

    names = []
    for part in clean_names_text.replace("\n", ",").split(","):
        rule_name = str(part or "").strip()
        rule_name = rule_name.strip('"').strip("'")
        if rule_name:
            names.append(rule_name)

    if not names:
        return False

    for rule_name in names:
        coupon_based = frappe.db.get_value(
            "Pricing Rule",
            rule_name,
            "coupon_code_based",
        )

        # Missing rule is not a valid native Pricing Rule.
        if coupon_based is None:
            return False

        if frappe.utils.cint(coupon_based or 0) == 1:
            return False

        # Some existing coupon Pricing Rules are linked from Coupon Code even
        # when coupon_code_based was not enabled. Treat those as coupon rules too.
        linked_coupon = frappe.db.get_value(
            "Coupon Code",
            {"pricing_rule": rule_name},
            "name",
        )

        if linked_coupon:
            return False

    return True


def has_coupon_pricing_rule(rule_names):
    # Return True when at least one Pricing Rule on the item is coupon-controlled.
    #
    # IMPORTANT FOR FRAPPE SAFE_EXEC:
    # This function is fully self-contained and does not call another function
    # defined in this Server Script.
    names_text = str(rule_names or "").strip()
    if not names_text:
        return False

    clean_names_text = names_text
    if clean_names_text.startswith("[") and clean_names_text.endswith("]"):
        clean_names_text = clean_names_text[1:-1]

    for part in clean_names_text.replace("\n", ",").split(","):
        rule_name = str(part or "").strip()
        rule_name = rule_name.strip('"').strip("'")
        if not rule_name:
            continue

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
    out = {"by_item": {}, "error": ""}

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
                    rule_priority = frappe.utils.cint(rule.get("priority") or 0)
                    current = by_item.get(item_key)
                    if not current or pct > current["pct"]:
                        by_item[item_key] = {
                            "pct": pct,
                            "rule": stamped_name,
                            "priority": rule_priority,
                        }

        out["by_item"] = by_item

    except Exception as native_error:
        out["by_item"] = {}
        out["error"] = str(native_error)

    return out


def rebuild_pricing_rule_detail(invoice_doc, applied_rows):
    # Rebuild the Sales Invoice "Pricing Rule Detail" table so it lists only the
    # rule that actually won on each item. Rows of Product-discount (free item)
    # rules are kept untouched. Self-contained for safe_exec.
    for detail_row in list(invoice_doc.get("pricing_rules") or []):
        detail_rule = str(detail_row.get("pricing_rule") or "").strip()
        detail_type = ""
        if detail_rule:
            detail_type = str(
                frappe.db.get_value("Pricing Rule", detail_rule, "price_or_product_discount") or ""
            ).strip()
        if detail_type == "Product":
            continue
        invoice_doc.remove(detail_row)

    for applied in applied_rows or []:
        if not applied.get("rule"):
            continue
        invoice_doc.append(
            "pricing_rules",
            {
                "pricing_rule": applied.get("rule"),
                "item_code": applied.get("item_code"),
                "child_docname": applied.get("child_docname"),
                "rule_applied": 1,
            },
        )

# =========================================================================
# VAT / HLW — RESOLVE OVERLAPPING MANUALLY SELECTED POS COUPONS
# =========================================================================
# The header has priority; otherwise accept just one applied POS coupon row.
# POS Offer rows are never used to decide selection because multiple offers
# can match the same Brand before a payment is chosen.
restricted_brand_coupon_keys = ("vat26", "vatcd", "hlw15", "hlw10")
if is_pos_context and not discounts_globally_blocked:
    restricted_header_key = str(doc.get("coupon_code") or "").strip().lower()
    selected_restricted_brand_coupon = ""
    applied_restricted_brand_keys = []

    if restricted_header_key in restricted_brand_coupon_keys:
        selected_restricted_brand_coupon = restricted_header_key
    elif not restricted_header_key:
        for restricted_row in doc.get("posa_coupons") or []:
            restricted_key = str(
                restricted_row.get("coupon")
                or restricted_row.get("coupon_code")
                or ""
            ).strip().lower()
            if restricted_row.get("applied") and restricted_key in restricted_brand_coupon_keys:
                if restricted_key not in applied_restricted_brand_keys:
                    applied_restricted_brand_keys.append(restricted_key)
        if len(applied_restricted_brand_keys) == 1:
            selected_restricted_brand_coupon = applied_restricted_brand_keys[0]

    if selected_restricted_brand_coupon:
        doc.coupon_code = selected_restricted_brand_coupon.upper()

    # Clear only conflicting restricted coupon selections. In particular,
    # do not choose based solely on an automatically matching POS Offer.
    for restricted_row in doc.get("posa_coupons") or []:
        restricted_key = str(
            restricted_row.get("coupon")
            or restricted_row.get("coupon_code")
            or ""
        ).strip().lower()
        if restricted_key in restricted_brand_coupon_keys:
            restricted_row.applied = 1 if restricted_key == selected_restricted_brand_coupon else 0

    for restricted_offer_row in doc.get("posa_offers") or []:
        restricted_offer_key = str(restricted_offer_row.get("coupon") or "").strip().lower()
        restricted_offer_title = str(
            restricted_offer_row.get("offer")
            or restricted_offer_row.get("offer_name")
            or restricted_offer_row.get("name")
            or ""
        ).strip().lower()
        detected_restricted_offer = ""
        for restricted_candidate in restricted_brand_coupon_keys:
            if restricted_offer_key == restricted_candidate or restricted_candidate in restricted_offer_title:
                detected_restricted_offer = restricted_candidate
                break
        if detected_restricted_offer and detected_restricted_offer != selected_restricted_brand_coupon:
            restricted_offer_row.applied = 0
            if restricted_offer_row.get("offer_applied") is not None:
                restricted_offer_row.offer_applied = 0

# =========================================================================
# STEP 1: Validate loyalty coupons against Customer Group
# =========================================================================
if doc.customer:
    applied_codes = []
    selected_restricted_coupon_key = str(doc.get("coupon_code") or "").strip().lower()

    if doc.get("coupon_code"):
        applied_codes.append(str(doc.coupon_code or "").strip().lower())

    for row in doc.get("posa_coupons") or []:
        if row.get("applied"):
            c = row.get("coupon") or row.get("coupon_code") or ""
            if c:
                c_key = str(c).strip().lower()

                # VAT26/VATCD/HLW15/HLW10 can share Brand matches. Do not
                # validate a different applied coupon when the header identifies
                # the selected one.
                if c_key in restricted_brand_coupon_keys and selected_restricted_coupon_key in restricted_brand_coupon_keys:
                    if c_key == selected_restricted_coupon_key:
                        applied_codes.append(c_key)
                else:
                    applied_codes.append(c_key)

    for row in doc.get("posa_offers") or []:
        if row.get("applied"):
            offer = str(row.get("offer") or row.get("name") or "").strip().lower()
            # LOYALCS / LOYALCS2 are intentionally NOT taken from posa_offers.
            # POS Awesome can auto-apply those Grand Total offers before a customer
            # exists. The POS loyalty guard above uses Customer Group only.
            if "loyalcs2" in offer or "loyal cs2" in offer:
                pass
            elif "loyalcs" in offer or "loyal cs" in offer:
                pass
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
            elif "codho05" in offer:
                applied_codes.append("codho05")
            # VAT26/VATCD/HLW15/HLW10 are intentionally NOT selected from
            # posa_offers, because their Brand-based offers may overlap.

    # KOKO/MintPay never reject the selected payment because of an existing
    # coupon. They proceed to the final zero-discount cleanup instead.
    if discounts_globally_blocked:
        applied_codes = []

    for code in applied_codes:
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
                msg="<b>Coupon Rejected:</b> 'COS5' does not apply to Gold/Platinum customers. Use the appropriate loyalty coupon manually for this customer group.",
                title="Invalid Coupon",
            )
        if (
            code in ("cos5",)
            and payment_chosen
            and not discounts_globally_blocked
            and effective_payment_type not in allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'COS5' is strictly valid only for <u>Cash On Delivery</u>, <u>Cash</u>, or <u>Bank Transfer</u> orders. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("cos20",)
            and payment_chosen
            and not discounts_globally_blocked
            and effective_payment_type not in cos20_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'COS20' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("pd10",)
            and payment_chosen
            and not discounts_globally_blocked
            and effective_payment_type not in pd10_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'PD10' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("pd5",)
            and payment_chosen
            and not discounts_globally_blocked
            and effective_payment_type not in pd5_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'PD5' is strictly valid only for <u>Credit Card</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("vat26",)
            and payment_chosen
            and not discounts_globally_blocked
            and effective_payment_type not in vat26_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'VAT26' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code in ("vatcd",)
            and payment_chosen
            and not discounts_globally_blocked
            and effective_payment_type not in vatcd_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'VATCD' is strictly valid only for <u>Credit Card</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code == "hlw15"
            and payment_chosen
            and not discounts_globally_blocked
            and effective_payment_type not in hlw15_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'HLW15' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
                title="Invalid Payment Method",
            )
        if (
            code == "hlw10"
            and payment_chosen
            and not discounts_globally_blocked
            and effective_payment_type not in hlw10_allowed_payment_types
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'HLW10' is strictly valid only for <u>Credit Card</u> payments. Please switch the payment type or clear the coupon code to proceed.",
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
    and not discounts_globally_blocked
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
    and not discounts_globally_blocked
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
    and not discounts_globally_blocked
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
    and not discounts_globally_blocked
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
    and not discounts_globally_blocked
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
    and not discounts_globally_blocked
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
    and not discounts_globally_blocked
    and effective_payment_type not in hlw15_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'HLW15' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments. Please switch the payment type or clear the coupon code to proceed.",
        title="Invalid Payment Method",
    )

# =========================================================================
# HLW10 — Credit Card only
# =========================================================================
if (
    str(doc.coupon_code or "").strip().upper() == "HLW10"
    and payment_chosen
    and not discounts_globally_blocked
    and effective_payment_type not in hlw10_allowed_payment_types
):
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    frappe.throw(
        msg="<b>Coupon Rejected:</b> 'HLW10' is strictly valid only for <u>Credit Card</u> payments. Please switch the payment type or clear the coupon code to proceed.",
        title="Invalid Payment Method",
    )

is_pos_sale = bool(doc.get("posa_pos_opening_shift")) or (doc.is_pos and doc.get("pos_profile"))
normal_invoice_coupon_code = str(doc.coupon_code or "").strip()

# GCC PRICE LIST: start every validation from the full GCC Price List Rate and
# remove stale/native discount state BEFORE the normal-invoice/POS coupon engine.
# IMPORTANT: the explicitly selected coupon itself is NOT cleared here.
# The coupon engine below may then apply ONLY that coupon's linked Pricing Rule.
if gcc_coupon_only_restricted:
    doc.ignore_pricing_rule = 1
    doc.additional_discount_percentage = 0.0
    doc.discount_amount = 0.0
    doc.base_discount_amount = 0.0

    # Auto/non-coupon POS Offers are never allowed to drive GCC pricing.
    # Coupon selection remains in coupon_code / posa_coupons and can be
    # reflected back onto the matching coupon offer later by the existing logic.
    for gcc_offer_row in doc.get("posa_offers") or []:
        gcc_offer_row.applied = 0
        if gcc_offer_row.get("offer_applied") is not None:
            gcc_offer_row.offer_applied = 0

    # Remove any existing Pricing Rule Detail rows. If a selected coupon wins,
    # the script rebuilds only that coupon rule later.
    for gcc_detail_row in list(doc.get("pricing_rules") or []):
        doc.remove(gcc_detail_row)

    # Product/free-item rows can only survive if a separate product-discount path
    # already created them. GCC is price-coupon-only in this script, so remove them.
    gcc_non_free_count = 0
    for gcc_item in doc.get("items") or []:
        if frappe.utils.cint(gcc_item.get("is_free_item") or 0) != 1:
            gcc_non_free_count = gcc_non_free_count + 1

    if gcc_non_free_count > 0:
        for gcc_item in list(doc.get("items") or []):
            if frappe.utils.cint(gcc_item.get("is_free_item") or 0) == 1:
                doc.remove(gcc_item)

    # Clear every stale/native/manual line discount and restore the GCC list rate.
    # A valid explicitly selected coupon is re-applied later from this clean base.
    for gcc_item in doc.get("items") or []:
        gcc_price_list_rate = frappe.utils.flt(
            gcc_item.get("price_list_rate")
            or gcc_item.get("rate")
            or 0
        )
        gcc_qty = frappe.utils.flt(gcc_item.get("qty") or 0)

        gcc_item.discount_percentage = 0.0
        gcc_item.discount_amount = 0.0
        gcc_item.base_discount_amount = 0.0
        gcc_item.pricing_rules = ""
        gcc_item.margin_type = ""
        gcc_item.margin_rate_or_amount = 0.0

        gcc_item.rate = gcc_price_list_rate
        gcc_item.amount = gcc_price_list_rate * gcc_qty
        gcc_item.base_rate = gcc_price_list_rate
        gcc_item.base_amount = gcc_item.amount
        gcc_item.net_rate = gcc_price_list_rate
        gcc_item.net_amount = gcc_item.amount
        gcc_item.base_net_rate = gcc_price_list_rate
        gcc_item.base_net_amount = gcc_item.amount

# OGF Price List: clear coupon/POS-offer selection before either the normal-invoice
# or POS discount engine runs. Final hard enforcement below also restores every
# item to Price List Rate as a last line of defence.
if ogf_price_list_restricted:
    doc.ignore_pricing_rule = 1
    doc.coupon_code = ""
    normal_invoice_coupon_code = ""
    doc.additional_discount_percentage = 0.0
    doc.discount_amount = 0.0
    doc.base_discount_amount = 0.0

    for ogf_coupon_row in doc.get("posa_coupons") or []:
        ogf_coupon_row.applied = 0

    for ogf_offer_row in doc.get("posa_offers") or []:
        ogf_offer_row.applied = 0
        if ogf_offer_row.get("offer_applied") is not None:
            ogf_offer_row.offer_applied = 0

# IMPORTANT:
# For a normal Sales Invoice with a selected coupon, this Server Script handles
# Pricing Rule selection itself. Lock ERPNext native Pricing Rule reapplication
# before later calculations so overlapping coupon rules cannot be reapplied
# before this script finishes its own coupon validation.
if not is_pos_sale and normal_invoice_coupon_code:
    doc.ignore_pricing_rule = 1

if not is_pos_sale:
    for row in list(doc.get("posa_coupons") or []):
        doc.remove(row)
    for row in doc.get("posa_offers") or []:
        row.applied = 0

    # =========================================================================
    # KOKO / MintPay restriction for normal Sales Invoices
    # KOKO and MintPay must not receive coupon discounts OR non-coupon Pricing Rule discounts.
    # =========================================================================
    if str(effective_payment_type).strip().upper() in ("KOKO", "MINTPAY"):
        restricted_payment_name = str(effective_payment_type or "").strip()
        restricted_discount_removed = 0

        if normal_invoice_coupon_code:
            restricted_discount_removed = 1

        if (
            frappe.utils.flt(doc.additional_discount_percentage or 0) > 0
            or frappe.utils.flt(doc.discount_amount or 0) > 0
            or frappe.utils.flt(doc.base_discount_amount or 0) > 0
        ):
            restricted_discount_removed = 1

        if doc.get("pricing_rules"):
            restricted_discount_removed = 1

        for restricted_item in doc.items or []:
            restricted_price_list_rate = frappe.utils.flt(
                restricted_item.price_list_rate or 0
            )
            restricted_rate = frappe.utils.flt(restricted_item.rate or 0)

            if (
                frappe.utils.flt(restricted_item.discount_percentage or 0) > 0
                or frappe.utils.flt(restricted_item.discount_amount or 0) > 0
                or frappe.utils.flt(restricted_item.base_discount_amount or 0) > 0
                or str(restricted_item.pricing_rules or "").strip()
                or (
                    restricted_price_list_rate > 0
                    and restricted_rate > 0
                    and restricted_rate < restricted_price_list_rate
                )
            ):
                restricted_discount_removed = 1

        if restricted_discount_removed and not restricted_payment_notice_shown:
            frappe.msgprint(
                msg="<b>" + restricted_payment_name + " payment:</b> Discounts are not allowed for " + restricted_payment_name + ". Existing coupon/Pricing Rule discounts have been removed.",
                title=restricted_payment_name + " Discount Restriction",
                indicator="orange",
                alert=True,
            )
            restricted_payment_notice_shown = 1

        doc.ignore_pricing_rule = 1
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
            and not discounts_globally_blocked
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
            and not discounts_globally_blocked
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
            and not discounts_globally_blocked
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
            and not discounts_globally_blocked
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
            and not discounts_globally_blocked
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
            and not discounts_globally_blocked
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
            and not discounts_globally_blocked
            and effective_payment_type not in hlw15_allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'HLW15' is strictly valid only for <u>Cash</u> or <u>Bank Transfer</u> payments.",
                title="Invalid Payment Method",
            )

        if (
            coupon_key == "hlw10"
            and payment_chosen
            and not discounts_globally_blocked
            and effective_payment_type not in hlw10_allowed_payment_types
        ):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'HLW10' is strictly valid only for <u>Credit Card</u> payments.",
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
        # KOKO and MintPay must not receive coupon discounts.
        if str(effective_payment_type).strip().upper() in ("KOKO", "MINTPAY"):
            doc.coupon_code = ""
            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0

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

        # LOYALCS / LOYALCS2 MUST NOT silently submit without a discount.
        # If the coupon exists on a normal Sales Invoice, submission/save must
        # either apply a valid percentage or stop with a clear reason.
        if coupon_key in ("loyalcs", "loyalcs2"):
            if not coupon:
                frappe.throw(
                    msg="<b>Loyalty Coupon Not Applied:</b> Coupon Code '" + str(coupon_code) + "' does not exist.",
                    title="Loyalty Coupon Validation Failed",
                )

            if not coupon_pricing_rule:
                frappe.throw(
                    msg="<b>Loyalty Coupon Not Applied:</b> Coupon '" + str(coupon_code) + "' is not linked to a Pricing Rule.",
                    title="Loyalty Coupon Validation Failed",
                )

            if coupon_pct <= 0.0:
                frappe.throw(
                    msg="<b>Loyalty Coupon Not Applied:</b> Pricing Rule '" + str(coupon_pricing_rule) + "' has no percentage discount.",
                    title="Loyalty Coupon Validation Failed",
                )

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
                if coupon_key in ("loyalcs", "loyalcs2"):
                    loyalty_reason = str(
                        eligibility.get("reason")
                        or "The linked Pricing Rule is not valid for this Sales Invoice."
                    )
                    frappe.throw(
                        msg="<b>Loyalty Coupon Not Applied:</b> " + loyalty_reason,
                        title="Loyalty Coupon Validation Failed",
                    )

                coupon_pct = 0.0


        # =====================================================================
        # NORMAL SALES INVOICE: genuine NON-coupon Pricing Rules per item
        #
        # frappe.get_attr is NOT exposed to Server Scripts (safe_exec), so the
        # previous _get_pricing_rules / filter_pricing_rules lookup raised on every
        # run and the map was always empty. get_native_pricing_rule_map() evaluates
        # every enabled non-coupon rule directly (not only rules already stamped
        # on the row), so a valid native rule always competes with the coupon.
        # Coupon-linked rules can never enter this map.
        # =====================================================================
        native_pricing_rule_pct_map = {}
        native_pricing_rule_name_map = {}

        # GCC PRICE LIST is coupon-only: never load genuine/non-coupon rules.
        if not gcc_coupon_only_restricted:
            native_lookup = get_native_pricing_rule_map(doc.items or [], doc)
            if native_lookup.get("error"):
                try:
                    frappe.log_error(
                        title="Normal Invoice Pricing Rule Validation Failed",
                        message=str(native_lookup.get("error")),
                    )
                except Exception:
                    pass

            native_by_item = native_lookup.get("by_item") or {}
            for native_key in native_by_item:
                native_entry = native_by_item[native_key]
                if frappe.utils.flt(native_entry.get("pct") or 0) > 0:
                    native_pricing_rule_pct_map[native_key] = frappe.utils.flt(native_entry.get("pct"))
                    native_pricing_rule_name_map[native_key] = str(native_entry.get("rule") or "")

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

                # Free items (Product-discount rules) are left untouched.
                if frappe.utils.cint(item.get("is_free_item") or 0) == 1:
                    running_total = running_total + float(item.amount or 0.0)
                    running_base_total = running_base_total + float(item.amount or 0.0)
                    continue
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
                    final_rule_names = normal_rule_names
                else:
                    final_pct = item_coupon_pct

                    if item_coupon_pct > 0.0 and coupon_pricing_rule:
                        final_rule_names = coupon_pricing_rule
                    else:
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
                    ):
                        manual_rate_override = True

                # GCC PRICE LIST is coupon-only. Manual discounted rates must not
                # override the selected coupon or create a second discount path.
                if gcc_coupon_only_restricted:
                    manual_rate_override = False

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

                # Clear every old discount/rule value before writing the final result.
                item.discount_percentage = final_display_pct
                # Record the per-unit discount separately from the discounted Rate.
                # Manual rate overrides keep zero discount, as before.
                final_unit_discount = 0.0
                if final_display_pct > 0.0 and price_list_rate > final_rate:
                    final_unit_discount = price_list_rate - final_rate
                item.discount_amount = final_unit_discount
                item.base_discount_amount = (
                    final_unit_discount * frappe.utils.flt(doc.get("conversion_rate") or 1)
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

                # Free items (Product-discount rules) are left untouched.
                if frappe.utils.cint(item.get("is_free_item") or 0) == 1:
                    running_total = running_total + float(item.amount or 0.0)
                    running_base_total = running_base_total + float(item.amount or 0.0)
                    continue
                price_list_rate = float(item.price_list_rate or item.rate or 0.0)
                item_qty = float(item.qty or 0.0)

                final_pct = float(final_item_pct_map.get(item_key) or 0.0)
                final_rule_names = str(final_item_rule_map.get(item_key) or "").strip()
                final_rate = frappe.utils.flt(
                    final_item_rate_map.get(item_key)
                    if item_key in final_item_rate_map
                    else item.rate
                )

                item.discount_percentage = final_pct
                # Totals calculation may reset the per-unit discount fields.
                # Restore the actual discount without deducting it twice.
                final_unit_discount = 0.0
                if final_pct > 0.0 and price_list_rate > final_rate:
                    final_unit_discount = price_list_rate - final_rate
                item.discount_amount = final_unit_discount
                item.base_discount_amount = (
                    final_unit_discount * frappe.utils.flt(doc.get("conversion_rate") or 1)
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

            # Pricing Rule Detail must list only the winning rule per item.
            normal_rule_detail_rows = []
            for item in doc.items or []:
                if frappe.utils.cint(item.get("is_free_item") or 0) == 1:
                    continue
                item_key = item.name or str(item.idx or "") or str(item.item_code or "")
                detail_rule_name = str(final_item_rule_map.get(item_key) or "").strip()
                if detail_rule_name:
                    normal_rule_detail_rows.append({
                        "rule": detail_rule_name,
                        "item_code": item.item_code,
                        "child_docname": item.name,
                    })
            rebuild_pricing_rule_detail(doc, normal_rule_detail_rows)

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
        # there is no coupon selected. OGF stays fully blocked, while GCC stays
        # coupon-only, so native Pricing Rules must remain disabled on both.
        doc.ignore_pricing_rule = (
            1
            if ogf_price_list_restricted or gcc_coupon_only_restricted
            else 0
        )
        doc.coupon_code = ""
        doc.additional_discount_percentage = 0.0
        doc.discount_amount = 0.0
        doc.base_discount_amount = 0.0
        doc.calculate_taxes_and_totals()
else:
    # Coupon header after the manual-loyalty guard. If POS Awesome supplied an
    # applied loyalty POS Coupon Detail row, the guard synced that explicit manual
    # selection into doc.coupon_code. Nothing is auto-added from Customer Group.
    pos_incoming_header_coupon_key = str(doc.coupon_code or "").strip().lower()

    # VAT coupon percentages are read from their linked Pricing Rules so this
    # script only controls payment eligibility and does not hard-code the discount.
    vat26_pct = 0.0
    vatcd_pct = 0.0
    pd10_pct = 0.0
    pd5_pct = 0.0

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

    hlw15_pct = 0.0
    hlw10_pct = 0.0
    hlw15_coupon = frappe.db.get_value(
        "Coupon Code", {"coupon_code": "HLW15"}, ["pricing_rule"], as_dict=True,
    )
    if hlw15_coupon and hlw15_coupon.get("pricing_rule"):
        hlw15_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule", hlw15_coupon.get("pricing_rule"), "discount_percentage",
            ) or 0.0
        )
    hlw10_coupon = frappe.db.get_value(
        "Coupon Code", {"coupon_code": "HLW10"}, ["pricing_rule"], as_dict=True,
    )
    if hlw10_coupon and hlw10_coupon.get("pricing_rule"):
        hlw10_pct = frappe.utils.flt(
            frappe.db.get_value(
                "Pricing Rule", hlw10_coupon.get("pricing_rule"), "discount_percentage",
            ) or 0.0
        )

    COUPON_PCT_MAP = {
        "cos5": 5.0,
        "cos20": 20.0,
        "pd10": pd10_pct,
        "pd5": pd5_pct,
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

    # -----------------------------------------------------------------
    # LOYALTY IS MANUAL ONLY
    # -----------------------------------------------------------------
    # Do not create a POS Coupon Detail row, do not fill doc.coupon_code, and do
    # not apply LOYALCS/LOYALCS2 just because the customer is Gold/Platinum.
    # Loyalty is processed below only when the coupon is already present/selected.

    # Map a POS Offer only for coupon rows that already exist; nothing is auto-created.
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

    # LOYALTY IS NOT READ FROM POS OFFER "APPLIED" FLAGS.
    # It counts only when the coupon was explicitly present in the header or in
    # an applied POS Coupon Detail row. The guard above records that manual
    # selection in pos_selected_loyalty_code and never creates a coupon row.
    loyalcs_selected = 1 if pos_selected_loyalty_code == "loyalcs" else 0
    loyalcs2_selected = 1 if pos_selected_loyalty_code == "loyalcs2" else 0

    # Customer Group is an eligibility check only, never an auto-application trigger.
    if pos_allowed_loyalty_code != "loyalcs":
        loyalcs_selected = 0
    if pos_allowed_loyalty_code != "loyalcs2":
        loyalcs2_selected = 0

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
    # VAT26 / VATCD / HLW15 / HLW10 — explicit overlapping coupon selection
    # Never infer any of these coupons from auto-matching POS Offer rows.
    # The header wins; otherwise exactly one applied POS coupon row may select.
    # =========================================================================
    selected_restricted_coupon = ""
    header_coupon_key = pos_incoming_header_coupon_key
    if header_coupon_key in restricted_brand_coupon_keys:
        selected_restricted_coupon = header_coupon_key
    elif not header_coupon_key:
        matching_restricted_rows = []
        for row in doc.get("posa_coupons") or []:
            if not row.get("applied"):
                continue
            code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
            if code in restricted_brand_coupon_keys and code not in matching_restricted_rows:
                matching_restricted_rows.append(code)
        if len(matching_restricted_rows) == 1:
            selected_restricted_coupon = matching_restricted_rows[0]

    vat26_selected = 1 if selected_restricted_coupon == "vat26" else 0
    vatcd_selected = 1 if selected_restricted_coupon == "vatcd" else 0
    hlw15_selected = 1 if selected_restricted_coupon == "hlw15" else 0
    hlw10_selected = 1 if selected_restricted_coupon == "hlw10" else 0

    # GCC PRICE LIST: coupon selection MUST come from the coupon itself, never
    # from an automatically matched POS Offer. This prevents a normal/auto offer
    # from becoming a discount on GCC before the cashier explicitly adds a coupon.
    gcc_selected_coupon_key = ""
    gcc_selected_coupon_code = ""

    if gcc_coupon_only_restricted:
        # Any explicitly selected Coupon Code is allowed to participate on GCC,
        # not just the hard-coded coupon list used by older POS logic.
        gcc_selected_coupon_code = str(
            doc.get("coupon_code") or pos_incoming_header_coupon_key or ""
        ).strip()
        gcc_selected_coupon_key = gcc_selected_coupon_code.lower()

        if not gcc_selected_coupon_key:
            for gcc_coupon_row in doc.get("posa_coupons") or []:
                if not gcc_coupon_row.get("applied"):
                    continue
                gcc_selected_coupon_code = str(
                    gcc_coupon_row.get("coupon")
                    or gcc_coupon_row.get("coupon_code")
                    or ""
                ).strip()
                gcc_selected_coupon_key = gcc_selected_coupon_code.lower()
                if gcc_selected_coupon_key:
                    break

        # Reset every offer-derived selection flag, then enable only the coupon
        # the cashier actually selected.
        cos5_selected = 0
        cos20_selected = 0
        pd10_selected = 0
        pd5_selected = 0
        loyalcs_selected = 0
        loyalcs2_selected = 0
        julyv20_selected = 0
        wha25_selected = 0
        ngb20_selected = 0
        selected_restricted_coupon = ""
        vat26_selected = 0
        vatcd_selected = 0
        hlw15_selected = 0
        hlw10_selected = 0

        if gcc_selected_coupon_key == "cos5":
            if customer_group not in ("gold", "platinum"):
                cos5_selected = 1
        elif gcc_selected_coupon_key == "cos20":
            cos20_selected = 1
        elif gcc_selected_coupon_key == "pd10":
            pd10_selected = 1
        elif gcc_selected_coupon_key == "pd5":
            pd5_selected = 1
        elif gcc_selected_coupon_key == "loyalcs":
            if pos_allowed_loyalty_code == "loyalcs":
                loyalcs_selected = 1
        elif gcc_selected_coupon_key == "loyalcs2":
            if pos_allowed_loyalty_code == "loyalcs2":
                loyalcs2_selected = 1
        elif gcc_selected_coupon_key == "julyv20":
            julyv20_selected = 1
        elif gcc_selected_coupon_key == "wha25":
            wha25_selected = 1
        elif gcc_selected_coupon_key == "ngb20":
            ngb20_selected = 1
        elif gcc_selected_coupon_key in restricted_brand_coupon_keys:
            selected_restricted_coupon = gcc_selected_coupon_key
            vat26_selected = 1 if gcc_selected_coupon_key == "vat26" else 0
            vatcd_selected = 1 if gcc_selected_coupon_key == "vatcd" else 0
            hlw15_selected = 1 if gcc_selected_coupon_key == "hlw15" else 0
            hlw10_selected = 1 if gcc_selected_coupon_key == "hlw10" else 0

    best_code = ""
    best_pct = 0.0

    if str(effective_payment_type).strip().upper() not in ("KOKO", "MINTPAY"):
        # When any VAT/HLW Brand coupon was explicitly selected, use that
        # coupon alone; ignore other overlapping POS Offer matches.
        #
        # This does NOT give the coupon priority over normal non-coupon Pricing
        # Rules. The native rule lookup below still runs per item, and the existing
        # highest-discount comparison keeps whichever is larger:
        # selected coupon discount vs eligible non-coupon Pricing Rule discount.
        if selected_restricted_coupon == "vat26":
            if not payment_chosen or vat26_payment_ok:
                best_code = "vat26"
                best_pct = COUPON_PCT_MAP[best_code]

        elif selected_restricted_coupon == "vatcd":
            if not payment_chosen or vatcd_payment_ok:
                best_code = "vatcd"
                best_pct = COUPON_PCT_MAP[best_code]

        elif selected_restricted_coupon == "hlw15":
            if not payment_chosen or hlw15_payment_ok:
                best_code = "hlw15"
                best_pct = COUPON_PCT_MAP[best_code]

        elif selected_restricted_coupon == "hlw10":
            if not payment_chosen or hlw10_payment_ok:
                best_code = "hlw10"
                best_pct = COUPON_PCT_MAP[best_code]

        # If no restricted Brand coupon is selected, use existing coupon logic.
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
        elif loyalcs_selected and pos_allowed_loyalty_code == "loyalcs":
            best_code = "loyalcs"
            best_pct = COUPON_PCT_MAP[best_code]
        elif loyalcs2_selected and pos_allowed_loyalty_code == "loyalcs2":
            best_code = "loyalcs2"
            best_pct = COUPON_PCT_MAP[best_code]
        elif cos5_selected and customer_group not in ("gold", "platinum"):
            if not payment_chosen or payment_ok:
                best_code = "cos5"
                best_pct = COUPON_PCT_MAP[best_code]
        elif julyv20_selected:
            best_code = "julyv20"
            best_pct = COUPON_PCT_MAP[best_code]
        elif not best_code:
            # Campaign coupons not in COUPON_PCT_MAP (e.g. NG15). Still run
            # max(coupon %, native item-rule %) so a 15% coupon beats 10% PRLE-0006.
            unknown_coupon = str(doc.get("coupon_code") or "").strip()
            if not unknown_coupon:
                for unknown_row in doc.get("posa_coupons") or []:
                    if unknown_row.get("applied"):
                        unknown_coupon = str(
                            unknown_row.get("coupon")
                            or unknown_row.get("coupon_code")
                            or ""
                        ).strip()
                        if unknown_coupon:
                            break
            unknown_key = unknown_coupon.lower()
            managed_keys = (
                "cos5",
                "cos20",
                "pd10",
                "pd5",
                "loyalcs",
                "loyalcs2",
                "julyv20",
                "wha25",
                "vat26",
                "vatcd",
                "hlw15",
                "hlw10",
                "ngb20",
            )
            if unknown_key and unknown_key not in managed_keys:
                unknown_coupon_doc = frappe.db.get_value(
                    "Coupon Code",
                    {"coupon_code": unknown_coupon},
                    ["coupon_code", "pricing_rule"],
                    as_dict=True,
                )
                if unknown_coupon_doc and unknown_coupon_doc.get("pricing_rule"):
                    unknown_pr = frappe.db.get_value(
                        "Pricing Rule",
                        unknown_coupon_doc.get("pricing_rule"),
                        ["discount_percentage", "disable"],
                        as_dict=True,
                    )
                    if (
                        unknown_pr
                        and not frappe.utils.cint(unknown_pr.get("disable") or 0)
                        and frappe.utils.flt(unknown_pr.get("discount_percentage") or 0) > 0
                    ):
                        best_code = str(
                            unknown_coupon_doc.get("coupon_code") or unknown_coupon
                        ).strip().lower()
                        best_pct = frappe.utils.flt(
                            unknown_pr.get("discount_percentage")
                        )

    # GCC PRICE LIST: the explicitly selected Coupon Code is the ONLY discount
    # candidate. Resolve its linked Pricing Rule dynamically so future/new coupon
    # codes also work on GCC without being added to COUPON_PCT_MAP.
    if gcc_coupon_only_restricted:
        best_code = ""
        best_pct = 0.0

        # GCC dynamically resolves selected coupons. Do not allow that generic
        # percentage lookup to bypass HLW payment restrictions.
        if (
            payment_chosen
            and not discounts_globally_blocked
            and (
                (gcc_selected_coupon_key == "hlw15" and not hlw15_payment_ok)
                or (gcc_selected_coupon_key == "hlw10" and not hlw10_payment_ok)
            )
        ):
            frappe.throw(
                msg="<b>Coupon Rejected:</b> 'HLW15' requires Cash or Bank Transfer and 'HLW10' requires Credit Card.",
                title="Invalid Payment Method",
            )

        if gcc_selected_coupon_code:
            gcc_coupon = frappe.db.get_value(
                "Coupon Code",
                {"coupon_code": gcc_selected_coupon_code},
                ["coupon_code", "pricing_rule"],
                as_dict=True,
            )

            if gcc_coupon and gcc_coupon.get("pricing_rule"):
                gcc_coupon_pr = frappe.db.get_value(
                    "Pricing Rule",
                    gcc_coupon.get("pricing_rule"),
                    ["discount_percentage", "discount_amount", "rate_or_discount"],
                    as_dict=True,
                )

                if gcc_coupon_pr:
                    # Current POS coupon engine is percentage-based. Keep the same
                    # behavior as the rest of this script and read Discount Percentage.
                    gcc_coupon_pct = frappe.utils.flt(
                        gcc_coupon_pr.get("discount_percentage") or 0
                    )

                    if gcc_coupon_pct > 0:
                        best_code = str(
                            gcc_coupon.get("coupon_code")
                            or gcc_selected_coupon_code
                        ).strip().lower()
                        best_pct = gcc_coupon_pct

    if best_code:
        if gcc_coupon_only_restricted and gcc_selected_coupon_code:
            gcc_canonical_coupon = frappe.db.get_value(
                "Coupon Code",
                {"coupon_code": gcc_selected_coupon_code},
                "coupon_code",
            )
            doc.coupon_code = str(
                gcc_canonical_coupon or gcc_selected_coupon_code
            ).strip()
        else:
            doc.coupon_code = COUPON_HEADER_MAP.get(best_code, best_code.upper())
    elif selected_restricted_coupon:
        # Preserve an explicitly selected VAT/HLW coupon header if no discount
        # was produced; payment rejection is handled by validation above.
        doc.coupon_code = COUPON_HEADER_MAP.get(
            selected_restricted_coupon, selected_restricted_coupon.upper()
        )
    elif not best_code and str(doc.coupon_code or "").strip().upper() in ("COS5", "COS20", "PD10", "PD5", "LOYALCS", "LOYALCS2", "JULYV20", "WHA25", "VAT26", "VATCD", "HLW15", "HLW10", "NGB20"):
        doc.coupon_code = ""

    # Keep only the winning coupon row applied.
    for row in doc.get("posa_coupons") or []:
        code = str(row.get("coupon") or row.get("coupon_code") or "").strip().lower()
        if code == "codho05":
            row.applied = 0
        elif code in ("cos5", "cos20", "pd10", "pd5", "loyalcs", "loyalcs2", "julyv20", "wha25", "vat26", "vatcd", "hlw15", "hlw10", "ngb20"):
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
        elif "hlw15" in offer:
            code = "hlw15"
        elif "hlw10" in offer:
            code = "hlw10"
        elif "ngb20" in offer or "negombo" in offer:
            code = "ngb20"

        # Only alter offers that we positively identify as coupon-based offers.
        # Unknown/non-coupon offers keep their existing applied state.
        if code:
            row.applied = 1 if code == best_code else 0

    coupon_pct = float(best_pct or 0.0)
    code_key = str(doc.coupon_code or "").strip().lower()

    # Never allow a stale loyalty header to bypass Customer Group eligibility.
    if code_key == "loyalcs" and pos_allowed_loyalty_code != "loyalcs":
        doc.coupon_code = ""
        code_key = ""
        coupon_pct = 0.0
        invalid_pos_loyalty_discount_found = 1
    elif code_key == "loyalcs2" and pos_allowed_loyalty_code != "loyalcs2":
        doc.coupon_code = ""
        code_key = ""
        coupon_pct = 0.0
        invalid_pos_loyalty_discount_found = 1

    if invalid_pos_loyalty_discount_found:
        doc.additional_discount_percentage = 0.0
        doc.discount_amount = 0.0
        doc.base_discount_amount = 0.0

    if coupon_pct == 0.0 and code_key in COUPON_PCT_MAP:
        coupon_pct = COUPON_PCT_MAP[code_key]

    # KOKO / MintPay: no coupon is evaluated at all, so no coupon/loyalty
    # validation can throw. The final hard enforcement clears everything.
    if discounts_globally_blocked:
        coupon_pct = 0.0
        code_key = ""

    # Only items matching the coupon's own Pricing Rule condition (Brand /
    # Item Code / Item Group) get the coupon discount. Rules configured as
    # "Transaction" (whole-cart, e.g. COS5/LOYALCS/LOYALCS2) stay unrestricted,
    # exactly as before this fix.
    coupon_restricted = False
    coupon_eligible_keys = set()
    coupon_pricing_rule = ""
    if coupon_pct > 0.0 and doc.coupon_code:
        coupon_pricing_rule = str(
            frappe.db.get_value(
                "Coupon Code", {"coupon_code": doc.coupon_code}, "pricing_rule"
            ) or ""
        ).strip()
        if coupon_pricing_rule:
            eligibility = get_coupon_pricing_rule_eligible_keys(
                coupon_pricing_rule,
                doc.items or [],
                coupon_code=doc.coupon_code,
                invoice_doc=doc
            )
            coupon_restricted = eligibility["restricted"]
            coupon_eligible_keys = eligibility["eligible_keys"]

            if not eligibility.get("valid"):
                if code_key in ("loyalcs", "loyalcs2"):
                    loyalty_reason = str(
                        eligibility.get("reason")
                        or "The linked loyalty Pricing Rule is not valid for this POS invoice."
                    )
                    frappe.throw(
                        msg="<b>Loyalty Coupon Not Applied:</b> " + loyalty_reason,
                        title="Loyalty Coupon Validation Failed",
                    )

                coupon_pct = 0.0
                coupon_pricing_rule = ""

    # =========================================================================
    # POS: genuine NON-coupon ERPNext Pricing Rules per item
    # =========================================================================
    # Evaluated deterministically by get_native_pricing_rule_map(), because
    # frappe.get_attr (used previously for get_item_details) is not available in
    # Server Scripts and the old lookup always failed silently. Coupon-linked
    # rules (coupon_code_based OR linked from any Coupon Code, e.g. LOYALCS /
    # LOYALCS2 / VAT26 / VATCD / HLW15 / HLW10 / JULYV20) can never enter this map.
    native_pricing_rule_pct_map = {}
    native_pricing_rule_name_map = {}

    if not discounts_globally_blocked and not gcc_coupon_only_restricted:
        native_lookup = get_native_pricing_rule_map(doc.items or [], doc)
        if native_lookup.get("error"):
            try:
                frappe.log_error(
                    title="POS Pricing Rule Lookup Failed",
                    message=str(native_lookup.get("error")),
                )
            except Exception:
                pass
        native_by_item = native_lookup.get("by_item") or {}
        for native_key in native_by_item:
            native_entry = native_by_item[native_key]
            if frappe.utils.flt(native_entry.get("pct") or 0) > 0:
                native_pricing_rule_pct_map[native_key] = frappe.utils.flt(native_entry.get("pct"))
                native_pricing_rule_name_map[native_key] = str(native_entry.get("rule") or "")

    pos_rate_precision = 2
    try:
        if doc.items:
            pos_rate_precision = frappe.utils.cint(doc.items[0].precision("rate")) or 2
    except Exception:
        pos_rate_precision = 2

    # Per item: highest of (valid native rule %, eligible coupon %).
    # KOKO / MintPay: 0% on every item.
    pos_final_map = {}
    pos_rule_detail_rows = []
    has_line_discount = False

    if doc.items:
        for item in doc.items:
            # Free items created by Product-discount rules are left untouched.
            if frappe.utils.cint(item.get("is_free_item") or 0) == 1:
                continue

            price_list_rate = float(item.price_list_rate or 0.0)
            if price_list_rate == 0.0:
                price_list_rate = float(item.rate or 0.0)
            item_qty = float(item.qty or 0.0)
            item_key = item.name or str(item.idx or "") or str(item.item_code or "")

            native_pct = float(native_pricing_rule_pct_map.get(item_key) or 0.0)
            native_rule = str(native_pricing_rule_name_map.get(item_key) or "").strip()

            item_coupon_pct = coupon_pct
            if coupon_restricted and item_key not in coupon_eligible_keys:
                item_coupon_pct = 0.0

            winner_pct = 0.0
            winner_rule = ""
            if discounts_globally_blocked:
                winner_pct = 0.0
                winner_rule = ""
            elif gcc_coupon_only_restricted:
                # GCC allows ONLY the explicitly selected coupon. Native rules
                # never compete, even if stale rule data existed on the row.
                winner_pct = item_coupon_pct if item_coupon_pct > 0.0 else 0.0
                winner_rule = coupon_pricing_rule if winner_pct > 0.0 else ""
            elif native_pct > item_coupon_pct:
                winner_pct = native_pct
                winner_rule = native_rule
            elif item_coupon_pct > 0.0:
                winner_pct = item_coupon_pct
                winner_rule = coupon_pricing_rule

            # ERPNext v14's validate path calls update_pricing_rule_uom() for every
            # rule found in Sales Invoice Item.pricing_rules. That function only
            # knows Item Code / Item Group / Brand child tables. A Transaction-level
            # coupon rule (for example COS5) produces child_doc=None and crashes with
            # TypeError: 'NoneType' object is not iterable.
            #
            # Keep the winning rule internally for our own calculation, but stamp it
            # into item.pricing_rules only when ERPNext can safely validate its UOM.
            winner_item_rule = ""
            if winner_rule:
                winner_apply_on = str(
                    frappe.db.get_value(
                        "Pricing Rule", winner_rule, "apply_on"
                    ) or ""
                ).strip()
                if winner_apply_on in ("Item Code", "Item Group", "Brand"):
                    winner_item_rule = winner_rule

            if winner_pct > 0.0:
                winner_rate = frappe.utils.flt(
                    price_list_rate * (1.0 - winner_pct / 100.0),
                    pos_rate_precision,
                )
                has_line_discount = True
            else:
                winner_rate = price_list_rate

            pos_final_map[item_key] = {
                "pct": winner_pct,
                "rule": winner_rule,
                "item_rule": winner_item_rule,
                "rate": winner_rate,
            }

            # Clear every stale discount/rule/margin before writing the winner.
            item.discount_percentage = winner_pct
            item.discount_amount = (price_list_rate - winner_rate) if winner_pct > 0.0 else 0.0
            item.base_discount_amount = (
                item.discount_amount
                * frappe.utils.flt(doc.get("conversion_rate") or 1)
            )
            item.margin_type = ""
            item.margin_rate_or_amount = 0.0
            item.pricing_rules = ('["' + winner_item_rule + '"]') if winner_item_rule else ""

            item.rate = winner_rate
            item.amount = winner_rate * item_qty
            item.base_rate = winner_rate
            item.base_amount = item.amount
            item.net_rate = winner_rate
            item.net_amount = item.amount
            item.base_net_rate = winner_rate
            item.base_net_amount = item.amount

            # Pricing Rule Detail is item-oriented too. Do not write a Transaction
            # rule as an item-level detail row. The selected coupon remains recorded
            # in doc.coupon_code and the calculated percentage/rate remains on the item.
            if winner_item_rule:
                pos_rule_detail_rows.append({
                    "rule": winner_item_rule,
                    "item_code": item.item_code,
                    "child_docname": item.name,
                })

        if coupon_pct > 0.0 or has_line_discount or invalid_pos_loyalty_discount_found:
            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0

        # Pricing Rule Detail must list only the winning rules (no stale coupon rows).
        rebuild_pricing_rule_detail(doc, pos_rule_detail_rows)

        # POSA must collect the exact invoice amount. Disabling rounding here keeps
        # outstanding_amount / paid_amount / GL consistent with grand_total
        # (forcing rounded_total afterwards could leave a small outstanding).
        doc.disable_rounded_total = 1

        # Stop the native engine re-introducing a rule during this calculation.
        doc.ignore_pricing_rule = 1
        doc.calculate_taxes_and_totals()

        # Re-assert the exact per-item result in case the calculation rewrote it.
        pos_needs_recalc = False
        for item in doc.items or []:
            if frappe.utils.cint(item.get("is_free_item") or 0) == 1:
                continue
            item_key = item.name or str(item.idx or "") or str(item.item_code or "")
            final_entry = pos_final_map.get(item_key)
            if not final_entry:
                continue
            if abs(frappe.utils.flt(item.rate or 0) - final_entry["rate"]) > 0.000001:
                item.rate = final_entry["rate"]
                pos_needs_recalc = True
            item.discount_percentage = final_entry["pct"]

            # calculate_taxes_and_totals() can clear the Discount Amount fields
            # even when the discounted Rate and Discount % remain correct.
            # Restore the per-unit discount from Price List Rate -> final Rate.
            final_price_list_rate = frappe.utils.flt(
                item.price_list_rate or item.rate or 0
            )
            final_unit_discount_amount = 0.0
            if (
                frappe.utils.flt(final_entry["pct"] or 0) > 0
                and final_price_list_rate > frappe.utils.flt(final_entry["rate"] or 0)
            ):
                final_unit_discount_amount = (
                    final_price_list_rate
                    - frappe.utils.flt(final_entry["rate"] or 0)
                )

            item.discount_amount = final_unit_discount_amount
            item.base_discount_amount = (
                final_unit_discount_amount
                * frappe.utils.flt(doc.get("conversion_rate") or 1)
            )
            item.margin_type = ""
            item.margin_rate_or_amount = 0.0
            item_rule_name = str(final_entry.get("item_rule") or "").strip()
            item.pricing_rules = ('["' + item_rule_name + '"]') if item_rule_name else ""

        if pos_needs_recalc:
            doc.calculate_taxes_and_totals()
            for item in doc.items or []:
                item_key = item.name or str(item.idx or "") or str(item.item_code or "")
                final_entry = pos_final_map.get(item_key)
                if not final_entry:
                    continue
                item.discount_percentage = final_entry["pct"]

                # The second totals pass can clear Discount Amount again, so
                # restore it here too before POS Awesome receives the document.
                final_price_list_rate = frappe.utils.flt(
                    item.price_list_rate or item.rate or 0
                )
                final_unit_discount_amount = 0.0
                if (
                    frappe.utils.flt(final_entry["pct"] or 0) > 0
                    and final_price_list_rate > frappe.utils.flt(final_entry["rate"] or 0)
                ):
                    final_unit_discount_amount = (
                        final_price_list_rate
                        - frappe.utils.flt(final_entry["rate"] or 0)
                    )

                item.discount_amount = final_unit_discount_amount
                item.base_discount_amount = (
                    final_unit_discount_amount
                    * frappe.utils.flt(doc.get("conversion_rate") or 1)
                )
                item_rule_name = str(final_entry.get("item_rule") or "").strip()
                item.pricing_rules = ('["' + item_rule_name + '"]') if item_rule_name else ""

        # This script now owns the final POS pricing result. Keep ERPNext's native
        # pricing pass disabled through validate/save. If ignore_pricing_rule is set
        # back to 0 here, ERPNext re-reads item.pricing_rules during validate and a
        # Transaction-level coupon rule can crash update_pricing_rule_uom(). It could
        # also overwrite the higher-of coupon/native result calculated above.
        doc.ignore_pricing_rule = 1

        if best_code:
            doc.coupon_code = COUPON_HEADER_MAP.get(best_code, best_code.upper())

        if invalid_pos_loyalty_discount_found:
            doc.additional_discount_percentage = 0.0
            doc.discount_amount = 0.0
            doc.base_discount_amount = 0.0

        # =====================================================================
        # Always sync rounded_total to grand_total after ALL calculations so
        # POSA collects the exact invoice amount without rounding.
        # =====================================================================
        doc.rounded_total = doc.grand_total
        doc.base_rounded_total = doc.base_grand_total
        doc.rounding_adjustment = 0.0
        doc.base_rounding_adjustment = 0.0



# =========================================================================
# FINAL HARD OGF PRICE LIST ENFORCEMENT
# =========================================================================
# OGF Price List must NEVER receive a discount, regardless of payment method.
# This is intentionally independent from KOKO/MintPay. It removes coupons,
# POS Offers, Pricing Rules, free-item rules, header discounts, line discounts
# and manually reduced rates, then rebuilds every item from its Price List Rate.
if ogf_price_list_restricted:
    ogf_discount_removed = 1 if incoming_discount_present else 0

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

    # Inform the cashier/user, but do not block the sale.
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

    # If POS already populated a payment amount from a discounted total, move the
    # difference onto the first non-zero payment row so the sale still settles at
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

# =========================================================================
# FINAL HARD KOKO / MINTPAY ENFORCEMENT
# =========================================================================
# This MUST stay at the very end of the Server Script.
#
# KOKO / MintPay always allow the sale. Every coupon, POS Offer, Pricing Rule
# (incl. the Pricing Rule Detail table), free item from a Product rule, line
# discount, manual discounted rate and header discount is removed and every
# row goes back to its Price List Rate. Nothing here throws, and the selected
# KOKO / MintPay payment row is kept (never switched back to Cash).
final_restricted_payment = restricted_payment_key

# A non-zero KOKO/MintPay payment row always wins.
for final_payment_row in doc.get("payments") or []:
    final_mop = str(final_payment_row.get("mode_of_payment") or "").strip().upper()
    final_amount = frappe.utils.flt(final_payment_row.get("amount") or 0)

    if final_amount > 0 and final_mop in ("KOKO", "MINTPAY"):
        final_restricted_payment = final_mop

if final_restricted_payment in ("KOKO", "MINTPAY"):
    final_restricted_payment_name = "KOKO" if final_restricted_payment == "KOKO" else "MintPay"

    # incoming_discount_present was captured before this script changed anything,
    # so the notice is still shown when an earlier branch already zeroed values.
    final_restricted_discount_removed = 1 if incoming_discount_present else 0

    if str(doc.coupon_code or "").strip():
        final_restricted_discount_removed = 1

    if (
        frappe.utils.flt(doc.additional_discount_percentage or 0) > 0
        or frappe.utils.flt(doc.discount_amount or 0) > 0
        or frappe.utils.flt(doc.base_discount_amount or 0) > 0
    ):
        final_restricted_discount_removed = 1

    if doc.get("pricing_rules"):
        final_restricted_discount_removed = 1

    for final_notice_item in doc.items or []:
        final_notice_price_list_rate = frappe.utils.flt(
            final_notice_item.price_list_rate or 0
        )
        final_notice_rate = frappe.utils.flt(final_notice_item.rate or 0)

        if (
            frappe.utils.flt(final_notice_item.discount_percentage or 0) > 0
            or frappe.utils.flt(final_notice_item.discount_amount or 0) > 0
            or frappe.utils.flt(final_notice_item.base_discount_amount or 0) > 0
            or str(final_notice_item.pricing_rules or "").strip()
            or frappe.utils.cint(final_notice_item.get("is_free_item") or 0) == 1
            or (
                final_notice_price_list_rate > 0
                and final_notice_rate > 0
                and final_notice_rate < final_notice_price_list_rate
            )
        ):
            final_restricted_discount_removed = 1

    if final_restricted_discount_removed and not restricted_payment_notice_shown:
        frappe.msgprint(
            msg="<b>" + final_restricted_payment_name + " payment:</b> Discounts are not allowed for " + final_restricted_payment_name + ". Existing coupon/Pricing Rule discounts have been removed.",
            title=final_restricted_payment_name + " Discount Restriction",
            indicator="orange",
            alert=True,
        )
        restricted_payment_notice_shown = 1

    doc.ignore_pricing_rule = 1
    doc.coupon_code = ""
    doc.additional_discount_percentage = 0.0
    doc.discount_amount = 0.0
    doc.base_discount_amount = 0.0

    # Remove POS coupon/offer application state too.
    for final_coupon_row in doc.get("posa_coupons") or []:
        final_coupon_row.applied = 0

    for final_offer_row in doc.get("posa_offers") or []:
        final_offer_row.applied = 0

    # Free items only exist because of a Product-discount Pricing Rule.
    final_non_free_count = 0
    for final_item in doc.items or []:
        if frappe.utils.cint(final_item.get("is_free_item") or 0) != 1:
            final_non_free_count = final_non_free_count + 1
    if final_non_free_count > 0:
        for final_item in list(doc.items or []):
            if frappe.utils.cint(final_item.get("is_free_item") or 0) == 1:
                doc.remove(final_item)

    # Pricing Rule Detail table: nothing applies on KOKO / MintPay.
    for final_detail_row in list(doc.get("pricing_rules") or []):
        doc.remove(final_detail_row)

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

    if is_pos_sale:
        doc.disable_rounded_total = 1

    # First recalculation with Pricing Rules disabled.
    doc.calculate_taxes_and_totals()

    # Defensive second enforcement in case the calculation rewrote a row.
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

    # Recalculate totals from the enforced full rates.
    doc.calculate_taxes_and_totals()

    # Preserve the selected KOKO/MintPay payment. The full-price total can be
    # higher than what POS Awesome put on the payment row while the invoice was
    # still discounted: put the difference on the KOKO/MintPay row instead of
    # letting the UI fall back to its default Cash payment.
    restricted_payment_row = None
    total_payment_amount = 0.0

    for payment_row in doc.get("payments") or []:
        payment_mop = str(payment_row.get("mode_of_payment") or "").strip().upper()
        payment_amount = frappe.utils.flt(payment_row.get("amount") or 0)

        total_payment_amount = total_payment_amount + payment_amount

        if (
            payment_mop == final_restricted_payment
            and payment_amount > 0
            and restricted_payment_row is None
        ):
            restricted_payment_row = payment_row

    final_payment_changed = 0
    if restricted_payment_row:
        target_total = frappe.utils.flt(doc.grand_total or 0)
        if is_pos_sale and frappe.utils.flt(doc.rounded_total or 0) > 0 and not frappe.utils.cint(doc.get("disable_rounded_total") or 0):
            target_total = frappe.utils.flt(doc.rounded_total or 0)

        payment_difference = target_total - total_payment_amount

        if abs(payment_difference) > 0.000001:
            new_restricted_amount = (
                frappe.utils.flt(restricted_payment_row.get("amount") or 0)
                + payment_difference
            )

            if new_restricted_amount < 0:
                new_restricted_amount = 0.0

            restricted_payment_row.amount = new_restricted_amount
            restricted_payment_row.base_amount = new_restricted_amount * frappe.utils.flt(
                doc.get("conversion_rate") or 1
            )
            final_payment_changed = 1

        # Keep custom_payment_type in sync with the chosen KOKO/MintPay row, but
        # only with a value the field accepts (Select option / Link / Data).
        try:
            payment_type_field = frappe.get_meta("Sales Invoice").get_field("custom_payment_type")
        except Exception:
            payment_type_field = None

        if payment_type_field:
            payment_type_target = ""
            payment_type_fieldtype = str(payment_type_field.fieldtype or "")
            if payment_type_fieldtype == "Select":
                for payment_type_option in str(payment_type_field.options or "").split("\n"):
                    if payment_type_option.strip().upper() == final_restricted_payment:
                        payment_type_target = payment_type_option.strip()
                        break
            elif payment_type_fieldtype == "Link":
                if str(payment_type_field.options or "").strip() == "Mode of Payment":
                    payment_type_target = str(restricted_payment_row.get("mode_of_payment") or "").strip()
            elif payment_type_fieldtype in ("Data", "Small Text"):
                payment_type_target = final_restricted_payment_name

            if (
                payment_type_target
                and str(doc.get("custom_payment_type") or "").strip().upper() != final_restricted_payment
            ):
                doc.custom_payment_type = payment_type_target

    if final_payment_changed:
        # Refresh paid_amount / change_amount / outstanding_amount.
        doc.calculate_taxes_and_totals()

    # Re-clear display/link fields after the final calculation so the saved
    # document cannot show a stale discount percentage or Pricing Rule name.
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

    # Keep POS Awesome collection amount aligned after the hard restriction.
    if is_pos_sale:
        doc.rounded_total = doc.grand_total
        doc.base_rounded_total = doc.base_grand_total
        doc.rounding_adjustment = 0.0
        doc.base_rounding_adjustment = 0.0
