import "server-only";

import { randomInt } from "crypto";

import { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit-log";
import { formatAppIsoDate } from "@/lib/format-datetime";
import {
  checkResultForStatus,
  deriveGiftVoucherStatus,
  GIFT_VOUCHER_FIRST_GROUP_NUMBER,
  generateRandomVoucherCodes,
  normalizeVoucherCode,
  type GiftVoucherCheck,
  type GiftVoucherCodeRow,
  type GiftVoucherDateField,
  type GiftVoucherGroupOption,
  type GiftVoucherStatus,
} from "@/lib/gift-vouchers/types";
import { prisma } from "@/lib/prisma";

/** Codes are inserted in chunks to stay well under Postgres' bind-parameter limit. */
const CODE_INSERT_CHUNK = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnlyString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Start of a Colombo calendar day as an instant (Sri Lanka is a fixed UTC+05:30). */
function colomboDayStart(value: string): Date {
  return new Date(`${value}T00:00:00.000+05:30`);
}

function todayInAppZone(): string {
  return formatAppIsoDate(new Date());
}

function statusWhere(status: GiftVoucherStatus, today: Date): Prisma.GiftVoucherCodeWhereInput {
  switch (status) {
    case "USED":
      return { used: true };
    case "PENDING":
      return { used: false, group: { startDate: { gt: today } } };
    case "EXPIRED":
      return { used: false, group: { endDate: { lt: today } } };
    case "ACTIVE":
      return { used: false, group: { startDate: { lte: today }, endDate: { gte: today } } };
  }
}

function toGroupOption(group: {
  id: string;
  groupNumber: number;
  name: string;
  codePrefix: string;
  quantity: number;
  startDate: Date;
  endDate: Date;
}): GiftVoucherGroupOption {
  return {
    id: group.id,
    groupNumber: group.groupNumber,
    name: group.name,
    codePrefix: group.codePrefix,
    quantity: group.quantity,
    startDate: dateOnlyString(group.startDate),
    endDate: dateOnlyString(group.endDate),
  };
}

export async function listGiftVoucherGroups(companyId: string): Promise<GiftVoucherGroupOption[]> {
  const groups = await prisma.giftVoucherGroup.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      groupNumber: true,
      name: true,
      codePrefix: true,
      quantity: true,
      startDate: true,
      endDate: true,
    },
  });
  return groups.map(toGroupOption);
}

type NewGroupCodes =
  | { mode: "generate"; quantity: number }
  | { mode: "manual"; codes: string[] };

export async function createGiftVoucherGroup(
  input: {
    companyId: string;
    actorUserId: string | null;
    name: string;
    codePrefix: string;
    startDate: string;
    endDate: string;
  } & NewGroupCodes,
): Promise<Result<{ group: GiftVoucherGroupOption; firstCode: string; lastCode: string }>> {
  const { companyId, codePrefix } = input;

  let created: Awaited<ReturnType<typeof insertGroup>>;
  try {
    created = await insertGroup();
  } catch (error) {
    if (error instanceof GroupConflictError) {
      return { ok: false, status: 409, error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        status: 409,
        error: "Another group was created with the same name or codes at the same time. Try again.",
      };
    }
    throw error;
  }

  const { codes } = created;
  const firstCode = codes[0].code;
  const lastCode = codes[codes.length - 1].code;
  const group = toGroupOption(created.group);

  await writeAuditLog({
    companyId,
    actorUserId: input.actorUserId,
    module: "products",
    action: "gift_voucher_group_created",
    entityType: "gift_voucher_group",
    entityId: group.id,
    summary:
      input.mode === "generate"
        ? `Created gift voucher group #${group.groupNumber} "${group.name}" with ${codes.length} randomly generated codes`
        : `Created gift voucher group #${group.groupNumber} "${group.name}" with ${codes.length} entered codes`,
    afterData: { ...group, mode: input.mode, codes: codes.map((c) => c.code) },
  });

  return { ok: true, data: { group, firstCode, lastCode } };

  async function insertGroup() {
    return prisma.$transaction(
      async (tx) => {
        const nameTaken = await tx.giftVoucherGroup.findFirst({
          where: { companyId, name: { equals: input.name, mode: "insensitive" } },
          select: { id: true },
        });
        if (nameTaken) throw new GroupConflictError(`A group named "${input.name}" already exists.`);

        // Take the next permanent group number. The upsert locks the counter row until this
        // transaction ends, so concurrent creations queue up and never share a number; a
        // rolled-back creation never handed its number to a saved group.
        const [counter] = await tx.$queryRaw<{ lastGroupNumber: number }[]>`
          INSERT INTO "GiftVoucherCounter" ("companyId", "lastGroupNumber", "updatedAt")
          VALUES (${companyId}, ${GIFT_VOUCHER_FIRST_GROUP_NUMBER}, NOW())
          ON CONFLICT ("companyId") DO UPDATE
            SET "lastGroupNumber" = "GiftVoucherCounter"."lastGroupNumber" + 1, "updatedAt" = NOW()
          RETURNING "lastGroupNumber"
        `;
        const groupNumber = counter.lastGroupNumber;

        let codes: { code: string; sequence: number | null }[];
        if (input.mode === "generate") {
          codes = await generateUnusedCodes(tx, companyId, groupNumber, input.quantity);
        } else {
          codes = input.codes.map((code) => ({ code, sequence: null }));
          // A code may belong to only one group, so reuse across groups is blocked up front.
          const clash = (await findExistingCodes(tx, companyId, codes.map((c) => c.code)))[0];
          if (clash) {
            throw new GroupConflictError(
              `Code ${clash.code} already exists in group "${clash.groupName}". Remove it and try again.`,
            );
          }
        }

        const group = await tx.giftVoucherGroup.create({
          data: {
            companyId,
            groupNumber,
            name: input.name,
            codePrefix,
            quantity: codes.length,
            startDate: dateOnly(input.startDate),
            endDate: dateOnly(input.endDate),
            createdById: input.actorUserId,
          },
        });

        for (let i = 0; i < codes.length; i += CODE_INSERT_CHUNK) {
          await tx.giftVoucherCode.createMany({
            data: codes.slice(i, i + CODE_INSERT_CHUNK).map((c) => ({
              companyId,
              groupId: group.id,
              code: c.code,
              sequence: c.sequence,
            })),
          });
        }

        return { group, codes };
      },
      { timeout: 60_000 },
    );
  }
}

class GroupConflictError extends Error {}

type Tx = Prisma.TransactionClient;

const MAX_GENERATE_ATTEMPTS = 10;

async function findExistingCodes(
  tx: Tx,
  companyId: string,
  codes: string[],
): Promise<{ code: string; groupName: string }[]> {
  const found: { code: string; groupName: string }[] = [];
  for (let i = 0; i < codes.length; i += CODE_INSERT_CHUNK) {
    const rows = await tx.giftVoucherCode.findMany({
      where: { companyId, code: { in: codes.slice(i, i + CODE_INSERT_CHUNK) } },
      select: { code: true, group: { select: { name: true } } },
    });
    found.push(...rows.map((r) => ({ code: r.code, groupName: r.group.name })));
  }
  return found;
}

/**
 * COS + group number + 5 crypto-random digits, unique within the group. Any code that
 * already exists in the table (used, expired or voided alike) is regenerated and retried.
 */
async function generateUnusedCodes(
  tx: Tx,
  companyId: string,
  groupNumber: number,
  quantity: number,
): Promise<{ code: string; sequence: number }[]> {
  const accepted: { code: string; sequence: number }[] = [];
  const rejected = new Set<string>();

  for (let attempt = 0; accepted.length < quantity; attempt++) {
    if (attempt >= MAX_GENERATE_ATTEMPTS) {
      throw new GroupConflictError("Could not generate enough unique codes. Try again.");
    }
    const exclude = new Set([...rejected, ...accepted.map((c) => c.code)]);
    const batch = generateRandomVoucherCodes({
      groupNumber,
      quantity: quantity - accepted.length,
      exclude,
      randomInt: (min, max) => randomInt(min, max + 1),
    });
    if (!batch) {
      throw new GroupConflictError(`A group can hold at most ${quantity - 1} more generated codes.`);
    }
    const clashes = new Set((await findExistingCodes(tx, companyId, batch.map((c) => c.code))).map((c) => c.code));
    for (const c of batch) {
      if (clashes.has(c.code)) rejected.add(c.code);
      else accepted.push({ code: c.code, sequence: c.randomPart });
    }
  }

  return accepted.sort((a, b) => a.sequence - b.sequence);
}

export async function listGiftVoucherCodes(input: {
  companyId: string;
  page: number;
  limit: number;
  groupId?: string;
  code?: string;
  status?: GiftVoucherStatus;
  dateField?: GiftVoucherDateField;
  from?: string;
  to?: string;
}): Promise<{ rows: GiftVoucherCodeRow[]; total: number }> {
  const today = todayInAppZone();
  const and: Prisma.GiftVoucherCodeWhereInput[] = [{ companyId: input.companyId }];

  if (input.groupId) and.push({ groupId: input.groupId });
  if (input.code) and.push({ code: { contains: normalizeVoucherCode(input.code) } });
  if (input.status) and.push(statusWhere(input.status, dateOnly(today)));

  if (input.from || input.to) {
    if (input.dateField === "start") {
      and.push({
        group: {
          startDate: {
            ...(input.from ? { gte: dateOnly(input.from) } : {}),
            ...(input.to ? { lte: dateOnly(input.to) } : {}),
          },
        },
      });
    } else {
      and.push({
        usedAt: {
          ...(input.from ? { gte: colomboDayStart(input.from) } : {}),
          ...(input.to ? { lt: new Date(colomboDayStart(input.to).getTime() + DAY_MS) } : {}),
        },
      });
    }
  }

  const where: Prisma.GiftVoucherCodeWhereInput = { AND: and };
  const [total, codes] = await Promise.all([
    prisma.giftVoucherCode.count({ where }),
    prisma.giftVoucherCode.findMany({
      where,
      orderBy: [{ group: { createdAt: "desc" } }, { sequence: "asc" }, { code: "asc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: {
        id: true,
        code: true,
        used: true,
        orderNo: true,
        usedAt: true,
        phoneNo: true,
        group: { select: { groupNumber: true, name: true, startDate: true, endDate: true } },
      },
    }),
  ]);

  const rows = codes.map((c): GiftVoucherCodeRow => {
    const startDate = dateOnlyString(c.group.startDate);
    const endDate = dateOnlyString(c.group.endDate);
    return {
      id: c.id,
      code: c.code,
      status: deriveGiftVoucherStatus({ used: c.used, startDate, endDate, today }),
      groupNumber: c.group.groupNumber,
      groupName: c.group.name,
      startDate,
      endDate,
      orderNo: c.orderNo,
      usedAt: c.usedAt?.toISOString() ?? null,
      phoneNo: c.phoneNo,
    };
  });

  return { rows, total };
}

export async function checkGiftVoucherCode(companyId: string, rawCode: string): Promise<GiftVoucherCheck> {
  const code = normalizeVoucherCode(rawCode);
  const found = await prisma.giftVoucherCode.findUnique({
    where: { companyId_code: { companyId, code } },
    select: {
      used: true,
      group: { select: { name: true, startDate: true, endDate: true } },
    },
  });

  if (!found) {
    return { code, result: "NOT_FOUND", groupName: null, startDate: null, endDate: null };
  }

  const startDate = dateOnlyString(found.group.startDate);
  const endDate = dateOnlyString(found.group.endDate);
  const status = deriveGiftVoucherStatus({ used: found.used, startDate, endDate, today: todayInAppZone() });
  return {
    code,
    result: checkResultForStatus(status),
    groupName: found.group.name,
    startDate,
    endDate,
  };
}
