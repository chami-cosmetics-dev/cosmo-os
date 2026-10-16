import { NextRequest, NextResponse } from "next/server";

import { createStoreAllocationPurchaseReceipts } from "@/lib/item-creation/automation";
import { requireStoreAllocationAccess } from "@/lib/store-allocation/auth";

export async function POST(request: NextRequest) {
  const auth = await requireStoreAllocationAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json();
    const receipts = await createStoreAllocationPurchaseReceipts(auth.context!, body);
    return NextResponse.json({ receipts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Purchase Receipt creation failed" },
      { status: 400 },
    );
  }
}
