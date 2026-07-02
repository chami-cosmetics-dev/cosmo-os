import { NextRequest, NextResponse } from "next/server";

import { requireAnyPermission } from "@/lib/rbac";

function escapeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function GET(request: NextRequest) {
  const auth = await requireAnyPermission(["fulfillment.order_print.print"]);
  if (!auth.ok) {
    return new NextResponse("Unauthorized", { status: 401 });
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bulk Invoice Print</title>
  <style>
    body { margin: 0; background: #f8fafc; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
    .bulk-loader { padding: 32px; color: #334155; }
    .bulk-error { padding: 16px; margin: 16px; border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; }
    .bulk-invoice { page-break-after: always; break-after: page; background: #fff; }
    .bulk-invoice:last-child { page-break-after: auto; break-after: auto; }
    @media print {
      .bulk-loader, .bulk-error { display: none !important; }
      body { background: #fff; }
    }
  </style>
</head>
<body>
  <div id="bulk-loader" class="bulk-loader">Loading ${ids.length} invoice(s)...</div>
  <main id="bulk-root"></main>
  <script>
    const orderIds = ${escapeScriptJson(ids)};
    const root = document.getElementById("bulk-root");
    const loader = document.getElementById("bulk-loader");

    function appendInvoiceStyles(doc) {
      if (document.getElementById("invoice-styles")) return;
      const style = doc.querySelector("style");
      if (!style) return;
      const copy = document.createElement("style");
      copy.id = "invoice-styles";
      copy.textContent = style.textContent;
      document.head.appendChild(copy);
    }

    function waitForImage(img) {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      if (typeof img.decode === "function") {
        return img.decode().catch(() => undefined);
      }
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      });
    }

    async function waitForPrintAssets() {
      const images = Array.from(document.images);
      await Promise.race([
        Promise.all(images.map(waitForImage)),
        new Promise((resolve) => window.setTimeout(resolve, 5000)),
      ]);

      if (document.fonts?.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => window.setTimeout(resolve, 2000)),
        ]);
      }
    }

    async function loadInvoices() {
      for (const id of orderIds) {
        const response = await fetch("/api/admin/orders/" + encodeURIComponent(id) + "/invoice?print=1", {
          credentials: "same-origin",
        });
        if (!response.ok) {
          const error = document.createElement("div");
          error.className = "bulk-error";
          error.textContent = "Failed to load invoice for order " + id;
          root.appendChild(error);
          continue;
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        appendInvoiceStyles(doc);

        const invoice = document.createElement("section");
        invoice.className = "bulk-invoice";
        invoice.innerHTML = doc.body.innerHTML;
        invoice.querySelectorAll("script").forEach((script) => script.remove());
        root.appendChild(invoice);
      }

      loader.textContent = "Ready to print.";
      await waitForPrintAssets();
      loader.style.display = "none";
      window.print();
    }

    loadInvoices().catch((error) => {
      loader.textContent = "Bulk print failed.";
      const detail = document.createElement("div");
      detail.className = "bulk-error";
      detail.textContent = error instanceof Error ? error.message : "Unknown error";
      root.appendChild(detail);
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
