import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendOgfSyncSummaryEmail } from "@/lib/maileroo";

const OGF_NOTIFY_EMAIL = "chami@cosmetics.lk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorizedCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function toColomboParts(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  // Convert to Asia/Colombo wall-clock time via locale string then re-parse
  const d = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
  return {
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
    batch: `${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
  };
}

async function getOgfAccessToken(): Promise<string> {
  const tokenUrl = process.env.OGF_TOKEN_URL;

  // If a token URL is configured, fetch via OAuth2 client_credentials flow
  if (tokenUrl) {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.OGF_CLIENT_ID ?? "",
        client_secret: process.env.OGF_CLIENT_SECRET ?? "",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Token endpoint returned ${res.status}: ${body}`);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) throw new Error("Token response missing access_token");
    return data.access_token;
  }

  // Fallback: token is base64(clientId:clientSecret) — the iMonitor pattern
  // where getAccessToken() derives the bearer token directly from credentials
  const clientId = process.env.OGF_CLIENT_ID ?? "";
  const clientSecret = process.env.OGF_CLIENT_SECRET ?? "";
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const locationId = process.env.OGF_LOCATION_ID;
  if (!locationId) {
    // Not configured for this OS instance — Vault OS will skip silently
    return NextResponse.json({ ok: true, skipped: true });
  }

  const mallCode = process.env.OGF_MALL_CODE ?? "CCB1";
  const clientId = process.env.OGF_CLIENT_ID ?? "";
  const clientSecret = process.env.OGF_CLIENT_SECRET ?? "";

  type OrderRow = {
    id: string;
    orderNumber: string | null;
    name: string | null;
    totalPrice: string;
    paymentGatewayPrimary: string | null;
    createdAt: Date;
  };

  // OGF is a walk-in store — orders go straight to delivery_complete without passing through
  // invoice_complete. Accept either stage so no sales are missed.
  const orders = await prisma.$queryRaw<OrderRow[]>(Prisma.sql`
    SELECT "id", "orderNumber", "name", "totalPrice", "paymentGatewayPrimary", "createdAt"
    FROM "Order"
    WHERE "companyLocationId" = ${locationId}
      AND ("invoiceCompleteAt" IS NOT NULL OR "fulfillmentStage" = 'delivery_complete')
      AND "ogfSyncedAt" IS NULL
      AND "cancelledAt" IS NULL
    ORDER BY "createdAt" ASC
  `);

  if (orders.length === 0) {
    return NextResponse.json({ ok: true, synced: 0 });
  }

  const orderIds = orders.map((o) => o.id);
  const orderIdSql = Prisma.join(orderIds.map((id) => Prisma.sql`${id}`));

  type LineItemRow = {
    orderId: string;
    productTitle: string;
    variantTitle: string | null;
    quantity: number;
    price: string;
  };

  const lineItems = await prisma.$queryRaw<LineItemRow[]>(Prisma.sql`
    SELECT oli."orderId", pi."productTitle", pi."variantTitle", oli."quantity", oli."price"
    FROM "OrderLineItem" oli
    JOIN "ProductItem" pi ON pi."id" = oli."productItemId"
    WHERE oli."orderId" IN (${orderIdSql})
  `);

  const lineItemsByOrder = new Map<string, LineItemRow[]>();
  for (const item of lineItems) {
    const arr = lineItemsByOrder.get(item.orderId) ?? [];
    arr.push(item);
    lineItemsByOrder.set(item.orderId, arr);
  }

  const { batch: batchCode } = toColomboParts(new Date());

  const PosSales = orders.map((order) => {
    const items = (lineItemsByOrder.get(order.id) ?? []).map((item) => ({
      ItemDesc: [item.productTitle, item.variantTitle].filter(Boolean).join(" - "),
      ItemAmt: (Number(item.price) * item.quantity).toFixed(2),
      ItemDiscoumtAmt: "0.00",
    }));

    const isCard = /card|visa|master|amex|koko/i.test(order.paymentGatewayPrimary ?? "");
    const totalStr = Number(order.totalPrice).toFixed(2);
    const { date: receiptDate, time: receiptTime } = toColomboParts(order.createdAt);
    const receiptNo = order.orderNumber ?? order.name?.replace(/^#/, "") ?? order.id;

    return {
      PropertyCode: mallCode,
      POSInterfaceCode: clientId,
      ReceiptDate: receiptDate,
      ReceiptTime: receiptTime,
      ReceiptNo: receiptNo,
      NoOfItems: items.length,
      SalesCurrency: "LKR",
      TotalSalesAmtB4Tax: totalStr,
      TotalSalesAmtAfterTax: totalStr,
      SalesTaxRate: 0.0,
      ServiceChargeAmt: 0.0,
      PaymentAmt: totalStr,
      PaymentCurrency: "LKR",
      PaymentMethod: isCard ? "Card" : "Cash",
      SalesType: "Sales",
      Items: items,
    };
  });

  let accessToken: string;
  try {
    accessToken = await getOgfAccessToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ogf-sale] token fetch failed:", msg);
    return NextResponse.json({ ok: false, error: `Token failed: ${msg}` }, { status: 502 });
  }

  const payload = {
    AppCode: "POS-02",
    PropertyCode: mallCode,
    ClientID: clientId,
    ClientSecret: clientSecret,
    POSInterfaceCode: clientId,
    BatchCode: batchCode,
    PosSales,
  };

  let responseObj: { returnStatus?: string; [key: string]: unknown } = {};
  let httpStatus = 0;
  try {
    const apiRes = await fetch("https://mims.imonitor.center/api/possale/importpossaleswithitems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    httpStatus = apiRes.status;
    const text = await apiRes.text();
    try {
      responseObj = JSON.parse(text) as typeof responseObj;
    } catch {
      responseObj = { returnStatus: "ParseError", httpStatus, raw: text };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Order" SET "ogfSyncError" = ${msg}
      WHERE "id" IN (${orderIdSql})
    `);
    return NextResponse.json({ ok: false, error: `OGF unreachable: ${msg}` }, { status: 502 });
  }

  const now = new Date();
  if (responseObj.returnStatus === "Success") {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Order"
      SET "ogfSyncedAt" = ${now}, "ogfSyncBatchCode" = ${batchCode}, "ogfSyncError" = NULL
      WHERE "id" IN (${orderIdSql})
    `);
    const emailRows = orders.map((o) => {
      const isCard = /card|visa|master|amex|koko/i.test(o.paymentGatewayPrimary ?? "");
      return {
        receiptNo: o.orderNumber ?? o.name?.replace(/^#/, "") ?? o.id,
        totalStr: Number(o.totalPrice).toFixed(2),
        paymentMethod: isCard ? "Card" : "Cash",
      };
    });
    sendOgfSyncSummaryEmail(OGF_NOTIFY_EMAIL, orders.length, batchCode, emailRows).catch((err) =>
      console.error("[ogf-sale] summary email failed:", err),
    );
    return NextResponse.json({ ok: true, synced: orders.length, batchCode });
  }

  const errMsg = `HTTP ${httpStatus} — ${JSON.stringify(responseObj).slice(0, 900)}`;
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "Order" SET "ogfSyncError" = ${errMsg}
    WHERE "id" IN (${orderIdSql})
  `);
  return NextResponse.json({ ok: false, error: errMsg, synced: 0 });
}
