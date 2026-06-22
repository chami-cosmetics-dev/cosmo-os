/** Shared Sales Invoice webhook JSON for Cosmo OS / Vault OS. */

export function buildSalesInvoiceWebhookJson({ vaultStyle = false } = {}) {
  const merchantField = vaultStyle
    ? `  "merchant_coupon_code": "{{ doc.custom_merchant_coupon_code }}",
  "custom_merchant_coupon_code": "{{ doc.custom_merchant_coupon_code }}",`
    : `  "custom_merchant_coupon_code": "{{ doc.custom_merchant_coupon_code }}",`;

  return `{
  "name": "{{ doc.name }}",
  "customer": "{{ doc.customer }}",
  "customer_name": "{{ doc.customer_name }}",
  "company": "{{ doc.company }}",
  "set_warehouse": "{{ doc.set_warehouse }}",
  "posting_date": "{{ doc.posting_date }}",
  "grand_total": {{ doc.grand_total or 0 }},
  "net_total": {{ doc.net_total or 0 }},
  "discount_amount": {{ doc.discount_amount or 0 }},
  "outstanding_amount": {{ doc.outstanding_amount or 0 }},
  "po_no": "{{ doc.po_no }}",
  "currency": "{{ doc.currency }}",
  "docstatus": {{ doc.docstatus }},
  "status": "{{ doc.status }}",
  "is_return": {{ doc.is_return or 0 }},
  "return_against": "{{ doc.return_against }}",
  "is_pos": {{ doc.is_pos or 0 }},
  "payment_type": "{{ doc.payment_type }}",
  "custom_payment_type": "{{ doc.custom_payment_type }}",
  "coupon_code": "{{ doc.coupon_code }}",
  "custom_coupon_code": "{{ doc.custom_coupon_code }}",
${merchantField}
  "posa_pos_opening_shift": "{{ doc.posa_pos_opening_shift }}",
  "owner": "{{ doc.owner }}",
  "contact_email": "{{ doc.contact_email }}",
  "contact_mobile": "{{ doc.contact_mobile }}",
  "address_display": "{{ doc.address_display | replace('\\n', ' ') | replace('\\\"', '') }}",
  "shipping_address": "{{ doc.shipping_address | replace('\\n', ' ') | replace('\\\"', '') }}",
  "shipping_rule": "{{ doc.shipping_rule }}",
  "total_taxes_and_charges": {{ doc.total_taxes_and_charges or 0 }},
  "taxes": [{% for tax in doc.get("taxes") %}{"description": "{{ tax.description }}", "tax_amount": {{ tax.tax_amount or 0 }}, "account_head": "{{ tax.account_head }}"}{% if not loop.last %},{% endif %}{% endfor %}],
  "items": [{% for item in doc.get("items") %}{"item_code": "{{ item.item_code }}", "item_name": "{{ item.item_name }}", "qty": {{ item.qty }}, "rate": {{ item.rate }}, "amount": {{ item.amount }}, "price_list_rate": {{ item.price_list_rate or item.rate }}, "discount_amount": {{ item.discount_amount or 0 }}}{% if not loop.last %},{% endif %}{% endfor %}],
  "payments": [{% for p in doc.get("payments") %}{"mode_of_payment": "{{ p.mode_of_payment }}", "amount": {{ p.amount or 0 }}}{% if not loop.last %},{% endif %}{% endfor %}]
}`;
}
