import { randomUUID } from "node:crypto";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import {
  normalizeLoyaltyReasonLabel,
  seedOsScopesForDeploy,
  SEEDED_LOYALTY_REASONS,
  loyaltyReasonVisibleOnOs,
} from "@/lib/customer-insight/loyalty-reason-catalog";
import { prisma } from "@/lib/prisma";

export type LoyaltyReasonTemplateDto = {
  id: string;
  label: string;
  seeded: boolean;
};

export async function ensureSeededLoyaltyReasonTemplates(
  companyId: string
): Promise<void> {
  await prisma.$transaction(
    SEEDED_LOYALTY_REASONS.map((seed) =>
      prisma.loyaltyReasonTemplate.upsert({
        where: {
          companyId_syncKey: { companyId, syncKey: seed.syncKey },
        },
        create: {
          companyId,
          label: seed.label,
          normalizedLabel: normalizeLoyaltyReasonLabel(seed.label),
          syncKey: seed.syncKey,
          osScope: seed.osScope,
          seeded: true,
        },
        update: {
          label: seed.label,
          normalizedLabel: normalizeLoyaltyReasonLabel(seed.label),
          osScope: seed.osScope,
          seeded: true,
        },
      })
    )
  );
}

export async function listVisibleLoyaltyReasonTemplates(
  companyId: string,
  vaultOs = isVaultOsDeployment()
): Promise<LoyaltyReasonTemplateDto[]> {
  await ensureSeededLoyaltyReasonTemplates(companyId);
  const scopes = seedOsScopesForDeploy(vaultOs);
  const rows = await prisma.loyaltyReasonTemplate.findMany({
    where: {
      companyId,
      OR: [{ seeded: false }, { osScope: { in: scopes } }],
    },
    orderBy: [{ seeded: "desc" }, { label: "asc" }],
    select: { id: true, label: true, seeded: true, osScope: true },
  });
  return rows
    .filter((row) => !row.seeded || loyaltyReasonVisibleOnOs(row.osScope, vaultOs))
    .map((row) => ({
      id: row.id,
      label: row.label,
      seeded: row.seeded,
    }));
}

export type SaveLoyaltyReasonResult = {
  label: string;
  created: boolean;
  peerSynced: boolean;
  peerError: string | null;
};

export async function saveLoyaltyReasonTemplate(input: {
  companyId: string;
  label: string;
  syncKey?: string;
  replica?: boolean;
}): Promise<SaveLoyaltyReasonResult | { error: string }> {
  const label = input.label.trim().replace(/\s+/g, " ");
  const normalizedLabel = normalizeLoyaltyReasonLabel(label);
  if (!normalizedLabel) {
    return { error: "Reason is required" };
  }

  await ensureSeededLoyaltyReasonTemplates(input.companyId);

  const existing = await prisma.loyaltyReasonTemplate.findFirst({
    where: {
      companyId: input.companyId,
      OR: [
        { normalizedLabel },
        ...(input.syncKey ? [{ syncKey: input.syncKey }] : []),
      ],
    },
    select: { id: true, label: true, seeded: true, syncKey: true },
  });
  if (existing) {
    return {
      label: existing.label,
      created: false,
      peerSynced: true,
      peerError: null,
    };
  }

  const syncKey = input.syncKey?.trim() || `custom:${randomUUID()}`;
  await prisma.loyaltyReasonTemplate.create({
    data: {
      companyId: input.companyId,
      label,
      normalizedLabel,
      syncKey,
      osScope: "both",
      seeded: false,
    },
  });

  if (input.replica) {
    return { label, created: true, peerSynced: true, peerError: null };
  }

  const peer = await replicateLoyaltyReasonToPeer({ label, syncKey });
  return {
    label,
    created: true,
    peerSynced: peer.ok,
    peerError: peer.ok ? null : peer.error,
  };
}

export function loyaltyReasonPeerConfig(): {
  url: string;
  secret: string;
} | null {
  const url = process.env.LOYALTY_REASON_PEER_URL?.trim().replace(/\/+$/, "");
  const secret =
    process.env.LOYALTY_REASON_SYNC_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!url || !secret) return null;
  return { url, secret };
}

export function isLoyaltyReasonSyncAuthorized(header: string | null): boolean {
  const secret =
    process.env.LOYALTY_REASON_SYNC_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!secret) return process.env.NODE_ENV !== "production";
  return header === `Bearer ${secret}`;
}

async function replicateLoyaltyReasonToPeer(input: {
  label: string;
  syncKey: string;
}): Promise<{ ok: true } | { ok: false; error: string | null }> {
  const peer = loyaltyReasonPeerConfig();
  if (!peer) {
    return { ok: false, error: null };
  }
  try {
    const res = await fetch(`${peer.url}/api/internal/loyalty-reason-templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${peer.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        label: input.label,
        syncKey: input.syncKey,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      return {
        ok: false,
        error: body?.error?.trim() || `Other OS returned ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Other OS sync failed",
    };
  }
}

export async function peerCompanyId(): Promise<string | null> {
  const company = await prisma.company.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return company?.id ?? null;
}
