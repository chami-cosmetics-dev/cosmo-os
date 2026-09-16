/**
 * Local import helpers for rider charge + zone membership workbooks.
 * npx tsx scripts/import-rider-delivery-charges-file.ts charges [path]
 * npx tsx scripts/import-rider-delivery-charges-file.ts zones [path]
 */
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

import {
  parseRiderDeliveryChargesFromWorkbookSheets,
  parseRiderDeliveryZoneMembersFromWorkbookSheets,
} from "../lib/rider-delivery-charge";

async function importCharges(path: string) {
  const wb = XLSX.readFile(path);
  const sheets = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][],
  }));
  const parsed = parseRiderDeliveryChargesFromWorkbookSheets(sheets);
  console.log({
    mode: "charges",
    sheetName: parsed.sheetName,
    format: parsed.format,
    rows: parsed.rows.length,
    skippedBlank: parsed.skippedBlank,
    errors: parsed.errors.slice(0, 10),
  });
  if (!parsed.rows.length) process.exit(1);

  const prisma = new PrismaClient();
  let created = 0;
  let updated = 0;
  for (const row of parsed.rows) {
    const data = {
      label: row.label.slice(0, 200),
      district: row.district,
      shippingAmount: row.shippingAmount,
      riderDeliveryCharge: row.riderDeliveryCharge,
      shippingAccount: row.shippingAccount,
      costCenter: row.costCenter,
    };
    const existing = await prisma.riderDeliveryChargeRule.findUnique({
      where: { labelKey: row.labelKey },
      select: { id: true },
    });
    if (existing) {
      await prisma.riderDeliveryChargeRule.update({ where: { labelKey: row.labelKey }, data });
      updated += 1;
    } else {
      await prisma.riderDeliveryChargeRule.create({ data: { labelKey: row.labelKey, ...data } });
      created += 1;
    }
  }
  const removed = await prisma.riderDeliveryChargeRule.deleteMany({
    where: { labelKey: { startsWith: "zone " } },
  });
  const count = await prisma.riderDeliveryChargeRule.count();
  console.log({ created, updated, count, removedZoneChargeKeys: removed.count });
  await prisma.$disconnect();
}

async function importZones(path: string) {
  const wb = XLSX.readFile(path);
  const sheets = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][],
  }));
  const parsed = parseRiderDeliveryZoneMembersFromWorkbookSheets(sheets);
  console.log({
    mode: "zones",
    sheetName: parsed.sheetName,
    format: parsed.format,
    rows: parsed.rows.length,
    skippedBlank: parsed.skippedBlank,
    errors: parsed.errors.slice(0, 10),
  });
  if (!parsed.rows.length) process.exit(1);

  const prisma = new PrismaClient();
  await prisma.riderDeliveryZoneMember.deleteMany({});
  await prisma.riderDeliveryZoneMember.createMany({
    data: parsed.rows.map((row) => ({
      zoneKey: row.zoneKey,
      zoneLabel: row.zoneLabel.slice(0, 200),
      districtLabelKey: row.districtLabelKey,
      districtLabel: row.districtLabel.slice(0, 200),
    })),
  });
  const count = await prisma.riderDeliveryZoneMember.count();
  console.log({ imported: parsed.rows.length, count });
  await prisma.$disconnect();
}

async function main() {
  const mode = process.argv[2] || "charges";
  if (mode === "zones") {
    const path =
      process.argv[3] || "C:/Users/Bad-Boy/Downloads/Riders Delivery charges- Updated.xlsx";
    await importZones(path);
    return;
  }
  if (mode === "charges") {
    const path = process.argv[3] || "C:/Users/Bad-Boy/Downloads/Shipping Rule New (1).xlsx";
    await importCharges(path);
    return;
  }
  console.error("Usage: npx tsx scripts/import-rider-delivery-charges-file.ts [charges|zones] [path]");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
