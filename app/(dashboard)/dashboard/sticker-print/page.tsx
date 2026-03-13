import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";
import { StickerPrintClient } from "./sticker-print-client";

export default async function StickerPrintPage({
  searchParams,
}: {
  searchParams?: Promise<{ batchId?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialSelectedBatchId = resolvedSearchParams?.batchId?.trim() ?? "";
  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId ?? null;

  let batches: Array<{ id: string; batchName: string }> = [];
  if (companyId) {
    try {
      batches = await (
        prisma as unknown as {
          stickerBatch: {
            findMany: (args: {
              where: { companyId: string };
              orderBy: { createdAt: "desc" };
              select: { id: true; batchName: true };
            }) => Promise<Array<{ id: string; batchName: string }>>;
          };
        }
      ).stickerBatch.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        select: { id: true, batchName: true },
      });
    } catch {
      batches = [];
    }
  }

  return (
    <StickerPrintClient
      batches={batches}
      initialSelectedBatchId={initialSelectedBatchId}
    />
  );
}
