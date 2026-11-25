/**
 * Backfill Cosmo MaterialTransfer for ERP1 MAT-STE-2026-00349 (Main → OGF).
 * Dry run default. Pass --apply to write.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const ERP_NAME = "MAT-STE-2026-00349";
const ERP_JSON =
  process.env.ERP_JSON_PATH ??
  "C:/Users/Bad-Boy/.cursor/projects/c-dev-cosmo-os/agent-tools/09401808-32df-4474-8255-1365009c4561.txt";
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

type StockEntry = {
  name: string;
  company: string;
  from_warehouse: string;
  to_warehouse: string;
  owner?: string;
  items: Array<{
    item_code: string;
    item_name?: string | null;
    barcode?: string | null;
    uom?: string | null;
    qty: number;
  }>;
};

async function main() {
  const prisma = new PrismaClient();
  try {
    const raw = JSON.parse(readFileSync(ERP_JSON, "utf8")) as StockEntry;
    if (raw.name !== ERP_NAME) throw new Error(`Unexpected name ${raw.name}`);
    if (raw.from_warehouse !== "Main Warehouse - Cosmo") {
      throw new Error(`Unexpected from ${raw.from_warehouse}`);
    }
    if (raw.to_warehouse !== "OGF Shop Warehouse - Cosmo") {
      throw new Error(`Unexpected to ${raw.to_warehouse}`);
    }

    const company = await prisma.company.findFirst({
      where: { id: COMPANY_ID },
      select: { id: true, name: true },
    });
    if (!company) throw new Error("Company not found");

    const existingErp1 = await prisma.materialTransfer.findFirst({
      where: { companyId: company.id, slot: "erp1", erpName: ERP_NAME },
      select: { id: true, status: true, targetWarehouse: true },
    });
    if (existingErp1) {
      console.log("Already exists", existingErp1);
      return;
    }

    const ownerEmail = String(raw.owner ?? "").trim().toLowerCase();
    const createdBy = ownerEmail
      ? await prisma.user.findFirst({
          where: {
            OR: [
              { email: { equals: ownerEmail, mode: "insensitive" } },
              { erpnextUsername: { equals: ownerEmail, mode: "insensitive" } },
            ],
          },
          select: { id: true, email: true, name: true },
        })
      : null;

    const lines = raw.items.map((item) => ({
      itemCode: String(item.item_code).trim(),
      itemName: String(item.item_name ?? item.item_code).trim() || String(item.item_code),
      barcode: String(item.barcode ?? "").trim(),
      uom: String(item.uom ?? "Nos").trim() || "Nos",
      qty: Math.round(Number(item.qty)),
    }));

    const bad = lines.filter((l) => !l.itemCode || !Number.isFinite(l.qty) || l.qty < 1);
    if (bad.length) throw new Error(`Bad lines: ${JSON.stringify(bad.slice(0, 5))}`);

    console.log(
      JSON.stringify(
        {
          apply: APPLY,
          erpName: ERP_NAME,
          company: raw.company,
          from: raw.from_warehouse,
          to: raw.to_warehouse,
          lineCount: lines.length,
          totalQty: lines.reduce((s, l) => s + l.qty, 0),
          createdBy: createdBy,
        },
        null,
        2,
      ),
    );

    if (!APPLY) {
      console.log("Dry run only. Pass --apply to create Cosmo receipt.");
      return;
    }

    const created = await prisma.materialTransfer.create({
      data: {
        companyId: company.id,
        slot: "erp1",
        direction: "store_to_shop",
        erpName: ERP_NAME,
        erpCompany: raw.company,
        sourceWarehouse: raw.from_warehouse,
        targetWarehouse: raw.to_warehouse,
        status: "sent",
        createdByUserId: createdBy?.id ?? null,
        lines: {
          create: lines.map((line) => ({
            itemCode: line.itemCode,
            itemName: line.itemName,
            barcode: line.barcode,
            uom: line.uom,
            sentQty: line.qty,
            receivedQty: 0,
          })),
        },
      },
      select: {
        id: true,
        erpName: true,
        slot: true,
        status: true,
        sourceWarehouse: true,
        targetWarehouse: true,
        createdByUserId: true,
        _count: { select: { lines: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorUserId: createdBy?.id ?? null,
        module: "material-transfer",
        action: "material_transfer_submitted",
        entityType: "Stock Entry",
        entityId: ERP_NAME,
        summary: `Backfilled Cosmo receipt for ${ERP_NAME} ${raw.from_warehouse} → ${raw.to_warehouse}`,
        afterData: {
          name: ERP_NAME,
          slot: "erp1",
          company: raw.company,
          sourceWarehouse: raw.from_warehouse,
          targetWarehouse: raw.to_warehouse,
          receiptId: created.id,
          backfill: true,
          lineCount: lines.length,
        },
      },
    });

    console.log("CREATED", JSON.stringify(created, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
