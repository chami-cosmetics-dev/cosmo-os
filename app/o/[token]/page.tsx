import { notFound } from "next/navigation";

import { loadMerchantOrderStatusByToken } from "@/lib/merchant-orders/load-status";
import {
  toGuideFinancialStatus,
  toGuideFulfillmentStatus,
} from "@/lib/merchant-orders/present";

import styles from "../order-status.module.css";

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

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 8h12l-.7 11.2a2 2 0 0 1-2 1.8H8.7a2 2 0 0 1-2-1.8L6 8Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 8V7a3 3 0 0 1 6 0v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m5 8 7 5 7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 3.8h2.2l1.2 4.1-1.6 1.1a11.5 11.5 0 0 0 4.7 4.7l1.1-1.6 4.1 1.2v2.2c0 .9-.7 1.7-1.6 1.7A14.7 14.7 0 0 1 4.8 5.4c0-.9.8-1.6 1.7-1.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" />
      <path d="m7.5 16.5 3.2-3.5 2.3 2.4 2.4-2.8 3.1 3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
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
  const orderName = order.name?.trim() || order.orderNumber || "Order";
  const payment = toGuideFinancialStatus(order.financialStatus) || "—";
  const fulfillment = toGuideFulfillmentStatus(order.fulfillmentStatus);
  const shipping = addressText(order.shippingAddress);
  const dateLabel = order.createdAt.toLocaleString("en-LK", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.header}>
          <p className={styles.brand}>Cosmetics.lk</p>
          <h1 className={styles.title}>Order details</h1>
          <p className={styles.subtitle}>{dateLabel}</p>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroIcon}>
            <BagIcon />
          </div>
          <div className={styles.heroBody}>
            <p className={styles.heroName}>{orderName}</p>
            <p className={styles.heroMeta}>{money(order.totalPrice, currency)}</p>
          </div>
        </section>

        <div className={styles.pills}>
          <span className={`${styles.pill} ${styles.pillAccent}`}>
            <span className={styles.pillLabel}>Payment</span>
            {payment}
          </span>
          <span className={`${styles.pill} ${styles.pillMuted}`}>
            <span className={styles.pillLabel}>Status</span>
            {fulfillment}
          </span>
        </div>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Items</h2>
          <div className={styles.stack}>
            {order.lineItems.map((line, index) => {
              const lineTotal =
                Number(line.price?.toString?.() ?? line.price ?? 0) * line.quantity;
              return (
                <article
                  key={`${line.productItem.sku ?? "line"}-${index}`}
                  className={styles.card}
                >
                  <div className={styles.itemRow}>
                    {line.productItem.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={line.productItem.imageUrl}
                        alt=""
                        width={64}
                        height={64}
                        className={styles.thumb}
                      />
                    ) : (
                      <div className={styles.thumbPlaceholder}>
                        <ImageIcon />
                      </div>
                    )}
                    <div className={styles.itemBody}>
                      <p className={styles.itemTitle}>{line.productItem.productTitle}</p>
                      {line.productItem.variantTitle ? (
                        <p className={styles.itemMeta}>{line.productItem.variantTitle}</p>
                      ) : null}
                      {line.productItem.sku ? (
                        <p className={styles.itemMeta}>{line.productItem.sku}</p>
                      ) : null}
                      <p className={styles.itemMeta}>Qty {line.quantity}</p>
                      <p className={styles.itemPrice}>{money(lineTotal, currency)}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Summary</h2>
          <div className={`${styles.card} ${styles.totals}`}>
            <div className={styles.totalRow}>
              <span>Subtotal</span>
              <strong>{money(order.subtotalPrice, currency)}</strong>
            </div>
            <div className={styles.totalRow}>
              <span>Shipping</span>
              <strong>{money(order.totalShipping, currency)}</strong>
            </div>
            <div className={styles.totalRow}>
              <span>Tax</span>
              <strong>{money(order.totalTax, currency)}</strong>
            </div>
            <div className={styles.totalDivider} />
            <div className={styles.totalGrand}>
              <span>Total</span>
              <span>{money(order.totalPrice, currency)}</span>
            </div>
          </div>
        </section>

        {(order.customerEmail || order.customerPhone || shipping) && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Customer</h2>
            <div className={styles.stack}>
              {order.customerEmail ? (
                <div className={styles.card}>
                  <div className={styles.infoRow}>
                    <div className={styles.infoIcon}>
                      <MailIcon />
                    </div>
                    <div className={styles.infoBody}>
                      <p className={styles.infoLabel}>Email</p>
                      <p className={styles.infoValue}>{order.customerEmail}</p>
                    </div>
                  </div>
                </div>
              ) : null}
              {order.customerPhone ? (
                <div className={styles.card}>
                  <div className={styles.infoRow}>
                    <div className={styles.infoIcon}>
                      <PhoneIcon />
                    </div>
                    <div className={styles.infoBody}>
                      <p className={styles.infoLabel}>Phone</p>
                      <p className={styles.infoValue}>{order.customerPhone}</p>
                    </div>
                  </div>
                </div>
              ) : null}
              {shipping ? (
                <div className={styles.card}>
                  <div className={styles.infoRow}>
                    <div className={styles.infoIcon}>
                      <PinIcon />
                    </div>
                    <div className={styles.infoBody}>
                      <p className={styles.infoLabel}>Shipping address</p>
                      <p className={styles.infoValue}>{shipping}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
