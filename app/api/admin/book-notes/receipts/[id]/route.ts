import { NextRequest, NextResponse } from "next/server";

import {
  assertBookNoteShopAllowed,
  resolveBookNoteShopAccess,
} from "@/lib/book-notes/access";
import { isBookNoteWritable, DAY_LOCKED_CODE } from "@/lib/book-notes/lock";
import { deleteBookNoteReceipt } from "@/lib/book-notes/receipts";
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
 * Stream a private receipt blob for authenticated book-note users.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("book_notes.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });
  }

  const receipt = await prisma.bookNoteReceipt.findFirst({
    where: {
      id: idResult.data,
      bookNoteDay: { companyId },
    },
    select: {
      blobUrl: true,
      mimeType: true,
      fileName: true,
      bookNoteDay: { select: { companyLocationId: true } },
    },
  });
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  if (
    !assertBookNoteShopAllowed(
      access,
      receipt.bookNoteDay.companyLocationId,
    )
  ) {
    return NextResponse.json(
      { error: "Shop not allowed for your account", code: "SHOP_FORBIDDEN" },
      { status: 403 },
    );
  }

  const blobRes = await fetch(
    receipt.blobUrl,
    process.env.BLOB_READ_WRITE_TOKEN
      ? {
          headers: {
            Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
          },
        }
      : undefined,
  );
  if (!blobRes.ok || !blobRes.body) {
    return NextResponse.json({ error: "Failed to fetch file" }, { status: 502 });
  }

  return new NextResponse(blobRes.body, {
    headers: {
      "Content-Type":
        receipt.mimeType ??
        blobRes.headers.get("Content-Type") ??
        "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${receipt.fileName.replace(/"/g, "")}"`,
      ...(blobRes.headers.get("Content-Length")
        ? { "Content-Length": blobRes.headers.get("Content-Length")! }
        : {}),
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("book_notes.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const { id } = await params;
  const idResult = cuidSchema.safeParse(id);
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });
  }

  const receipt = await prisma.bookNoteReceipt.findFirst({
    where: {
      id: idResult.data,
      bookNoteDay: { companyId },
    },
    select: {
      id: true,
      bookNoteDay: {
        select: {
          companyLocationId: true,
          postingDate: true,
        },
      },
    },
  });
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  if (
    !assertBookNoteShopAllowed(
      access,
      receipt.bookNoteDay.companyLocationId,
    )
  ) {
    return NextResponse.json(
      { error: "Shop not allowed for your account", code: "SHOP_FORBIDDEN" },
      { status: 403 },
    );
  }

  const postingDate = postingDateYmd(receipt.bookNoteDay.postingDate);
  if (!isBookNoteWritable(postingDate)) {
    return NextResponse.json(
      {
        error: "This sales date is locked.",
        code: DAY_LOCKED_CODE,
      },
      { status: 409 },
    );
  }

  const ok = await deleteBookNoteReceipt({
    companyId,
    receiptId: receipt.id,
  });
  if (!ok) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
