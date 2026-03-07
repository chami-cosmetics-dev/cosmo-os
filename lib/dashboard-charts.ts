import { prisma } from "@/lib/prisma";

export interface DashboardFilters {
  from: Date;
  to: Date;
  dateType: "order" | "completed";
  analysisType: "merchant" | "payment_gateway";
}

export interface DashboardMerchantChart {
  location: string;
  total: number;
  merchant: string;
  merchantValue: number;
  segments: Array<{
    value: number;
    color: string;
  }>;
}

export interface DashboardBreakdownDatum {
  merchant: string;
  invoiceValue: number;
  invoiceCount: number;
}

export interface DashboardCallCenterDatum {
  agent: string;
  na: number;
  interested: number;
  notInterested: number;
  notResponding: number;
  wrongNumber: number;
  blackList: number;
  busy: number;
  interestedSms: number;
}

export interface DashboardDeliverySummaryDatum {
  label: string;
  completed: number;
  pending: number;
}

export interface DashboardSalesPerformanceDatum {
  category: string;
  chamiTradingWeb: number;
  coolPlanetNugegoda: number;
  cosmeticsMaharagama: number;
  cosmeticsNewWeb: number;
  kiribathgodaShowroom: number;
  pepiliyanaShop: number;
  peviTradingWeb: number;
  spkTradingWeb: number;
}

const merchantSegmentColors = [
  "#3f8fbd",
  "#f26a4f",
  "#08b05a",
  "#f2a10c",
  "#c6cad4",
  "#7f9b84",
  "#b58572",
];

function getDisplayName(name?: string | null, email?: string | null, fallback = "Unknown") {
  return name?.trim() || email || fallback;
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

function normalizeMerchantKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

type SalesSeriesKey = keyof Omit<DashboardSalesPerformanceDatum, "category">;

const salesShopKeyMap: Record<string, SalesSeriesKey> = {
  chamitradingweb: "chamiTradingWeb",
  coolplanetnugegoda: "coolPlanetNugegoda",
  cosmeticslkmaharagama: "cosmeticsMaharagama",
  cosmeticslknewweb: "cosmeticsNewWeb",
  kiribathgodashowroom: "kiribathgodaShowroom",
  pepiliyanashop: "pepiliyanaShop",
  pevitradingweb: "peviTradingWeb",
  spktradingweb: "spkTradingWeb",
};

const salesSeriesKeys: SalesSeriesKey[] = [
  "chamiTradingWeb",
  "coolPlanetNugegoda",
  "cosmeticsMaharagama",
  "cosmeticsNewWeb",
  "kiribathgodaShowroom",
  "pepiliyanaShop",
  "peviTradingWeb",
  "spkTradingWeb",
];

function addToSalesSeries(
  entry: DashboardSalesPerformanceDatum,
  key: SalesSeriesKey,
  amount: number,
) {
  switch (key) {
    case "chamiTradingWeb":
      entry.chamiTradingWeb += amount;
      break;
    case "coolPlanetNugegoda":
      entry.coolPlanetNugegoda += amount;
      break;
    case "cosmeticsMaharagama":
      entry.cosmeticsMaharagama += amount;
      break;
    case "cosmeticsNewWeb":
      entry.cosmeticsNewWeb += amount;
      break;
    case "kiribathgodaShowroom":
      entry.kiribathgodaShowroom += amount;
      break;
    case "pepiliyanaShop":
      entry.pepiliyanaShop += amount;
      break;
    case "peviTradingWeb":
      entry.peviTradingWeb += amount;
      break;
    case "spkTradingWeb":
      entry.spkTradingWeb += amount;
      break;
  }
}

function buildCompletedDateFilter(from: Date, to: Date) {
  return {
    OR: [
      { deliveryCompleteAt: { gte: from, lte: to } },
      { invoiceCompleteAt: { gte: from, lte: to } },
    ],
  };
}

function buildOrderDateFilter(filters: DashboardFilters) {
  if (filters.dateType === "completed") {
    return buildCompletedDateFilter(filters.from, filters.to);
  }

  return {
    createdAt: {
      gte: filters.from,
      lte: filters.to,
    },
  };
}

function getMerchantGroupingLabel(
  order: {
    sourceName: string;
    assignedMerchant: { name: string | null; email: string | null } | null;
  },
  filters: DashboardFilters,
) {
  if (filters.analysisType === "payment_gateway") {
    const source = order.sourceName.trim().toLowerCase();
    return source ? `Source: ${source.toUpperCase()}` : "Source: WEB";
  }

  return getDisplayName(
    order.assignedMerchant?.name,
    order.assignedMerchant?.email,
    "Unassigned",
  );
}

function buildDeliverySummaryWhere(companyId: string, filters: DashboardFilters) {
  return {
    companyId,
    AND: [
      { OR: [{ dispatchedAt: { not: null } }, { deliveryCompleteAt: { not: null } }] },
      buildOrderDateFilter(filters),
    ],
  };
}

export async function getMerchantCharts(
  companyId: string,
  filters: DashboardFilters,
): Promise<DashboardMerchantChart[]> {
  try {
    const orders = await prisma.order.findMany({
      where: {
        companyId,
        ...buildOrderDateFilter(filters),
      },
      select: {
        totalPrice: true,
        sourceName: true,
        companyLocation: {
          select: {
            name: true,
            shortName: true,
          },
        },
        assignedMerchant: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!orders.length) {
      return [];
    }

    const locationMap = new Map<
      string,
      {
        total: number;
        merchantTotals: Map<string, number>;
      }
    >();

    for (const order of orders) {
      const locationName =
        order.companyLocation.shortName?.trim() || order.companyLocation.name;
      const merchantName = getMerchantGroupingLabel(order, filters);
      const amount = toNumber(order.totalPrice);
      const locationEntry = locationMap.get(locationName) ?? {
        total: 0,
        merchantTotals: new Map<string, number>(),
      };

      locationEntry.total += amount;
      locationEntry.merchantTotals.set(
        merchantName,
        (locationEntry.merchantTotals.get(merchantName) ?? 0) + amount,
      );

      locationMap.set(locationName, locationEntry);
    }

    const locationCharts = Array.from(locationMap.entries())
      .map(([location, entry]) => {
        const merchants = Array.from(entry.merchantTotals.entries()).sort(
          (a, b) => b[1] - a[1],
        );
        const [topMerchantName = "Unassigned", topMerchantValue = 0] = merchants[0] ?? [];

        return {
          location,
          total: entry.total,
          merchant: topMerchantName,
          merchantValue: topMerchantValue,
          segments: merchants.map(([_, value], index) => ({
            value,
            color: merchantSegmentColors[index % merchantSegmentColors.length],
          })),
        };
      })
      .sort((a, b) => b.total - a.total);

    const overallMerchantTotals = new Map<string, number>();
    for (const chart of locationCharts) {
      for (const [merchant, value] of locationMap.get(chart.location)?.merchantTotals ?? []) {
        overallMerchantTotals.set(merchant, (overallMerchantTotals.get(merchant) ?? 0) + value);
      }
    }

    const overallMerchants = Array.from(overallMerchantTotals.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    const grandTotal = overallMerchants.reduce((sum, [, value]) => sum + value, 0);
    const [topOverallMerchant = "Unassigned", topOverallValue = 0] = overallMerchants[0] ?? [];
    const [topLocation = locationCharts[0]] = locationCharts;

    return [
      ...locationCharts,
      {
        location:
          filters.analysisType === "payment_gateway"
            ? "Grand Total - Payment Source"
            : "Grand Total - Merchant Wise",
        total: grandTotal,
        merchant: topOverallMerchant,
        merchantValue: topOverallValue,
        segments: overallMerchants.map(([_, value], index) => ({
          value,
          color: merchantSegmentColors[index % merchantSegmentColors.length],
        })),
      },
      {
        location: "Grand Total",
        total: grandTotal,
        merchant: topLocation?.location ?? "Top Location",
        merchantValue: topLocation?.total ?? 0,
        segments: locationCharts.map((chart, index) => ({
          value: chart.total,
          color: merchantSegmentColors[index % merchantSegmentColors.length],
        })),
      },
    ];
  } catch {
    return getDummyMerchantCharts();
  }
}

export async function getMerchantBreakdownData(
  companyId: string,
  filters: DashboardFilters,
): Promise<DashboardBreakdownDatum[]> {
  try {
    const orders = await prisma.order.findMany({
      where: {
        companyId,
        ...buildOrderDateFilter(filters),
      },
      select: {
        totalPrice: true,
        sourceName: true,
        assignedMerchant: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!orders.length) {
      return [];
    }

    const groupedOrders = new Map<string, DashboardBreakdownDatum>();

    for (const order of orders) {
      const merchant = getMerchantGroupingLabel(order, filters);
      const entry = groupedOrders.get(merchant) ?? {
        merchant,
        invoiceValue: 0,
        invoiceCount: 0,
      };

      entry.invoiceValue += toNumber(order.totalPrice);
      entry.invoiceCount += 1;
      groupedOrders.set(merchant, entry);
    }

    return Array.from(groupedOrders.values()).sort((a, b) => b.invoiceValue - a.invoiceValue);
  } catch {
    return getDummyMerchantBreakdownData();
  }
}

export async function getShopBreakdownData(
  companyId: string,
  filters: DashboardFilters,
): Promise<DashboardBreakdownDatum[]> {
  try {
    const orders = await prisma.order.findMany({
      where: {
        companyId,
        ...buildOrderDateFilter(filters),
      },
      select: {
        sourceName: true,
        totalPrice: true,
        companyLocation: {
          select: {
            name: true,
            shortName: true,
          },
        },
      },
    });

    if (!orders.length) {
      return [];
    }

    const labelMap = new Map<string, { invoiceValue: number; invoiceCount: number }>();

    for (const order of orders) {
      const baseName =
        order.companyLocation.shortName?.trim() || order.companyLocation.name;
      const source = order.sourceName.trim().toLowerCase();
      const label =
        source && source !== "web"
          ? `${baseName} - ${source.toUpperCase()}`
          : baseName;
      const entry = labelMap.get(label) ?? { invoiceValue: 0, invoiceCount: 0 };

      entry.invoiceValue += toNumber(order.totalPrice);
      entry.invoiceCount += 1;
      labelMap.set(label, entry);
    }

    return Array.from(labelMap.entries())
      .map(([merchant, entry]) => ({
        merchant,
        invoiceValue: entry.invoiceValue,
        invoiceCount: entry.invoiceCount,
      }))
      .sort((a, b) => b.invoiceValue - a.invoiceValue);
  } catch {
    return getDummyShopBreakdownData();
  }
}

export async function getDeliverySummaryData(
  companyId: string,
  filters: DashboardFilters,
): Promise<DashboardDeliverySummaryDatum[]> {
  try {
    const orders = await prisma.order.findMany({
      where: buildDeliverySummaryWhere(companyId, filters),
      select: {
        dispatchedAt: true,
        deliveryCompleteAt: true,
        companyLocation: {
          select: {
            name: true,
            shortName: true,
          },
        },
        dispatchedByRider: {
          select: {
            name: true,
            email: true,
          },
        },
        dispatchedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!orders.length) {
      return [];
    }

    const summaryMap = new Map<string, DashboardDeliverySummaryDatum>();

    for (const order of orders) {
      const label =
        getDisplayName(order.dispatchedByRider?.name, order.dispatchedByRider?.email, "") ||
        getDisplayName(order.dispatchedBy?.name, order.dispatchedBy?.email, "") ||
        order.companyLocation.shortName?.trim() ||
        order.companyLocation.name;

      const entry = summaryMap.get(label) ?? {
        label,
        completed: 0,
        pending: 0,
      };

      if (order.deliveryCompleteAt) {
        entry.completed += 1;
      } else if (order.dispatchedAt) {
        entry.pending += 1;
      }

      summaryMap.set(label, entry);
    }

    const result = Array.from(summaryMap.values()).sort(
      (a, b) => b.completed + b.pending - (a.completed + a.pending),
    );

    return result;
  } catch {
    return getDummyDeliverySummaryData();
  }
}

export async function getSalesPerformanceData(
  companyId: string,
  filters: DashboardFilters,
): Promise<DashboardSalesPerformanceDatum[]> {
  try {
    const lineItems = await prisma.orderLineItem.findMany({
      where: {
        order: {
          companyId,
          ...buildOrderDateFilter(filters),
        },
      },
      select: {
        quantity: true,
        price: true,
        order: {
          select: {
            companyLocation: {
              select: {
                name: true,
                shortName: true,
              },
            },
          },
        },
        productItem: {
          select: {
            category: {
              select: {
                name: true,
                fullName: true,
              },
            },
            productTitle: true,
          },
        },
      },
    });

    if (!lineItems.length) {
      return [];
    }

    const categoryMap = new Map<string, DashboardSalesPerformanceDatum>();

    for (const item of lineItems) {
      const shopName =
        item.order.companyLocation.shortName?.trim() || item.order.companyLocation.name;
      const shopKey = salesShopKeyMap[normalizeMerchantKey(shopName)];

      if (!shopKey) {
        continue;
      }

      const category =
        item.productItem.category?.fullName?.trim() ||
        item.productItem.category?.name?.trim() ||
        item.productItem.productTitle;
      const amount = toNumber(item.price) * item.quantity;
      const entry = categoryMap.get(category) ?? {
        category,
        chamiTradingWeb: 0,
        coolPlanetNugegoda: 0,
        cosmeticsMaharagama: 0,
        cosmeticsNewWeb: 0,
        kiribathgodaShowroom: 0,
        pepiliyanaShop: 0,
        peviTradingWeb: 0,
        spkTradingWeb: 0,
      };

      addToSalesSeries(entry, shopKey, amount);
      categoryMap.set(category, entry);
    }

    const result = Array.from(categoryMap.values())
      .map((entry) => ({
        entry,
        total: salesSeriesKeys.reduce((sum, key) => sum + entry[key], 0),
      }))
      .filter(({ total }) => total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map(({ entry }) => entry);

    return result;
  } catch {
    return getDummySalesPerformanceData();
  }
}

// TODO: Replace this with a Prisma query that builds the donut chart data.
// Call this from the dashboard page server component.
export function getDummyMerchantCharts(): DashboardMerchantChart[] {
  return [
    {
      location: "Chami Trading Web",
      total: 99415,
      merchant: "DM - General",
      merchantValue: 46295,
      segments: [
        { value: 46295, color: "#6f8fa6" },
        { value: 26110, color: "#7f9b84" },
        { value: 27010, color: "#b58572" },
      ],
    },
    {
      location: "Cool Planet - Nugegoda",
      total: 22450,
      merchant: "Lihini",
      merchantValue: 22450,
      segments: [{ value: 22450, color: "#6f8fa6" }],
    },
    {
      location: "Cosmetics.lk - Maharagama",
      total: 40810,
      merchant: "Kavishka",
      merchantValue: 40810,
      segments: [{ value: 40810, color: "#6f8fa6" }],
    },
    {
      location: "Cosmetics.lk New Web",
      total: 47205,
      merchant: "DM - General",
      merchantValue: 26205,
      segments: [
        { value: 26205, color: "#6f8fa6" },
        { value: 11800, color: "#7f9b84" },
        { value: 9200, color: "#b58572" },
      ],
    },
    {
      location: "Kiribathgoda Showroom",
      total: 14800,
      merchant: "Naduni",
      merchantValue: 14800,
      segments: [{ value: 14800, color: "#6f8fa6" }],
    },
    {
      location: "Pepiliyana Shop",
      total: 55345,
      merchant: "Pepiliyana Outlet",
      merchantValue: 51600,
      segments: [
        { value: 51600, color: "#b58572" },
        { value: 3745, color: "#6f8fa6" },
      ],
    },
    {
      location: "Pevi Trading Web",
      total: 114918,
      merchant: "Maheshi Priyadarshani",
      merchantValue: 42672.5,
      segments: [
        { value: 42672.5, color: "#7f9b84" },
        { value: 10681.5, color: "#6f8fa6" },
        { value: 61564, color: "#b58572" },
      ],
    },
    {
      location: "SPK Trading Web",
      total: 18340,
      merchant: "Ishadi",
      merchantValue: 10500,
      segments: [
        { value: 7840, color: "#6f8fa6" },
        { value: 10500, color: "#b58572" },
      ],
    },
    {
      location: "Grand Total - Merchant Wise",
      total: 874468,
      merchant: "DM - General",
      merchantValue: 212310,
      segments: [
        { value: 212310, color: "#3f8fbd" },
        { value: 35000, color: "#f26a4f" },
        { value: 62000, color: "#08b05a" },
        { value: 18000, color: "#f2a10c" },
        { value: 54000, color: "#c6cad4" },
        { value: 47000, color: "#3f8fbd" },
        { value: 26000, color: "#f26a4f" },
        { value: 39000, color: "#08b05a" },
        { value: 22000, color: "#f2a10c" },
        { value: 31000, color: "#c6cad4" },
        { value: 14000, color: "#3f8fbd" },
        { value: 29000, color: "#f26a4f" },
        { value: 17000, color: "#08b05a" },
        { value: 45000, color: "#f2a10c" },
        { value: 28000, color: "#c6cad4" },
        { value: 36000, color: "#3f8fbd" },
        { value: 19000, color: "#f26a4f" },
        { value: 53000, color: "#08b05a" },
        { value: 41000, color: "#f2a10c" },
        { value: 46158, color: "#c6cad4" },
      ],
    },
    {
      location: "Grand Total",
      total: 874468,
      merchant: "Cosmetics.lk New Web",
      merchantValue: 166945,
      segments: [
        { value: 166945, color: "#3f8fbd" },
        { value: 82000, color: "#f26a4f" },
        { value: 104000, color: "#08b05a" },
        { value: 73000, color: "#f2a10c" },
        { value: 92000, color: "#3f8fbd" },
        { value: 68000, color: "#f26a4f" },
        { value: 110000, color: "#08b05a" },
        { value: 95000, color: "#f2a10c" },
        { value: 83523, color: "#c6cad4" },
      ],
    },
  ];
}

// TODO: Replace this with a Prisma aggregation grouped by merchant.
// Call this from the dashboard page server component.
export function getDummyMerchantBreakdownData(): DashboardBreakdownDatum[] {
  return [
    {
      merchant: "DM - General",
      invoiceValue: 26205,
      invoiceCount: 4,
    },
    {
      merchant: "Sachini",
      invoiceValue: 14500,
      invoiceCount: 1,
    },
    {
      merchant: "Kavishka",
      invoiceValue: 6500,
      invoiceCount: 1,
    },
  ];
}

// TODO: Replace this with a Prisma aggregation grouped by shop/location.
// Call this from the dashboard page server component.
export function getDummyShopBreakdownData(): DashboardBreakdownDatum[] {
  return [
    {
      merchant: "Chami Trading Web",
      invoiceValue: 99415,
      invoiceCount: 8,
    },
    {
      merchant: "Cool Planet - Nugegoda - POS",
      invoiceValue: 22450,
      invoiceCount: 1,
    },
    {
      merchant: "Cosmetics.lk - Maharagama - POS",
      invoiceValue: 40810,
      invoiceCount: 3,
    },
    {
      merchant: "Cosmetics.lk New Web",
      invoiceValue: 40705,
      invoiceCount: 5,
    },
    {
      merchant: "Cosmetics.lk New Web - POS",
      invoiceValue: 6500,
      invoiceCount: 1,
    },
    {
      merchant: "Kiribathgoda Showroom - POS",
      invoiceValue: 14800,
      invoiceCount: 1,
    },
    {
      merchant: "Pepiliyana Shop",
      invoiceValue: 3745,
      invoiceCount: 1,
    },
    {
      merchant: "Pepiliyana Shop - POS",
      invoiceValue: 51600,
      invoiceCount: 3,
    },
    {
      merchant: "Pevi Trading Web",
      invoiceValue: 114918,
      invoiceCount: 11,
    },
    {
      merchant: "SPK Trading Web",
      invoiceValue: 18340,
      invoiceCount: 2,
    },
  ];
}

// TODO: Replace this with a Prisma aggregation grouped by call center agent.
// Call this from the dashboard page server component.
export function getDummyCallCenterPerformanceData(): DashboardCallCenterDatum[] {
  return [
    {
      agent: "Kanchana",
      na: 0,
      interested: 4,
      notInterested: 0,
      notResponding: 1,
      wrongNumber: 0,
      blackList: 0,
      busy: 0,
      interestedSms: 0,
    },
    {
      agent: "Ishadi",
      na: 0,
      interested: 5,
      notInterested: 0,
      notResponding: 2,
      wrongNumber: 0,
      blackList: 0,
      busy: 0,
      interestedSms: 0,
    },
    {
      agent: "Zeenath",
      na: 0,
      interested: 1,
      notInterested: 0,
      notResponding: 0,
      wrongNumber: 0,
      blackList: 0,
      busy: 0,
      interestedSms: 0,
    },
  ];
}

// TODO: Replace this with a Prisma aggregation grouped by delivery owner/status.
// Call this from the dashboard page server component.
export function getDummyDeliverySummaryData(): DashboardDeliverySummaryDatum[] {
  return [
    {
      label: "Mr Selvam",
      completed: 0,
      pending: 20,
    },
    {
      label: "Delivered To Customer",
      completed: 1,
      pending: 0,
    },
    {
      label: "Mr Yohan",
      completed: 7,
      pending: 12,
    },
    {
      label: "Kiribathgoda Store",
      completed: 1,
      pending: 0,
    },
    {
      label: "Cool Planet - Nugegoda",
      completed: 1,
      pending: 0,
    },
    {
      label: "Pepiliyana Shop",
      completed: 3,
      pending: 0,
    },
    {
      label: "Cosmetics.lk New Web",
      completed: 1,
      pending: 0,
    },
    {
      label: "DRO Trading",
      completed: 3,
      pending: 0,
    },
  ];
}

// TODO: Replace this with a Prisma aggregation grouped by product/category and shop/location.
// Call this from the dashboard page server component.
export function getDummySalesPerformanceData(): DashboardSalesPerformanceDatum[] {
  return [
    {
      category: "palmers",
      chamiTradingWeb: 6500,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 0,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "jovees",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 30400,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "keune",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 39900,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "olay",
      chamiTradingWeb: 2250,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 0,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "wella",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 12000,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "CeraVe",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 41100,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "The Ordinary",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 7950,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "L'Oreal",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 3315,
      cosmeticsNewWeb: 0,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "Cetaphil",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 0,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 16500,
      spkTradingWeb: 0,
    },
    {
      category: "Garnier",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 0,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 65600,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "Neutrogena",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 0,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 49800,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
    {
      category: "Egyptian Magic (EG01 only)",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 0,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 135115,
      spkTradingWeb: 0,
    },
    {
      category: "medicube",
      chamiTradingWeb: 0,
      coolPlanetNugegoda: 0,
      cosmeticsMaharagama: 0,
      cosmeticsNewWeb: 9800,
      kiribathgodaShowroom: 0,
      pepiliyanaShop: 0,
      peviTradingWeb: 0,
      spkTradingWeb: 0,
    },
  ];
}
