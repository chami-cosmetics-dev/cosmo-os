import { NextRequest, NextResponse } from "next/server";

import { loadInventoryAgeing } from "@/lib/inventory-ageing/load";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(context, "purchasing.purchase_history.read")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = context.user.companyId;
  if (!companyId) return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  const reportDate = request.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || Number.isNaN(Date.parse(`${reportDate}T00:00:00Z`))) {
    return NextResponse.json({ error: "Invalid report date" }, { status: 400 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastPercent = 0;
      const send = (message: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      try {
        const report = await loadInventoryAgeing(companyId, reportDate, ({ percent, status }) => {
          lastPercent = Math.max(lastPercent, Math.min(99, Math.round(percent)));
          send({ percent: lastPercent, status });
        });
        send({ percent: 100, status: "Ageing Summary ready", report });
      } catch (error) {
        console.error("Inventory ageing report failed", error);
        send({ error: error instanceof Error ? error.message : "Inventory ageing report failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
