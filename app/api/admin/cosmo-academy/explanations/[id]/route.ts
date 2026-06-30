import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

import { writeAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
    where: { id, companyId },
    select: {
      id: true,
      productTitle: true,
      media: { select: { id: true, url: true, provider: true, publicId: true } },
    },
  });

  if (!explanation) {
    return NextResponse.json({ error: "Explanation not found" }, { status: 404 });
  }

  const cloudinaryMedia = explanation.media.filter(
    (m) => m.provider === "cloudinary" && m.publicId,
  );
  const allUrls = explanation.media.filter((m) => m.url).map((m) => m.url);

  // Delete files from Cloudinary (best-effort)
  if (cloudinaryMedia.length > 0) {
    try {
      await Promise.all(
        cloudinaryMedia.map((m) =>
          cloudinary.uploader.destroy(m.publicId!, { resource_type: "video" }),
        ),
      );
    } catch (err) {
      console.error("[academy] Cloudinary delete failed:", err);
    }
  }

  // Clean up ProductItemAsset rows that point to the same URLs
  if (allUrls.length > 0) {
    await prisma.productItemAsset.deleteMany({
      where: { companyId, blobUrl: { in: allUrls } },
    }).catch(() => {});
  }

  // Delete explanation (cascades to CosmoAcademyMedia + CosmoAcademyProgress)
  await prisma.cosmoAcademyExplanation.delete({ where: { id } });

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
