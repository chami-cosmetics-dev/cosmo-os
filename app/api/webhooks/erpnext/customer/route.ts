import { NextRequest, NextResponse } from "next/server";

import { syncContactMasterSafely } from "@/lib/contact-master-sync";
import { getMerchantDisplayName } from "@/lib/customer-insight/auto-allocate";
import { resolveCompanyIdsForErpWebhookSecret } from "@/lib/erp-item-price-sync";
import { erpSlotSourceFromLabel } from "@/lib/erpnext-contact-sync";
import { getPrimaryMerCode } from "@/lib/merchant-allocation";
import { prisma } from "@/lib/prisma";
import { erpnextCustomerWebhookSchema } from "@/lib/validation/erpnext-customer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function unwrapErpPayload(raw: unknown): Record<string, unknown> {
  const top = raw as Record<string, unknown>;
  if (top?.data !== null && typeof top?.data === "object" && !Array.isArray(top.data)) {
    return top.data as Record<string, unknown>;
  }
  return top ?? {};
}

function parseOccurredAt(raw: string | null | undefined): Date {
  if (!raw) return new Date(0);
  // ERPNext timestamps look like "2026-08-11 10:00:00.123456"
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

/**
 * ERPNext Customer → Cosmo ContactMaster.
 *
 * ERP setup: Webhook on Customer (after insert / after update) →
 * POST /api/webhooks/erpnext/customer with header x-erpnext-secret.
 *
 * Auth is by secret (Customer has no company field), same as Item Price webhook.
 * Allocation: if creator User has a MER code, set assignedMerchant to that MER;
 * otherwise leave unassigned.
 */
export async function POST(request: NextRequest) {
  const incomingSecret = request.headers.get("x-erpnext-secret") ?? "";

  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyIds = await resolveCompanyIdsForErpWebhookSecret(incomingSecret);
  if (companyIds.length === 0) {
    console.error("[ERPNext Customer webhook] Unauthorized or unknown secret");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prefer Cosmetics company when secret maps to multiple (rare).
  const companyId = companyIds[0]!;

  const instance = await prisma.erpnextInstance.findFirst({
    where: {
      companyId,
      incomingWebhookSecret: incomingSecret,
    },
    select: { label: true },
  });

  const parsed = erpnextCustomerWebhookSchema.safeParse(unwrapErpPayload(rawPayload));
  if (!parsed.success) {
    console.error(
      "[ERPNext Customer webhook] Validation failed",
      parsed.error.flatten(),
    );
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  if (!data.mobile_no && !data.email_id) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "no_phone_or_email",
    });
  }

  const ownerRaw = data.owner?.trim() ?? null;
  const creator = ownerRaw
    ? await prisma.user.findUnique({
        where: { erpnextUsername: ownerRaw },
        select: { knownName: true, name: true, email: true, couponCodes: true },
      })
    : null;

  const recentMerchant = getMerchantDisplayName({
    knownName: creator?.knownName ?? null,
    name: creator?.name ?? null,
    email: creator?.email ?? null,
  });

  // Only allocate when creator has a MER; otherwise leave assignedMerchant empty.
  const assignedMerchantMer = creator ? getPrimaryMerCode(creator.couponCodes) : null;

  const displayName = data.customer_name ?? data.name;

  try {
    const result = await syncContactMasterSafely({
      companyId,
      sourceLabel: instance?.label?.trim() || "ERPNext customer",
      sourceType: "erp_customer_backfill",
      source: erpSlotSourceFromLabel(instance?.label ?? null),
      sourceId: data.name,
      occurredAt: parseOccurredAt(data.creation),
      email: data.email_id,
      phoneNumber: data.mobile_no,
      name: displayName,
      recentMerchant,
      assignedMerchantMer,
      auditBehavior: "summary_only",
    });
    console.log(
      `[ERPNext Customer webhook] ${data.name}: ${result.status}` +
        ("contactId" in result ? ` (${result.contactId})` : "") +
        ` mer=${assignedMerchantMer ?? "(none)"}`,
    );
  } catch (error) {
    console.error("[ERPNext Customer webhook] sync failed:", error);
    return NextResponse.json({ error: "Customer sync failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
