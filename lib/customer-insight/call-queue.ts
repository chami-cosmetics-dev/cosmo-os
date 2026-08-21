import { writeAuditLog } from "@/lib/audit-log";
import { lifetimeTotalsByContactId } from "@/lib/customer-insight/lifetime-totals-batch";
import {
  findMerchantUserForFilterValue,
  resolveAssignedMerchantFilterLabels,
} from "@/lib/customer-insight/merchant-label-aliases";
import { merchantMatchKeysForUser } from "@/lib/customer-insight/ownership";
import { prisma } from "@/lib/prisma";

export const CALL_QUEUE_ASSIGN_CAP = 200;
export const CALL_QUEUE_PAGE_SIZE = 50;
export const CALL_QUEUE_STATUS_PENDING = "pending";
export const CALL_QUEUE_STATUS_COMPLETED = "completed";

const LAST_CONTACTED_ID_CHUNK = 4_000;

export type CallQueueRowDto = {
  contactId: string;
  name: string;
  phoneNumber: string | null;
  assignedMerchant: string | null;
  lifetimeTotal: number;
  lastPurchaseAt: string | null;
  lastContactedAt: string | null;
  queued: boolean;
};

export function compareOldestContactedFirst(
  a: { lastContactedAt: Date | null },
  b: { lastContactedAt: Date | null }
): number {
  if (a.lastContactedAt == null && b.lastContactedAt == null) return 0;
  if (a.lastContactedAt == null) return -1;
  if (b.lastContactedAt == null) return 1;
  return a.lastContactedAt.getTime() - b.lastContactedAt.getTime();
}

async function lastContactedMap(
  companyId: string,
  contactIds: string[]
): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (contactIds.length === 0) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < contactIds.length; i += LAST_CONTACTED_ID_CHUNK) {
    chunks.push(contactIds.slice(i, i + LAST_CONTACTED_ID_CHUNK));
  }
  const grouped = await Promise.all(
    chunks.map((slice) =>
      prisma.contactAllocationUpdate.groupBy({
        by: ["contactId"],
        where: {
          companyId,
          contactId: { in: slice },
          NOT: { category: "allocation" },
        },
        _max: { createdAt: true },
      })
    )
  );
  for (const rows of grouped) {
    for (const row of rows) {
      if (row._max.createdAt) map.set(row.contactId, row._max.createdAt);
    }
  }
  return map;
}

function assignedMerchantWhere(companyId: string, aliases: string[]) {
  if (aliases.length <= 1) {
    return {
      companyId,
      assignedMerchant: {
        equals: aliases[0] ?? "",
        mode: "insensitive" as const,
      },
    };
  }
  return {
    companyId,
    OR: aliases.map((alias) => ({
      assignedMerchant: { equals: alias, mode: "insensitive" as const },
    })),
  };
}

export async function listCallQueueCandidates(input: {
  companyId: string;
  merchantValue: string;
  page: number;
  pageSize?: number;
}): Promise<{ items: CallQueueRowDto[]; pagination: { page: number; pageSize: number; total: number } }> {
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? CALL_QUEUE_PAGE_SIZE));
  const page = Math.max(1, input.page);
  const aliases = await resolveAssignedMerchantFilterLabels(
    input.companyId,
    input.merchantValue
  );
  if (aliases.length === 0) {
    return { items: [], pagination: { page, pageSize, total: 0 } };
  }

  const contacts = await prisma.contactMaster.findMany({
    where: assignedMerchantWhere(input.companyId, aliases),
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      assignedMerchant: true,
      lastPurchaseAt: true,
      email: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true } },
    },
  });

  const ids = contacts.map((c) => c.id);
  const [contacted, queuedRows] = await Promise.all([
    lastContactedMap(input.companyId, ids),
    prisma.contactInsightCallQueue.findMany({
      where: {
        companyId: input.companyId,
        contactId: { in: ids },
        status: CALL_QUEUE_STATUS_PENDING,
      },
      select: { contactId: true },
    }),
  ]);
  const queued = new Set(queuedRows.map((r) => r.contactId));

  const ranked = contacts
    .map((c) => ({
      ...c,
      lastContactedAt: contacted.get(c.id) ?? null,
    }))
    .sort(compareOldestContactedFirst);

  const total = ranked.length;
  const start = (page - 1) * pageSize;
  const pageRows = ranked.slice(start, start + pageSize);
  const lifetimeById = await lifetimeTotalsByContactId(input.companyId, pageRows);

  return {
    items: pageRows.map((c) => ({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      assignedMerchant: c.assignedMerchant,
      lifetimeTotal: lifetimeById.get(c.id) ?? 0,
      lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
      lastContactedAt: c.lastContactedAt?.toISOString() ?? null,
      queued: queued.has(c.id),
    })),
    pagination: { page, pageSize, total },
  };
}

export async function assignCallQueue(input: {
  companyId: string;
  merchantValue: string;
  contactIds: string[];
  assignedByUserId: string | null;
}): Promise<{ assigned: number }> {
  const uniqueIds = [...new Set(input.contactIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return { assigned: 0 };
  if (uniqueIds.length > CALL_QUEUE_ASSIGN_CAP) {
    throw new Error(`Select at most ${CALL_QUEUE_ASSIGN_CAP} contacts`);
  }

  const aliases = await resolveAssignedMerchantFilterLabels(
    input.companyId,
    input.merchantValue
  );
  if (aliases.length === 0) throw new Error("Unknown merchant");

  const merchantUser = await findMerchantUserForFilterValue(
    input.companyId,
    input.merchantValue
  );
  const merchantLabel = merchantUser?.value ?? input.merchantValue.trim();

  const contacts = await prisma.contactMaster.findMany({
    where: {
      ...assignedMerchantWhere(input.companyId, aliases),
      id: { in: uniqueIds },
    },
    select: { id: true, name: true },
  });
  if (contacts.length === 0) return { assigned: 0 };

  const now = new Date();
  await prisma.$transaction(
    contacts.map((contact) =>
      prisma.contactInsightCallQueue.upsert({
        where: {
          companyId_contactId: {
            companyId: input.companyId,
            contactId: contact.id,
          },
        },
        create: {
          companyId: input.companyId,
          contactId: contact.id,
          merchantLabel,
          merchantUserId: merchantUser?.id ?? null,
          assignedByUserId: input.assignedByUserId,
          assignedAt: now,
          status: CALL_QUEUE_STATUS_PENDING,
          completedAt: null,
          completedByUserId: null,
        },
        update: {
          merchantLabel,
          merchantUserId: merchantUser?.id ?? null,
          assignedByUserId: input.assignedByUserId,
          assignedAt: now,
          status: CALL_QUEUE_STATUS_PENDING,
          completedAt: null,
          completedByUserId: null,
        },
      })
    )
  );

  await writeAuditLog({
    companyId: input.companyId,
    actorUserId: input.assignedByUserId ?? undefined,
    module: "customer-insight",
    action: "call_queue_assign",
    entityType: "ContactInsightCallQueue",
    summary: `Assigned ${contacts.length} contact(s) to call queue (${merchantLabel})`,
    metadata: {
      merchantLabel,
      merchantUserId: merchantUser?.id ?? null,
      contactIds: contacts.map((c) => c.id),
    },
  });

  return { assigned: contacts.length };
}

export async function listMerchantCallQueue(input: {
  companyId: string;
  viewer: {
    id: string;
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
  };
}): Promise<{ items: CallQueueRowDto[] }> {
  const keys = merchantMatchKeysForUser(input.viewer);
  const rows = await prisma.contactInsightCallQueue.findMany({
    where: {
      companyId: input.companyId,
      status: CALL_QUEUE_STATUS_PENDING,
      OR: [
        { merchantUserId: input.viewer.id },
        ...keys.map((label) => ({
          merchantLabel: { equals: label, mode: "insensitive" as const },
        })),
      ],
    },
    select: {
      contactId: true,
      contact: {
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          assignedMerchant: true,
          lastPurchaseAt: true,
          email: true,
          phones: { select: { phoneNumber: true } },
          emails: { select: { email: true } },
        },
      },
    },
  });

  const contacts = rows.map((r) => r.contact);
  const ids = contacts.map((c) => c.id);
  const [contacted, lifetimeById] = await Promise.all([
    lastContactedMap(input.companyId, ids),
    lifetimeTotalsByContactId(input.companyId, contacts),
  ]);

  const items = contacts
    .map((c) => ({
      contactId: c.id,
      name: c.name,
      phoneNumber: c.phoneNumber,
      assignedMerchant: c.assignedMerchant,
      lifetimeTotal: lifetimeById.get(c.id) ?? 0,
      lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
      lastContactedAt: contacted.get(c.id)?.toISOString() ?? null,
      queued: true,
      lastContactedAtDate: contacted.get(c.id) ?? null,
    }))
    .sort((a, b) =>
      compareOldestContactedFirst(
        { lastContactedAt: a.lastContactedAtDate },
        { lastContactedAt: b.lastContactedAtDate }
      )
    )
    .map(({ lastContactedAtDate: _drop, ...row }) => row);

  return { items };
}

export async function completeCallQueueItem(input: {
  companyId: string;
  contactId: string;
  completedByUserId: string | null;
}): Promise<void> {
  await prisma.contactInsightCallQueue.updateMany({
    where: {
      companyId: input.companyId,
      contactId: input.contactId,
      status: CALL_QUEUE_STATUS_PENDING,
    },
    data: {
      status: CALL_QUEUE_STATUS_COMPLETED,
      completedAt: new Date(),
      completedByUserId: input.completedByUserId,
    },
  });
}
