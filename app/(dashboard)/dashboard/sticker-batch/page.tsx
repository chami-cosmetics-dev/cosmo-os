import { prisma } from "@/lib/prisma";
import { getCurrentUserContext } from "@/lib/rbac";
import { StickerBatchClient } from "./sticker-batch-client";

function getTodayDate() {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(new Date());
}

export default async function StickerBatchPage() {
  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId ?? null;

  const [suppliers, locations, rawItemCatalog] = companyId
    ? await Promise.all([
        prisma.supplier.findMany({
          where: { companyId },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            code: true,
          },
        }),
        prisma.companyLocation.findMany({
          where: {
            companyId,
            AND: [
              { locationReference: { not: null } },
              { locationReference: { not: "" } },
            ],
          },
          orderBy: { locationReference: "asc" },
          select: {
            id: true,
            name: true,
            locationReference: true,
          },
        }),
        prisma.productItem.findMany({
          where: { companyId },
          select: {
            id: true,
            companyLocationId: true,
            sku: true,
            barcode: true,
            productTitle: true,
            variantTitle: true,
            price: true,
          },
        }),
      ])
    : [[], [], []];

  let initialBatches: Array<{ id: string; batchName: string }> = [];
  if (companyId) {
    try {
      const batches = await (
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
      initialBatches = batches;
    } catch {
      initialBatches = [];
    }
  }

  const itemCatalog = rawItemCatalog.map((item) => ({
    ...item,
    price: item.price.toString(),
  }));

  return (
    <StickerBatchClient
      suppliers={suppliers}
      locations={locations}
      itemCatalog={itemCatalog}
      initialBatches={initialBatches}
      today={getTodayDate()}
    />
  );
}
