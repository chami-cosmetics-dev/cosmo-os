import { NextRequest, NextResponse } from "next/server";

import { parseEmailAddressList } from "@/lib/email-templates/render";
import { hasPermission, requireUserContext } from "@/lib/rbac";
import { sendTestStockHealthSummaryMail } from "@/lib/stock-health/summary-mail";
import {
  STOCK_HEALTH_MAIL_PARTS,
  type StockHealthMailPart,
} from "@/lib/stock-health/summary-mail-html";

export const dynamic = "force-dynamic";
/** May regenerate the ERP stock report when the cache is cold. */
export const maxDuration = 300;

function parsePart(value: string | null): StockHealthMailPart | null {
  if (value === "1") return "weekly";
  if (value === "2") return "rop";
  return STOCK_HEALTH_MAIL_PARTS.includes(value as StockHealthMailPart) ? (value as StockHealthMailPart) : null;
}

/**
 * Test Stock Health mails (no snapshot saved, not the scheduled send), using each mail's
 * Email Template (Settings → Email Templates). Part 1 = Weekly Summary (Tuesday), part 2 =
 * Stock Availability Status (Monday). Open in the browser while signed in:
 * - `?preview=1` — shows mail 1 here, sends nothing (`?preview=1&part=2` for mail 2).
 * - no `to` — sends both mails to you (the signed-in user); `&part=1` / `&part=2` for one.
 * - `?to=a@x.lk,b@y.lk` — sends to those addresses.
 * - `?to=list` — sends each mail to its template's To + CC.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, "purchasing.stock_health.read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const preview = params.get("preview") === "1";
  const partParam = params.get("part");
  const part = parsePart(partParam);
  if (partParam && !part) {
    return NextResponse.json(
      { error: "part must be 1 (Weekly Summary) or 2 (Stock Availability Status)" },
      { status: 400 },
    );
  }
  const to = params.get("to")?.trim();
  const recipients =
    to === "list" ? ("template" as const) : { to: parseEmailAddressList(to || (auth.user.email ?? "")), cc: [] };

  try {
    if (preview) {
      const [result] = await sendTestStockHealthSummaryMail(companyId, { to: [], cc: [] }, { preview: part ?? "weekly" });
      return new NextResponse(result.html ?? "", { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const results = await sendTestStockHealthSummaryMail(companyId, recipients, {
      parts: part ? [part] : STOCK_HEALTH_MAIL_PARTS,
    });
    if (results.every((r) => r.status === "skipped_no_recipients")) {
      return NextResponse.json(
        {
          results,
          error:
            to === "list"
              ? "No To recipients in the Email Template — add them in Settings → Email Templates"
              : "No valid email address to send to",
        },
        { status: 400 },
      );
    }
    const failed = results.some((r) => r.status === "failed");
    return NextResponse.json({ ok: !failed, results }, { status: failed ? 502 : 200 });
  } catch (error) {
    console.error("Stock Health test mail failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build the mail" },
      { status: 502 },
    );
  }
}
