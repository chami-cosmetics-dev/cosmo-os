import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { escapeHtml } from "@/lib/print-format-renderer";
import { renderOrderInvoice } from "@/lib/render-order-invoice";
import { requireAnyPermission } from "@/lib/rbac";

export const maxDuration = 60;

async function getCompanyId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  return user?.companyId ?? null;
}

/** Pulls `<style>` / stylesheet `<link>` tags out of an invoice document's `<head>`. */
function extractInvoiceStyleAssets(html: string): string {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const head = headMatch?.[1] ?? "";
  const assetMatches = head.match(
    /<style[^>]*>[\s\S]*?<\/style>|<link[^>]*rel=["'](?:stylesheet|preconnect|preload)["'][^>]*>/gi
  );
  return assetMatches?.join("\n") ?? "";
}

/** Pulls the `<body>` contents out of an invoice document, stripping its own `<script>` tags. */
function extractInvoiceBodyContent(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch?.[1] ?? html;
  return body.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.order_print.print"]);
  if (!auth.ok) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const companyId = await getCompanyId(auth.context!.user!.id);
  if (!companyId) {
    return new NextResponse("No company", { status: 404 });
  }

  const ids = request.nextUrl.searchParams
    .get("ids")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 100) ?? [];

  if (ids.length === 0) {
    return new NextResponse("No orders selected", { status: 400 });
  }

  const userId = auth.context!.user!.id;
  const sections: string[] = [];
  let successCount = 0;

  for (const id of ids) {
    const result = await renderOrderInvoice({
      orderId: id,
      companyId,
      userId,
      shouldIncrementPrint: true,
      autoPrint: false,
    });

    if (!result.ok) {
      sections.push(
        `<div class="bulk-error">Order ${escapeHtml(id)}: ${escapeHtml(result.message)}</div>`
      );
      continue;
    }

    successCount += 1;
    const styles = extractInvoiceStyleAssets(result.html);
    const body = extractInvoiceBodyContent(result.html);
    sections.push(`<section class="bulk-invoice">${styles}\n${body}</section>`);
  }

  const autoPrintScript =
    successCount > 0
      ? `<script>
    function waitForImage(img) {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      if (typeof img.decode === "function") {
        return img.decode().catch(function () { return undefined; });
      }
      return new Promise(function (resolve) {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    }
    async function waitForPrintAssets() {
      var images = Array.from(document.images);
      await Promise.race([
        Promise.all(images.map(waitForImage)),
        new Promise(function (resolve) { window.setTimeout(resolve, 5000); }),
      ]);
      if (document.fonts && document.fonts.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise(function (resolve) { window.setTimeout(resolve, 2000); }),
        ]);
      }
    }
    window.addEventListener("load", function () {
      waitForPrintAssets().finally(function () { window.print(); });
    });
  </script>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bulk Invoice Print</title>
  <style>
    body { margin: 0; background: #f8fafc; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    .bulk-error { padding: 16px; margin: 16px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; }
    .bulk-invoice { page-break-after: always; break-after: page; background: #fff; }
    .bulk-invoice:last-child { page-break-after: auto; break-after: auto; }
    @media print {
      .bulk-error { display: none !important; }
      body { background: #fff; }
    }
  </style>
</head>
<body>
${sections.join("\n")}
${autoPrintScript}
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
