import { NextRequest, NextResponse } from "next/server";

import {
  assertBookNoteShopAllowed,
  resolveBookNoteShopAccess,
} from "@/lib/book-notes/access";
import { isBookNoteWritable, DAY_LOCKED_CODE } from "@/lib/book-notes/lock";
import {
  addBookNoteReceipt,
  ensureBookNoteDay,
} from "@/lib/book-notes/receipts";
import { loadBookNoteDayDto } from "@/lib/book-notes/load";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { z } from "zod";

const ymdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");

/**
 * Upload one day-level receipt image for a book-note day.
 * Multipart: file, companyLocationId, postingDate
 * Creates the day shell if missing so photos can attach before first row save.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission("book_notes.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  const userId = auth.context!.user?.id ?? null;
  if (!companyId || !userId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const companyLocationIdRaw = formData.get("companyLocationId");
  const postingDateRaw = formData.get("postingDate");
  const file = formData.get("file");

  const locationParsed = cuidSchema.safeParse(
    typeof companyLocationIdRaw === "string" ? companyLocationIdRaw : "",
  );
  const dateParsed = ymdSchema.safeParse(
    typeof postingDateRaw === "string" ? postingDateRaw : "",
  );

  if (!locationParsed.success || !dateParsed.success) {
    return NextResponse.json(
      { error: "companyLocationId and postingDate (YYYY-MM-DD) are required" },
      { status: 400 },
    );
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const companyLocationId = locationParsed.data;
  const postingDate = dateParsed.data;

  if (!isBookNoteWritable(postingDate)) {
    return NextResponse.json(
      {
        error:
          "This sales date is locked. Merchants can only change book notes for today or past dates.",
        code: DAY_LOCKED_CODE,
      },
      { status: 409 },
    );
  }

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  if (!assertBookNoteShopAllowed(access, companyLocationId)) {
    return NextResponse.json(
      { error: "Shop not allowed for your account", code: "SHOP_FORBIDDEN" },
      { status: 403 },
    );
  }

  const location = await prisma.companyLocation.findFirst({
    where: { id: companyLocationId, companyId },
    select: { id: true },
  });
  if (!location) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  try {
    const day = await ensureBookNoteDay({
      companyId,
      companyLocationId,
      postingDateYmd: postingDate,
      userId,
    });
    const receipt = await addBookNoteReceipt({
      bookNoteDayId: day.id,
      file,
    });
    const dayDto = await loadBookNoteDayDto({
      companyId,
      companyLocationId,
      postingDateYmd: postingDate,
    });
    return NextResponse.json({ receipt, day: dayDto });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const status =
      message.includes("Maximum") ||
      message.includes("Invalid file") ||
      message.includes("too large")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
