import { notFound } from "next/navigation";

import { loadMerchantOrderStatusByToken } from "@/lib/merchant-orders/load-status";
import {
  toGuideFinancialStatus,
  toGuideFulfillmentStatus,
} from "@/lib/merchant-orders/present";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function money(value: { toString(): string } | number | string | null | undefined, currency: string) {
  const n = value == null ? 0 : typeof value === "number" ? value : Number(value.toString());
  const amount = Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : "0.00";
  return `${currency} ${amount}`;
}

function addressText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const a = value as Record<string, unknown>;
  return [a.address1, a.city, a.country, a.zip]
    .filter((part) => typeof part === "string" && part.trim())
    .join(", ");
}

export default async function MerchantOrderStatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await loadMerchantOrderStatusByToken(token);
  if (!order) notFound();

  const currency = (order.currency?.trim().toUpperCase() || "LKR").slice(0, 3);
  const title = order.name?.trim() || order.orderNumber || "Order";

  return (
    <main
      style={{
        minHeight: "100vh",
        margin: 0,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        background: "#f4f4f5",
        color: "#18181b",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 48px" }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em", color: "#71717a" }}>
          COSMETICS.LK
        </p>
        <h1 style={{ margin: "8px 0 4px", fontSize: 24, fontWeight: 700 }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#52525b" }}>
          {order.createdAt.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" })}
        </p>

        <section
          style={{
            marginTop: 20,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 14,
              border: "1px solid #e4e4e7",
            }}
          >
            <div style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase" }}>Payment</div>
            <div style={{ marginTop: 4, fontWeight: 600 }}>
              {toGuideFinancialStatus(order.financialStatus) || "—"}
            </div>
          </div>
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 14,
              border: "1px solid #e4e4e7",
            }}
          >
            <div style={{ fontSize: 11, color: "#71717a", textTransform: "uppercase" }}>
              Fulfillment
            </div>
            <div style={{ marginTop: 4, fontWeight: 600 }}>
              {toGuideFulfillmentStatus(order.fulfillmentStatus)}
            </div>
          </div>
        </section>

        <section
          style={{
            marginTop: 16,
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e4e4e7",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #f4f4f5", fontWeight: 600 }}>
            Items
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {order.lineItems.map((line, index) => {
              const lineTotal = Number(line.price?.toString?.() ?? line.price ?? 0) * line.quantity;
              return (
                <li
                  key={`${line.productItem.sku ?? "line"}-${index}`}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 14px",
                    borderBottom: index === order.lineItems.length - 1 ? "none" : "1px solid #f4f4f5",
                  }}
                >
                  {line.productItem.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={line.productItem.imageUrl}
                      alt=""
                      width={56}
                      height={56}
                      style={{ borderRadius: 8, objectFit: "cover", background: "#f4f4f5" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        background: "#f4f4f5",
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {line.productItem.productTitle}
                    </div>
                    {line.productItem.variantTitle ? (
                      <div style={{ fontSize: 12, color: "#71717a" }}>
                        {line.productItem.variantTitle}
                      </div>
                    ) : null}
                    {line.productItem.sku ? (
                      <div style={{ fontSize: 12, color: "#a1a1aa" }}>{line.productItem.sku}</div>
                    ) : null}
                    <div style={{ marginTop: 4, fontSize: 13, color: "#52525b" }}>
                      Qty {line.quantity} · {money(lineTotal, currency)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section
          style={{
            marginTop: 16,
            background: "#fff",
            borderRadius: 12,
            border: "1px solid #e4e4e7",
            padding: 14,
            display: "grid",
            gap: 8,
            fontSize: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#71717a" }}>Subtotal</span>
            <span>{money(order.subtotalPrice, currency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#71717a" }}>Shipping</span>
            <span>{money(order.totalShipping, currency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#71717a" }}>Tax</span>
            <span>{money(order.totalTax, currency)}</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: "1px solid #f4f4f5",
              paddingTop: 8,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            <span>Total</span>
            <span>{money(order.totalPrice, currency)}</span>
          </div>
        </section>

        {(order.customerEmail || order.customerPhone || addressText(order.shippingAddress)) && (
          <section
            style={{
              marginTop: 16,
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #e4e4e7",
              padding: 14,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Customer</div>
            {order.customerEmail ? <div>{order.customerEmail}</div> : null}
            {order.customerPhone ? <div>{order.customerPhone}</div> : null}
            {addressText(order.shippingAddress) ? (
              <div style={{ marginTop: 6, color: "#52525b" }}>
                {addressText(order.shippingAddress)}
              </div>
            ) : null}
          </section>
        )}

      </div>
    </main>
  );
}
