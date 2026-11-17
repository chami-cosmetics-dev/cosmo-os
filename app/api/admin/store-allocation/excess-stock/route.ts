import { NextResponse } from "next/server";
import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { prisma } from "@/lib/prisma";
import { requireStoreAllocationAccess } from "@/lib/store-allocation/auth";

async function access() {
  if (!isVaultOsDeployment()) return { ok: false as const, status: 404, error: "Unavailable" };
  return requireStoreAllocationAccess();
}

export async function GET() {
  const auth = await access();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rows = await prisma.storeAllocationExcessStock.findMany({ where: { companyId: auth.companyId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ rows });
}

export async function POST(request: Request) {
  const auth = await access();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  const qty = Number(body.qty);
  if (!sku || !Number.isSafeInteger(qty) || qty < 1) return NextResponse.json({ error: "Valid SKU and positive whole quantity required" }, { status: 400 });
  const item = await prisma.productItem.findFirst({ where: { companyId: auth.companyId, sku, status: { not: "archived" } }, select: { id: true } });
  if (!item) return NextResponse.json({ error: "SKU not found" }, { status: 404 });
  const row = await prisma.storeAllocationExcessStock.upsert({ where: { companyId_sku: { companyId: auth.companyId, sku } }, create: { companyId: auth.companyId, sku, qty }, update: { qty: { increment: qty } } });
  return NextResponse.json({ row });
}

export async function PATCH(request: Request) {
  const auth = await access();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  const sku = typeof body.sku === "string" ? body.sku.trim() : "";
  const qty = Number(body.qty);
  if (!sku || !Number.isSafeInteger(qty) || qty < 0) return NextResponse.json({ error: "Valid SKU and nonnegative whole quantity required" }, { status: 400 });
  const where = { companyId_sku: { companyId: auth.companyId, sku } };
  if (qty === 0) await prisma.storeAllocationExcessStock.deleteMany({ where: { companyId: auth.companyId, sku } });
  else await prisma.storeAllocationExcessStock.update({ where, data: { qty } });
  return NextResponse.json({ ok: true });
}
