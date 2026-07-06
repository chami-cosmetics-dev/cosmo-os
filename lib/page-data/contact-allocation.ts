import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const PREVIEW_LIMIT = 200;

export type ContactAllocationFilters = {
  serviceProvider?: string | null;
  source?: string | null;
  country?: string | null;
  district?: string | null;
  town?: string | null;
  zone?: string | null;
  gender?: string | null;
  origin?: string | null;
  category?: string | null;
  exWebCus?: string | null;
  exOffCus?: string | null;
  recentMerchant?: string | null;
  area?: string | null;
  updatedMonth?: string | null;
  lastPurchaseMonth?: string | null;
  customerType?: string | null;
  whatsappAllowed?: string | null;
  allocatedTo?: string | null;
};

export type ContactAllocationContact = {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  serviceProvider: string | null;
  source: string | null;
  country: string | null;
  district: string | null;
  town: string | null;
  zone: string | null;
  area: string | null;
  gender: string | null;
  origin: string | null;
  category: string | null;
  customerType: string | null;
  exWebCustomer: boolean | null;
  exOffCustomer: boolean | null;
  whatsappAllowed: boolean | null;
  recentMerchant: string | null;
  assignedMerchant: string | null;
  lastPurchaseAt: string | null;
  updatedAt: string;
};

export type ContactAllocationAssignee = {
  id: string;
  label: string;
};

export type ContactAllocationOptions = {
  assignees: ContactAllocationAssignee[];
  serviceProviders: string[];
  districts: string[];
  towns: string[];
  origins: string[];
  categories: string[];
  customerTypes: string[];
  genders: string[];
  recentMerchants: string[];
  assignedMerchants: string[];
};

export type ContactAllocationPageData = {
  contacts: ContactAllocationContact[];
  total: number;
  options: ContactAllocationOptions;
};

type ContactAllocationDbRow = {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  serviceProvider: string | null;
  source: string | null;
  country: string | null;
  district: string | null;
  town: string | null;
  zone: string | null;
  area: string | null;
  gender: string | null;
  origin: string | null;
  category: string | null;
  customerType: string | null;
  exWebCustomer: boolean | null;
  exOffCustomer: boolean | null;
  whatsappAllowed: boolean | null;
  recentMerchant: string | null;
  assignedMerchant: string | null;
  lastPurchaseAt: Date | null;
  updatedAt: Date;
};

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "-" && trimmed !== "N/A" ? trimmed : null;
}

function monthRange(value?: string | null) {
  const month = clean(value);
  if (!month) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { start, end };
}

export function buildContactAllocationWhereSql(
  companyId: string,
  filters: ContactAllocationFilters = {}
) {
  const conditions: Prisma.Sql[] = [Prisma.sql`c."companyId" = ${companyId}`];
  const equalsFilters: Array<[keyof ContactAllocationFilters, Prisma.Sql]> = [
    ["serviceProvider", Prisma.sql`c."serviceProvider"`],
    ["district", Prisma.sql`c."district"`],
    ["town", Prisma.sql`c."town"`],
    ["gender", Prisma.sql`c."gender"`],
    ["origin", Prisma.sql`c."origin"`],
    ["category", Prisma.sql`c."category"`],
    ["customerType", Prisma.sql`c."customerType"`],
    ["recentMerchant", Prisma.sql`c."recentMerchant"`],
    ["allocatedTo", Prisma.sql`c."assignedMerchant"`],
  ];

  for (const [filterKey, column] of equalsFilters) {
    const value = clean(filters[filterKey]);
    if (value) {
      conditions.push(Prisma.sql`${column} = ${value}`);
    }
  }

  const source = clean(filters.source);
  if (source) {
    conditions.push(Prisma.sql`c."source" ILIKE ${`%${source}%`}`);
  }

  const country = clean(filters.country);
  if (country) {
    conditions.push(Prisma.sql`c."country" ILIKE ${`%${country}%`}`);
  }

  const zone = clean(filters.zone);
  if (zone) {
    conditions.push(Prisma.sql`c."zone" ILIKE ${`%${zone}%`}`);
  }

  const area = clean(filters.area);
  if (area) {
    conditions.push(Prisma.sql`c."area" ILIKE ${`%${area}%`}`);
  }

  const exWebCus = clean(filters.exWebCus);
  if (exWebCus) {
    conditions.push(Prisma.sql`c."exWebCustomer" = ${exWebCus === "YES"}`);
  }

  const exOffCus = clean(filters.exOffCus);
  if (exOffCus) {
    conditions.push(Prisma.sql`c."exOffCustomer" = ${exOffCus === "YES"}`);
  }

  const whatsappAllowed = clean(filters.whatsappAllowed);
  if (whatsappAllowed) {
    conditions.push(Prisma.sql`c."whatsappAllowed" = ${whatsappAllowed === "YES"}`);
  }

  const updatedRange = monthRange(filters.updatedMonth);
  if (updatedRange) {
    conditions.push(
      Prisma.sql`c."updatedAt" >= ${updatedRange.start} AND c."updatedAt" < ${updatedRange.end}`
    );
  }

  const purchaseRange = monthRange(filters.lastPurchaseMonth);
  if (purchaseRange) {
    conditions.push(
      Prisma.sql`c."lastPurchaseAt" >= ${purchaseRange.start} AND c."lastPurchaseAt" < ${purchaseRange.end}`
    );
  }

  return Prisma.join(conditions, " AND ");
}

function mapContact(contact: ContactAllocationDbRow): ContactAllocationContact {
  return {
    ...contact,
    lastPurchaseAt: contact.lastPurchaseAt?.toISOString() ?? null,
    updatedAt: contact.updatedAt.toISOString(),
  };
}

type DistinctTextField =
  | "gender"
  | "recentMerchant";

async function fetchDistinct(companyId: string, field: DistinctTextField) {
  const rows = await prisma.contactMaster.findMany({
    where: {
      companyId,
      [field]: { not: null },
    },
    distinct: [field],
    orderBy: { [field]: "asc" },
    select: { [field]: true },
    take: 250,
  });

  return rows
    .map((row) => row[field] as unknown as string | null)
    .filter((value): value is string => Boolean(value?.trim()));
}

async function fetchAssignedMerchantOptions(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{ assignedMerchant: string | null }>>`
    SELECT DISTINCT c."assignedMerchant"
    FROM "ContactMaster" c
    WHERE c."companyId" = ${companyId}
      AND c."assignedMerchant" IS NOT NULL
      AND c."assignedMerchant" <> ''
    ORDER BY c."assignedMerchant" ASC
    LIMIT 250
  `;
  return rows
    .map((row) => row.assignedMerchant)
    .filter((value): value is string => Boolean(value?.trim()));
}

async function fetchConfiguredAllocationOptions(companyId: string) {
  const rows = await prisma.contactAllocationOption.findMany({
    where: { companyId },
    orderBy: { value: "asc" },
    select: { type: true, value: true },
  });

  const grouped = {
    serviceProviders: [] as string[],
    districts: [] as string[],
    towns: [] as string[],
    origins: [] as string[],
    categories: [] as string[],
    customerTypes: [] as string[],
  };

  for (const row of rows) {
    if (row.type === "serviceProvider") grouped.serviceProviders.push(row.value);
    if (row.type === "district") grouped.districts.push(row.value);
    if (row.type === "town") grouped.towns.push(row.value);
    if (row.type === "origin") grouped.origins.push(row.value);
    if (row.type === "category") grouped.categories.push(row.value);
    if (row.type === "customerType") grouped.customerTypes.push(row.value);
  }

  return grouped;
}

export async function fetchContactAllocationIds(
  companyId: string,
  filters: ContactAllocationFilters = {},
  limit = 5000
) {
  const whereSql = buildContactAllocationWhereSql(companyId, filters);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c."id"
    FROM "ContactMaster" c
    WHERE ${whereSql}
    ORDER BY c."updatedAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.id);
}

export async function fetchContactAllocationPageData(
  companyId: string,
  filters: ContactAllocationFilters = {}
): Promise<ContactAllocationPageData> {
  const whereSql = buildContactAllocationWhereSql(companyId, filters);
  const [
    countRows,
    contacts,
    assigneeRows,
    configuredOptions,
    genders,
    recentMerchants,
    assignedMerchants,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "ContactMaster" c
      WHERE ${whereSql}
    `,
    prisma.$queryRaw<ContactAllocationDbRow[]>`
      SELECT
        c."id",
        c."name",
        c."phoneNumber",
        c."email",
        c."serviceProvider",
        c."source",
        c."country",
        c."district",
        c."town",
        c."zone",
        c."area",
        c."gender",
        c."origin",
        c."category",
        c."customerType",
        c."exWebCustomer",
        c."exOffCustomer",
        c."whatsappAllowed",
        c."recentMerchant",
        c."assignedMerchant",
        c."lastPurchaseAt",
        c."updatedAt"
      FROM "ContactMaster" c
      WHERE ${whereSql}
      ORDER BY c."updatedAt" DESC
      LIMIT ${PREVIEW_LIMIT}
    `,
    prisma.user.findMany({
      where: {
        companyId,
        OR: [
          { employeeProfile: null },
          { employeeProfile: { status: "active" } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, knownName: true, email: true },
      take: 300,
    }),
    fetchConfiguredAllocationOptions(companyId),
    fetchDistinct(companyId, "gender"),
    fetchDistinct(companyId, "recentMerchant"),
    fetchAssignedMerchantOptions(companyId),
  ]);

  return {
    contacts: contacts.map(mapContact),
    total: Number(countRows[0]?.count ?? 0),
    options: {
      assignees: assigneeRows.map((user) => ({
        id: user.id,
        label: user.knownName ?? user.name ?? user.email ?? "Unnamed user",
      })),
      serviceProviders: configuredOptions.serviceProviders,
      districts: configuredOptions.districts,
      towns: configuredOptions.towns,
      origins: configuredOptions.origins,
      categories: configuredOptions.categories,
      customerTypes: configuredOptions.customerTypes,
      genders,
      recentMerchants,
      assignedMerchants,
    },
  };
}
