/**
 * Print Shopify timeline events for an order name (e.g. 60019571).
 * Usage: node scripts/with-env.mjs cosmo-prod node scripts/shopify-order-events.mjs 60019571
 */
const orderName = process.argv[2];
if (!orderName) {
  console.error("Usage: node scripts/shopify-order-events.mjs <order-name>");
  process.exit(1);
}

const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
const store = (process.env.SHOPIFY_STORE_HANDLE || process.env.SHOPIFY_SHOP || "u71ajc-11")
  .replace(/^https?:\/\//, "")
  .replace(/\.myshopify\.com.*$/, "")
  .replace(/\/$/, "");

if (!token) {
  console.error("SHOPIFY_ADMIN_ACCESS_TOKEN missing");
  process.exit(1);
}

const api = `https://${store}.myshopify.com/admin/api/2024-10`;
const headers = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

const listRes = await fetch(
  `${api}/orders.json?name=${encodeURIComponent(orderName)}&status=any`,
  { headers },
);
if (!listRes.ok) {
  console.error(`orders.json ${listRes.status}: ${(await listRes.text()).slice(0, 400)}`);
  process.exit(1);
}
const list = await listRes.json();
const order = list.orders?.[0];
if (!order) {
  console.error(`No Shopify order named ${orderName}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      id: order.id,
      name: order.name,
      email: order.email,
      cancelled_at: order.cancelled_at,
      cancel_reason: order.cancel_reason,
      closed_at: order.closed_at,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
    },
    null,
    2,
  ),
);

const evRes = await fetch(`${api}/orders/${order.id}/events.json?limit=50`, { headers });
if (!evRes.ok) {
  console.error(`events.json ${evRes.status}: ${(await evRes.text()).slice(0, 400)}`);
  process.exit(1);
}
const events = (await evRes.json()).events ?? [];
const interesting = events.filter((e) => {
  const msg = `${e.message || ""} ${e.path || ""} ${e.subject || ""}`.toLowerCase();
  return (
    msg.includes("email") ||
    msg.includes("sms") ||
    msg.includes("cancel") ||
    msg.includes("notif") ||
    e.verb === "canceled" ||
    e.verb === "email"
  );
});
console.log("--- events ---");
for (const e of interesting.length ? interesting : events.slice(0, 20)) {
  console.log(
    JSON.stringify({
      created_at: e.created_at,
      verb: e.verb,
      message: e.message,
    }),
  );
}
