import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAnyPermission } from "@/lib/rbac";

export const runtime = "nodejs";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function barcodeNumber(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || "-";
}

function safeFileName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "location";
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files: Array<{ name: string; content: string }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, "utf8");
    const contentBuffer = Buffer.from(file.content, "utf8");
    const checksum = crc32(contentBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, contentBuffer);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + contentBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function orderLabel(order: { name: string | null; orderNumber: string | null; shopifyOrderId: string }) {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId;
}

function locationDocumentHtml(input: {
  locationName: string;
  rows: string;
  itemCount: number;
  orderCount: number;
  printedAt: string;
  standalone?: boolean;
}) {
  const body = `<section class="location-document">
        <div class="document-title">
          <div>
            <h1>${escapeHtml(input.locationName)}</h1>
            <div class="meta">${input.itemCount} item(s) | ${input.orderCount} order(s) | Printed ${escapeHtml(input.printedAt)}</div>
          </div>
          <button onclick="window.print()">Print</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>SKU</th>
              <th class="qty">Qty</th>
              <th>Barcode</th>
            </tr>
          </thead>
          <tbody>${input.rows}</tbody>
        </table>
      </section>`;

  if (!input.standalone) return body;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.locationName)} Pick List</title>
  ${pickListStyles()}
</head>
<body>
  <main class="page">${body}</main>
</body>
</html>`;
}

function pickListStyles() {
  return `<style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f8fafc; color: #111827; font-family: Arial, sans-serif; }
    .page { max-width: 1120px; margin: 0 auto; padding: 24px; }
    .document-title { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
    h1 { margin: 0; font-size: 24px; }
    .meta { color: #64748b; font-size: 13px; margin-top: 4px; }
    button { border: 0; border-radius: 8px; background: #111827; color: #fff; padding: 10px 14px; font-weight: 700; }
    .location-document { background: #fff; border: 1px solid #dbe3ef; border-radius: 10px; margin-bottom: 24px; padding: 18px; break-after: page; page-break-after: always; overflow: hidden; }
    .location-document:last-child { break-after: auto; page-break-after: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e5edf5; padding: 10px; text-align: left; vertical-align: top; font-size: 13px; }
    th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #475569; }
    tr:last-child td { border-bottom: 0; }
    .item-title { font-weight: 700; }
    .item-sub, .item-orders { color: #64748b; font-size: 12px; margin-top: 3px; }
    .qty { width: 70px; text-align: right; font-weight: 800; font-size: 18px; }
    .barcode-cell { width: 180px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; font-size: 16px; letter-spacing: .04em; }
    @media print {
      body { background: #fff; }
      .page { max-width: none; padding: 0; }
      button { display: none; }
      .location-document { border: 0; border-radius: 0; padding: 0; margin: 0; }
      @page { margin: 12mm; }
    }
  </style>`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.order_print.print"]);
  if (!auth.ok) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = auth.context!.user!.companyId;
  if (!companyId) {
    return new NextResponse("No company", { status: 404 });
  }

  const ids = request.nextUrl.searchParams
    .get("ids")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 150) ?? [];

  if (ids.length === 0) {
    return new NextResponse("No orders selected", { status: 400 });
  }
  const download = request.nextUrl.searchParams.get("download") === "1";

  const orders = await prisma.order.findMany({
    where: {
      id: { in: ids },
      companyId,
    },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      companyLocation: { select: { id: true, name: true } },
      lineItems: {
        select: {
          quantity: true,
          productItem: {
            select: {
              id: true,
              productTitle: true,
              variantTitle: true,
              sku: true,
              barcode: true,
            },
          },
        },
      },
    },
    orderBy: [{ companyLocation: { name: "asc" } }, { createdAt: "asc" }],
  });

  const locationGroups = new Map<
    string,
    {
      name: string;
      items: Map<
        string,
        {
          title: string;
          variant: string | null;
          sku: string | null;
          barcode: string | null;
          quantity: number;
          orders: string[];
        }
      >;
    }
  >();

  for (const order of orders) {
    const locationId = order.companyLocation?.id ?? "no-location";
    const locationName = order.companyLocation?.name ?? "No location";
    const location = locationGroups.get(locationId) ?? { name: locationName, items: new Map() };
    const label = orderLabel(order);

    for (const lineItem of order.lineItems) {
      const product = lineItem.productItem;
      const key = [product.id, product.sku ?? "", product.barcode ?? ""].join("|");
      const current = location.items.get(key) ?? {
        title: product.productTitle,
        variant: product.variantTitle,
        sku: product.sku,
        barcode: product.barcode,
        quantity: 0,
        orders: [],
      };
      current.quantity += lineItem.quantity;
      if (!current.orders.includes(label)) {
        current.orders.push(label);
      }
      location.items.set(key, current);
    }

    locationGroups.set(locationId, location);
  }

  const printedAt = new Date().toLocaleString("en-LK");
  const documents = [...locationGroups.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((location) => {
      const rows = [...location.items.values()]
        .sort((a, b) => a.title.localeCompare(b.title))
        .map(
          (item) => `<tr>
            <td>
              <div class="item-title">${escapeHtml(item.title)}</div>
              ${item.variant ? `<div class="item-sub">${escapeHtml(item.variant)}</div>` : ""}
              <div class="item-orders">${escapeHtml(item.orders.join(", "))}</div>
            </td>
            <td>${escapeHtml(item.sku ?? "-")}</td>
            <td class="qty">${item.quantity}</td>
            <td class="barcode-cell">${escapeHtml(barcodeNumber(item.barcode))}</td>
          </tr>`
        )
        .join("");

      return {
        locationName: location.name,
        html: locationDocumentHtml({
          locationName: location.name,
          rows,
          itemCount: location.items.size,
          orderCount: orders.length,
          printedAt,
        }),
        standaloneHtml: locationDocumentHtml({
          locationName: location.name,
          rows,
          itemCount: location.items.size,
          orderCount: orders.length,
          printedAt,
          standalone: true,
        }),
      };
    });

  if (download) {
    if (documents.length === 0) {
      return new NextResponse("No items found", { status: 404 });
    }

    const zip = createZip(
      documents.map((document, index) => ({
        name: `${String(index + 1).padStart(2, "0")}-${safeFileName(document.locationName)}.html`,
        content: document.standaloneHtml,
      }))
    );

    return new NextResponse(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="location-pick-lists.zip"`,
      },
    });
  }

  const sections = documents.map((document) => document.html).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Location Pick List</title>
  ${pickListStyles()}
</head>
<body>
  <main class="page">
    ${sections || `<section class="location-document"><div class="document-title"><h1>No items found</h1></div></section>`}
  </main>
  <script>window.setTimeout(() => window.print(), 500);</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
