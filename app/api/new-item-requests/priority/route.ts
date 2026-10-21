import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { NEW_ITEM_REQUESTS_PERMISSIONS } from "@/lib/new-item-requests/permissions";
import {
  getPriorityMeta,
  NewItemRequestError,
  replaceBrandPriorities,
} from "@/lib/new-item-requests/store";
import { requirePermission } from "@/lib/rbac";
import { LIMITS } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const auth = await requirePermission(NEW_ITEM_REQUESTS_PERMISSIONS.admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const meta = await getPriorityMeta(auth.context!);
    return NextResponse.json(meta);
  } catch (error) {
    if (error instanceof NewItemRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[new-item-requests/priority]", error);
    return NextResponse.json({ error: "Could not load priority list" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(NEW_ITEM_REQUESTS_PERMISSIONS.admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Upload a spreadsheet as form field "file"' }, { status: 400 });
  }
  if (file.size <= 0 || file.size > LIMITS.newItemRequestPriorityFileMaxBytes) {
    return NextResponse.json({ error: "File must be between 1 byte and 8MB" }, { status: 400 });
  }
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    return NextResponse.json({ error: "Only .xlsx, .xls, or .csv files are supported" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "Could not read spreadsheet" }, { status: 400 });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return NextResponse.json({ error: "Spreadsheet has no sheets" }, { status: 400 });
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  try {
    const result = await replaceBrandPriorities(auth.context!, rows);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof NewItemRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[new-item-requests/priority]", error);
    return NextResponse.json({ error: "Could not save priority list" }, { status: 500 });
  }
}
