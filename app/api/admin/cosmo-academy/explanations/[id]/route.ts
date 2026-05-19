import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requirePermission("academy.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = auth.context!.user!;
  const companyId = user.companyId;
  if (!companyId) {
    return NextResponse.json({ error: "No company associated with your account" }, { status: 404 });
  }

  const explanation = await prisma.cosmoAcademyExplanation.findFirst({
    where: { id: params.id, companyId },
    select: {
      id: true,
      productTitle: true,
      media: { select: { id: true, url: true, provider: true } },
    },
  });

  if (!explanation) {
    return NextResponse.json({ error: "Explanation not found" }, { status: 404 });
  }

  const blobUrls = explanation.media
    .filter((m) => m.provider === "vercel_blob" && m.url)
    .map((m) => m.url);

  // Delete blobs from Vercel storage (best-effort)
  if (blobUrls.length > 0) {
    try {
      await del(blobUrls);
    } catch (err) {
      console.error("[academy] Blob delete failed:", err);
    }
  }

  // Clean up ProductItemAsset rows that point to the same blob URLs
  if (blobUrls.length > 0) {
    await prisma.productItemAsset.deleteMany({
      where: { companyId, blobUrl: { in: blobUrls } },
    }).catch(() => {});
  }

  // Delete explanation (cascades to CosmoAcademyMedia + CosmoAcademyProgress)
  await prisma.cosmoAcademyExplanation.delete({ where: { id: params.id } });

  await writeAuditLog({
    companyId,
    actorUserId: user.id,
    module: "academy",
    action: "academy_explanation_deleted",
    entityType: "CosmoAcademyExplanation",
    entityId: explanation.id,
    summary: `Deleted explanation for ${explanation.productTitle}`,
    metadata: { productTitle: explanation.productTitle },
  });

  return NextResponse.json({ ok: true });
}
