import { NextRequest, NextResponse } from "next/server";

import { hasPermission, requireUserContext } from "@/lib/rbac";
import { parseReviewRecipients } from "@/lib/newly-added-review/calc";
import { buildNewlyAddedReviewExcel, sendTestNewlyAddedReviewMail } from "@/lib/newly-added-review/send";

export const dynamic = "force-dynamic";
/** Reads every Newly Added SKU's stock ledger live from the ERPs. */
export const maxDuration = 300;

/**
 * Newly Added Priority Review, on demand — marked [TEST], never counted as the month's send.
 * Open in the browser while signed in:
 * - `?preview=1` — shows the mail here, sends nothing.
 * - `?excel=1` — downloads the attached Excel, sends nothing.
 * - no `to` — sends it (with the Excel) to you, the signed-in user.
 * - `?to=a@x.lk,b@y.lk` — sends to those addresses.
 * - `?to=list` — sends to the Email Template's To + CC (Settings → Email Templates).
 * - `&month=2026-12` — as the mail for that month would be (default: this month).
 */
export async function GET(request: NextRequest) {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, "purchasing.item_trends.read")) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  const companyId = auth.user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const month = params.get("month")?.trim() || undefined;
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "month must be YYYY-MM, e.g. 2026-12" }, { status: 400 });
  }
  const preview = params.get("preview") === "1";
  const toParam = params.get("to")?.trim();
  const to = toParam === "list" ? ("template" as const) : parseReviewRecipients(toParam || auth.user.email || "");

  try {
    if (params.get("excel") === "1") {
      const { fileName, buffer } = await buildNewlyAddedReviewExcel(companyId, month);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }
    const result = await sendTestNewlyAddedReviewMail(companyId, to, { preview, mailMonth: month });
    if (preview) {
      return new NextResponse(result.html ?? "", { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (result.status === "skipped_no_recipients") {
      return NextResponse.json(
        {
          result,
          error:
            to === "template"
              ? "No To recipients in the Email Template — add them in Settings → Email Templates"
              : "No valid email address to send to",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: result.status === "sent", result }, { status: result.status === "failed" ? 502 : 200 });
  } catch (error) {
    console.error("Newly Added Priority Review test mail failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build the mail" },
      { status: 502 },
    );
  }
}
