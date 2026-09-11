import { NextRequest, NextResponse } from "next/server";

import {
  assertBookNoteShopAllowed,
  canViewBookNoteDay,
  resolveBookNoteShopAccess,
  resolveBookNoteViewScope,
  resolveBookNoteWriteAccess,
} from "@/lib/book-notes/access";
import {
  bookNoteLockMessage,
  DAY_LOCKED_CODE,
  isBookNoteWritable,
} from "@/lib/book-notes/lock";
import { deleteBookNoteDay } from "@/lib/book-notes/receipts";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

function postingDateYmd(value: Date): string {
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Delete a whole book note day — its rows and receipt photos go with it.
 *
 * Allowed for the merchant who submitted the sheet, or anyone with
 * `book_notes.admin`. Cosmo-only by design: a day already pushed to ERP keeps
 * its Book Note Entry there, so the UI warns before calling this.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid book note ID" }, { status: 400 });
  }

  const day = await prisma.bookNoteDay.findFirst({
    where: { id: idResult.data, companyId },
    select: {
      id: true,
      companyLocationId: true,
      postingDate: true,
      createdByUserId: true,
      updatedByUserId: true,
      createdBy: { select: { name: true, email: true } },
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!day) {
    return NextResponse.json({ error: "Book note not found" }, { status: 404 });
  }

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  if (!assertBookNoteShopAllowed(access, day.companyLocationId)) {
    return NextResponse.json(
      { error: "Shop not allowed for your account", code: "SHOP_FORBIDDEN" },
      { status: 403 },
    );
  }

  const viewScope = await resolveBookNoteViewScope(auth.context!, companyId);
  const visible = canViewBookNoteDay({
    viewScope,
    userId,
    day: {
      companyLocationId: day.companyLocationId,
      createdByUserId: day.createdByUserId,
      updatedByUserId: day.updatedByUserId,
    },
  });
  if (!visible) {
    const author = day.updatedBy ?? day.createdBy;
    const who = author?.name?.trim() || author?.email || "another merchant";
    return NextResponse.json(
      {
        error: `${who} entered this book note. Only they or finance can remove it.`,
        code: "DAY_NOT_YOURS",
      },
      { status: 403 },
    );
  }

  const isOwner =
    day.createdByUserId === userId || day.updatedByUserId === userId;
  const writeAccess = {
    ...resolveBookNoteWriteAccess(auth.context!),
    isOwner,
  };

  // Seeing a colleague's sheet does not grant the right to delete it.
  if (!isOwner && !writeAccess.canBackdate) {
    return NextResponse.json(
      {
        error:
          "Only the merchant who submitted this book note (or a book notes admin) can delete it.",
        code: "NOT_SUBMITTER",
      },
      { status: 403 },
    );
  }

  const postingDate = postingDateYmd(day.postingDate);
  if (!isBookNoteWritable(postingDate, new Date(), writeAccess)) {
    return NextResponse.json(
      {
        error: bookNoteLockMessage(postingDate, new Date(), writeAccess),
        code: DAY_LOCKED_CODE,
      },
      { status: 409 },
    );
  }

  const result = await deleteBookNoteDay({ companyId, bookNoteDayId: day.id });
  if (!result.deleted) {
    return NextResponse.json({ error: "Book note not found" }, { status: 404 });
  }

  return NextResponse.json({
    deleted: true,
    postingDate,
    receiptCount: result.receiptCount,
  });
}
