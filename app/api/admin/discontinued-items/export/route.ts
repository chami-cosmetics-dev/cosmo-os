import { NextResponse } from "next/server";

import { DISCONTINUED_ITEMS_PERMISSIONS } from "@/lib/discontinued-items/config";
import {
  buildDiscontinuedItemsHistoryWorkbook,
  XLSX_CONTENT_TYPE,
} from "@/lib/discontinued-items/export";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";
/** Two database reads only; the limit is a safety margin for very large histories. */
export const maxDuration = 60;

/** Manager Download: the full Discontinued Items history (every saved row, every column). */
export async function GET() {
  const auth = await requireUserContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!hasPermission(auth.context, DISCONTINUED_ITEMS_PERMISSIONS.manager)) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }
  try {
    const { fileName, buffer } = await buildDiscontinuedItemsHistoryWorkbook();
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        // Lets the Download history button show a percentage while the file comes in.
        "Content-Length": String(body.byteLength),
      },
    });
  } catch (error) {
    console.error("Discontinued Items export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build export" },
      { status: 500 },
    );
  }
}
