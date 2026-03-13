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

export default async function StickerBatchPage({
  searchParams,
}: {
  searchParams?: Promise<{ batchId?: string; tab?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialSelectedBatchId = resolvedSearchParams?.batchId?.trim() ?? "";
  const initialTab = resolvedSearchParams?.tab === "history" ? "history" : "batch";
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

  let initialBatches: Array<{
    id: string;
    batchName: string;
    mode: "single" | "multiple" | "unassigned";
  }> = [];
  let initialHistoryRows: Array<{
    id: string;
    batchName: string;
    remark: string | null;
    createdAt: string;
    supplierName: string;
    itemCount: number;
  }> = [];
  if (companyId) {
    try {
      const batches = await (
        prisma as unknown as {
          stickerBatch: {
            findMany: (args: {
              where: { companyId: string };
              orderBy: { createdAt: "desc" };
              select: {
                id: true;
                batchName: true;
                items: { select: { companyLocationId: true } };
              };
            }) => Promise<
              Array<{
                id: string;
                batchName: string;
                remark: string | null;
                createdAt: Date;
                supplier: { name: string };
                items: Array<{ companyLocationId: string }>;
              }>
            >;
          };
        }
      ).stickerBatch.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          batchName: true,
          remark: true,
          createdAt: true,
          supplier: { select: { name: true } },
          items: { select: { companyLocationId: true } },
        },
      });
      initialBatches = batches.map((batch) => {
        const uniqueLocationCount = new Set(
          batch.items.map((item) => item.companyLocationId)
        ).size;
        const mode =
          uniqueLocationCount === 0
            ? "unassigned"
            : uniqueLocationCount > 1
              ? "multiple"
              : "single";
        return { id: batch.id, batchName: batch.batchName, mode };
      });
      initialHistoryRows = batches.map((batch) => ({
        id: batch.id,
        batchName: batch.batchName,
        remark: batch.remark,
        createdAt: batch.createdAt.toISOString(),
        supplierName: batch.supplier.name,
        itemCount: batch.items.length,
      }));
    } catch {
      initialBatches = [];
      initialHistoryRows = [];
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
      initialSelectedBatchId={initialSelectedBatchId}
      initialTab={initialTab}
      initialHistoryRows={initialHistoryRows}
    />
  );
}
