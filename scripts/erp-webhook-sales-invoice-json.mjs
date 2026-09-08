/** Shared Sales Invoice webhook JSON for Cosmo OS / Vault OS.
 * String fields use Frappe `| json` (frappe.as_json) so tabs, quotes, and
 * newlines cannot break json.loads in enqueue_webhook.
 */

function jsonField(expr) {
  return `{{ ${expr} | json }}`;
}

export function buildSalesInvoiceWebhookJson({ vaultStyle = false } = {}) {
  const merchantField = vaultStyle
    ? `  "merchant_coupon_code": ${jsonField("doc.custom_merchant_coupon_code")},
  "custom_merchant_coupon_code": ${jsonField("doc.custom_merchant_coupon_code")},`
    : `  "custom_merchant_coupon_code": ${jsonField("doc.custom_merchant_coupon_code")},`;

  return `{
  "name": ${jsonField("doc.name")},
  "customer": ${jsonField("doc.customer")},
  "customer_name": ${jsonField("doc.customer_name")},
  "company": ${jsonField("doc.company")},
  "set_warehouse": ${jsonField("doc.set_warehouse")},
  "posting_date": ${jsonField("doc.posting_date")},
  "grand_total": {{ doc.grand_total or 0 }},
  "net_total": {{ doc.net_total or 0 }},
  "discount_amount": {{ doc.discount_amount or 0 }},
  "outstanding_amount": {{ doc.outstanding_amount or 0 }},
  "po_no": ${jsonField("doc.po_no")},
  "currency": ${jsonField("doc.currency")},
  "docstatus": {{ doc.docstatus }},
  "status": ${jsonField("doc.status")},
  "is_return": {{ doc.is_return or 0 }},
  "return_against": ${jsonField("doc.return_against")},
  "is_pos": {{ doc.is_pos or 0 }},
  "payment_type": ${jsonField("doc.payment_type")},
  "custom_payment_type": ${jsonField("doc.custom_payment_type")},
  "coupon_code": ${jsonField("doc.coupon_code")},
  "custom_coupon_code": ${jsonField("doc.custom_coupon_code")},
${merchantField}
  "custom_special_remarks": ${jsonField("doc.custom_special_remarks")},
  "posa_pos_opening_shift": ${jsonField("doc.posa_pos_opening_shift")},
  "owner": ${jsonField("doc.owner")},
  "contact_email": ${jsonField("doc.contact_email")},
  "contact_mobile": ${jsonField("doc.contact_mobile")},
  "address_display": ${jsonField("doc.address_display")},
  "shipping_address": ${jsonField("doc.shipping_address")},
  "shipping_rule": ${jsonField("doc.shipping_rule")},
  "total_taxes_and_charges": {{ doc.total_taxes_and_charges or 0 }},
  "taxes": [{% for tax in doc.get("taxes") %}{"description": ${jsonField("tax.description")}, "tax_amount": {{ tax.tax_amount or 0 }}, "account_head": ${jsonField("tax.account_head")}}{% if not loop.last %},{% endif %}{% endfor %}],
  "items": [{% for item in doc.get("items") %}{"item_code": ${jsonField("item.item_code")}, "item_name": ${jsonField("item.item_name")}, "qty": {{ item.qty }}, "rate": {{ item.rate }}, "amount": {{ item.amount }}, "price_list_rate": {{ item.price_list_rate or item.rate }}, "discount_amount": {{ item.discount_amount or 0 }}}{% if not loop.last %},{% endif %}{% endfor %}],
  "payments": [{% for p in doc.get("payments") %}{"mode_of_payment": ${jsonField("p.mode_of_payment")}, "amount": {{ p.amount or 0 }}}{% if not loop.last %},{% endif %}{% endfor %}]
}`;
}
