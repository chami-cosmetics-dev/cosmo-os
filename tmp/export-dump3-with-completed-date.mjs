/**
 * One-time Dump 3 Excel with COMPLETED_DATE (OSF month rule).
 * Does NOT change Cosmo OS dump API.
 *
 * COMPLETED_DATE = deliveryCompleteAt ?? invoiceCompleteAt (Asia/Colombo day)
 * Same date OSF uses for month sales totals.
 */
import { PrismaClient } from "@prisma/client"
import ExcelJS from "exceljs"
import path from "node:path"
import { mkdirSync } from "node:fs"

const prisma = new PrismaClient()
const COLOMBO = "Asia/Colombo"

const HEADERS = [
  "INVOICE_NO",
  "ERP_INVOICE_ID",
  "SOURCE_NAME",
  "MERCHANT_COUPON_CODE",
  "COUPON_CODE",
  "INVOICE_DATE",
  "COMPLETED_DATE",
  "INVOICE_COMPLETE_DATE",
  "DELIVERY_COMPLETED_DATE",
  "LOCATION_NAME",
  "CUSTOMER_NAME",
  "CUSTOMER_EMAIL",
  "CUSTOMER_PHONE",
  "SKU",
  "BARCODE",
  "BRAND",
  "PRODUCT_TITLE",
  "QUANTITY",
  "UNIT_PRICE",
  "STATUS",
  "PAYMENT_STATUS",
  "FULFILLMENT_STATUS",
  "POS_SALE",
  "CANCEL_REASON",
]

function ymdColombo(value) {
  if (!value) return ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value)
}

function customerName(addr) {
  if (!addr || typeof addr !== "object") return ""
  const a = addr
  const nested = a.data && typeof a.data === "object" ? a.data : null
  const first = String(a.first_name ?? a.firstName ?? nested?.first_name ?? "").trim()
  const last = String(a.last_name ?? a.lastName ?? nested?.last_name ?? "").trim()
  const name = `${first} ${last}`.trim()
  if (name) return name
  return String(a.name ?? nested?.name ?? "").trim()
}

function statusOf(order) {
  if (order.financialStatus?.toLowerCase() === "voided") return "voided"
  if (order.fulfillmentStage?.toLowerCase() === "returned_to_store") return "Returned to Store"
  const src = (order.sourceName || "").toLowerCase()
  if (src === "pos" || src === "erpnext-pos") return "Completed"
  if (order.deliveryCompleteAt && order.invoiceCompleteAt) return "Completed"
  if (order.deliveryCompleteAt) return "Delivery Completed"
  if (order.invoiceCompleteAt) return "Invoice Completed"
  return order.fulfillmentStage || ""
}

function isPos(sourceName) {
  const v = (sourceName || "").toLowerCase()
  return v === "pos" || v === "erpnext-pos" ? "1" : "0"
}

function sourceLabel(sourceName) {
  if (sourceName === "web") return "Shopify"
  if (sourceName === "manual") return "Manual"
  if (sourceName === "erpnext") return "ERPNext"
  if (sourceName === "erpnext-pos") return "ERPNext POS"
  return sourceName || ""
}

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: { contains: "Cosmetic", mode: "insensitive" } },
    select: { id: true, name: true },
  })
  if (!company) throw new Error("Cosmetics.lk company not found")

  // FY window covering OSF Oct column (Apr 2026 → today).
  // Include by create OR complete so late-complete of older creates stay in file.
  const from = new Date("2026-04-01T00:00:00+05:30")
  const to = new Date()

  console.log("company", company.name)
  console.log("range", from.toISOString(), "→", to.toISOString())

  const outDir = path.join("tmp", "one-time-reports")
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const outPath = path.resolve(outDir, `dump3-with-completed-date-${stamp}.xlsx`)

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: outPath,
    useStyles: false,
    useSharedStrings: false,
  })
  const sheet = workbook.addWorksheet("Dump3")
  sheet.addRow(HEADERS).commit()

  const pageSize = 500
  let afterId = null
  let rows = 0
  let pages = 0

  for (;;) {
    const orders = await prisma.order.findMany({
      where: {
        companyId: company.id,
        OR: [
          { createdAt: { gte: from, lte: to } },
          { deliveryCompleteAt: { gte: from, lte: to } },
          { invoiceCompleteAt: { gte: from, lte: to } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: pageSize,
      ...(afterId ? { skip: 1, cursor: { id: afterId } } : {}),
      select: {
        id: true,
        name: true,
        orderNumber: true,
        shopifyOrderId: true,
        erpnextInvoiceId: true,
        sourceName: true,
        createdAt: true,
        deliveryCompleteAt: true,
        invoiceCompleteAt: true,
        financialStatus: true,
        fulfillmentStage: true,
        fulfillmentStatus: true,
        cancelReason: true,
        customerEmail: true,
        customerPhone: true,
        shippingAddress: true,
        billingAddress: true,
        companyLocation: { select: { name: true } },
        lineItems: {
          select: {
            quantity: true,
            price: true,
            productItem: {
              select: {
                sku: true,
                barcode: true,
                productTitle: true,
                vendor: { select: { name: true } },
              },
            },
          },
        },
      },
    })

    if (orders.length === 0) break
    pages += 1
    afterId = orders[orders.length - 1].id

    for (const order of orders) {
      const invoice =
        order.name || order.orderNumber || order.shopifyOrderId || ""
      const completedAt = order.deliveryCompleteAt ?? order.invoiceCompleteAt
      const cust =
        customerName(order.shippingAddress) ||
        customerName(order.billingAddress) ||
        order.customerEmail ||
        ""

      for (const line of order.lineItems) {
        sheet
          .addRow([
            invoice,
            order.erpnextInvoiceId || "",
            sourceLabel(order.sourceName),
            "",
            "",
            ymdColombo(order.createdAt),
            ymdColombo(completedAt),
            ymdColombo(order.invoiceCompleteAt),
            ymdColombo(order.deliveryCompleteAt),
            order.companyLocation?.name || "",
            cust,
            order.customerEmail || "",
            order.customerPhone || "",
            line.productItem?.sku || "",
            line.productItem?.barcode || "",
            line.productItem?.vendor?.name || "",
            line.productItem?.productTitle || "",
            line.quantity,
            line.price?.toString?.() ?? String(line.price ?? ""),
            statusOf(order),
            order.financialStatus || "",
            order.fulfillmentStatus || "",
            isPos(order.sourceName),
            order.cancelReason || "",
          ])
          .commit()
        rows += 1
      }
    }

    console.log(`page ${pages}: orders ${orders.length}, rows so far ${rows}`)
    if (orders.length < pageSize) break
  }

  await workbook.commit()
  console.log("wrote", outPath)
  console.log("line rows", rows)

  // Quick ALT02_1 Oct check with COMPLETED_DATE
  const check = await prisma.$queryRaw`
    SELECT COALESCE(SUM(li.quantity),0)::int AS qty
    FROM "OrderLineItem" li
    JOIN "Order" o ON o.id = li."orderId"
    JOIN "ProductItem" pi ON pi.id = li."productItemId"
    WHERE o."companyId" = ${company.id}
      AND btrim(pi.sku) = 'ALT02_1'
      AND o."cancelledAt" IS NULL
      AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
      AND to_char(
            timezone('Asia/Colombo', COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")),
            'YYYY-MM'
          ) = '2026-10'
  `
  console.log("sanity ALT02_1 OSF Oct qty should be", check[0]?.qty)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
