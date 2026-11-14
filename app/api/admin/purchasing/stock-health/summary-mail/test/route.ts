import { NextRequest, NextResponse } from "next/server";

import { hasPermission, requireUserContext } from "@/lib/rbac";
import {
  parseMailList,
  sendTestStockHealthSummaryMail,
  STOCK_HEALTH_MAIL_ENV,
  stockHealthMailRecipientsFor,
  type MailRecipients,
} from "@/lib/stock-health/summary-mail";
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
 * Test Stock Health summary mails (no snapshot saved, not the Monday send). Two mails:
 * part 1 = Weekly Summary, part 2 = Stock Availability Status - Overall. Open in the browser while signed in:
 * - `?preview=1` — shows mail 1 here, sends nothing (`?preview=1&part=2` for mail 2).
 * - no `to` — sends both mails to you (the signed-in user); `&part=1` / `&part=2` for one.
 * - `?to=a@x.lk,b@y.lk` — sends to those addresses.
 * - `?to=list` — sends each mail to its configured To + CC (STOCK_HEALTH_MAIL_ENV).
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
    return NextResponse.json({ error: "part must be 1 (Weekly Summary) or 2 (Stock Availability Status - Overall)" }, { status: 400 });
  }
  const to = params.get("to")?.trim();
  const recipientsFor = (p: StockHealthMailPart): MailRecipients =>
    to === "list"
      ? stockHealthMailRecipientsFor(p)
      : { to: parseMailList(to || (auth.user.email ?? "")), cc: [] };

  try {
    if (preview) {
      const [result] = await sendTestStockHealthSummaryMail(companyId, () => ({ to: [], cc: [] }), {
        preview: part ?? "weekly",
      });
      return new NextResponse(result.html ?? "", { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const results = await sendTestStockHealthSummaryMail(companyId, recipientsFor, {
      parts: part ? [part] : STOCK_HEALTH_MAIL_PARTS,
    });
    if (results.every((r) => r.status === "skipped_no_recipients")) {
      return NextResponse.json(
        {
          results,
          error:
            to === "list"
              ? `No To addresses set (${(part ? [part] : STOCK_HEALTH_MAIL_PARTS).map((p) => STOCK_HEALTH_MAIL_ENV[p].to).join(", ")})`
              : "No valid email address to send to",
        },
        { status: 400 },
      );
    }
    const failed = results.some((r) => r.status === "failed");
    const sentTo = Object.fromEntries((part ? [part] : STOCK_HEALTH_MAIL_PARTS).map((p) => [p, recipientsFor(p)]));
    return NextResponse.json({ ok: !failed, recipients: sentTo, results }, { status: failed ? 502 : 200 });
  } catch (error) {
    console.error("Stock Health test mail failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build the mail" },
      { status: 502 },
    );
  }
}
