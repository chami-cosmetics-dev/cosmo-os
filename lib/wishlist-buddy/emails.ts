/** Wishlist Buddy customer emails. Pure builders: no sending, no DB. */

export type StockRequestEmailInput = {
  customerName: string;
  productTitle: string;
  variantTitle: string | null;
  productUrl: string | null;
  shopName: string | null;
};

export type BuiltEmail = { subject: string; html: string; plain: string; fromName: string };

const DEFAULT_SHOP_NAME = "Cosmetics.lk";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function itemLabel(input: StockRequestEmailInput): string {
  return input.variantTitle ? `${input.productTitle} (${input.variantTitle})` : input.productTitle;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function layout(shopName: string, paragraphs: string[], button?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join("");
  const cta = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(button.label)}</a></p>`
    : "";
  return (
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px">` +
    `${body}${cta}<p style="margin:24px 0 0;color:#666">${escapeHtml(shopName)}</p></div>`
  );
}

/** Sent when the item is sold out online but in stock at another warehouse. */
export function buildCheckingAvailabilityEmail(input: StockRequestEmailInput): BuiltEmail {
  const shopName = input.shopName?.trim() || DEFAULT_SHOP_NAME;
  const item = itemLabel(input);
  const subject = `We're checking availability: ${item}`;
  const html = layout(shopName, [
    `Hi ${escapeHtml(firstName(input.customerName))},`,
    `Thanks for asking about <strong>${escapeHtml(item)}</strong>. It's sold out online right now, but we're checking availability and will call you shortly.`,
  ]);
  const plain =
    `Hi ${firstName(input.customerName)},\n\n` +
    `Thanks for asking about ${item}. It's sold out online right now, but we're checking availability and will call you shortly.\n\n` +
    shopName;
  return { subject, html, plain, fromName: shopName };
}

/**
 * Sent once when the item comes back. With a product link (website items) the customer can order
 * online; without one (items only in the ERP) the team will contact them.
 */
export function buildBackInStockEmail(input: StockRequestEmailInput): BuiltEmail {
  const shopName = input.shopName?.trim() || DEFAULT_SHOP_NAME;
  const item = itemLabel(input);
  const subject = `Back in stock: ${item}`;
  const next = input.productUrl
    ? "Stock can sell out quickly, so order soon if you'd like it."
    : "We'll contact you shortly to arrange your order.";
  const html = layout(
    shopName,
    [
      `Hi ${escapeHtml(firstName(input.customerName))},`,
      `Good news: <strong>${escapeHtml(item)}</strong> is back in stock. ${next}`,
    ],
    input.productUrl ? { label: "Shop now", url: input.productUrl } : undefined,
  );
  const plain =
    `Hi ${firstName(input.customerName)},\n\n` +
    `Good news: ${item} is back in stock. ${next}\n\n` +
    (input.productUrl ? `${input.productUrl}\n\n` : "") +
    shopName;
  return { subject, html, plain, fromName: shopName };
}
