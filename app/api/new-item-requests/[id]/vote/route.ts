import { NextRequest, NextResponse } from "next/server";

import { NEW_ITEM_REQUESTS_ANY_PERMISSION } from "@/lib/new-item-requests/permissions";
import { NewItemRequestError, unvoteOnRequest, voteOnRequest } from "@/lib/new-item-requests/store";
import { requireAnyPermission } from "@/lib/rbac";
import { cuidSchema } from "@/lib/validation";
import { newItemRequestVoteBodySchema } from "@/lib/validation/new-item-requests";

export const dynamic = "force-dynamic";

function jsonError(error: unknown, fallback: string) {
  if (error instanceof NewItemRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[new-item-requests/vote]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyPermission([...NEW_ITEM_REQUESTS_ANY_PERMISSION]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const idParsed = cuidSchema.safeParse(id);
  if (!idParsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const parsed = newItemRequestVoteBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Customer name and phone are required" },
      { status: 400 },
    );
  }

  try {
    const item = await voteOnRequest(auth.context!, idParsed.data, parsed.data);
    return NextResponse.json({ request: item });
  } catch (error) {
    return jsonError(error, "Could not vote");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAnyPermission([...NEW_ITEM_REQUESTS_ANY_PERMISSION]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const parsed = cuidSchema.safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    const item = await unvoteOnRequest(auth.context!, parsed.data);
    return NextResponse.json({ request: item });
  } catch (error) {
    return jsonError(error, "Could not remove vote");
  }
}
