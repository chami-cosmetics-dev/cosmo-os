import type { Prisma } from "@prisma/client";

/** ERP Product Priority value that marks a discontinued item. */
export const OSF_DISCONTINUE_PRIORITY = "Discontinue";

function priorityText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function isDiscontinueErpPriority(value: string | null | undefined): boolean {
  return priorityText(value).toLowerCase() === OSF_DISCONTINUE_PRIORITY.toLowerCase();
}

function isDiscontinuePriority(value: string): boolean {
  return isDiscontinueErpPriority(value);
}

/**
 * SKU is discontinued for Cosmo OS OSF when every ERP that has a Product Priority
 * says Discontinue. A live priority on the other ERP keeps the SKU.
 * If both priorities are blank, fall back to item status category DISCONTINUE.
 */
export function isDiscontinuedForOsf(input: {
  erp1ProductPriority?: string | null;
  erp2ProductPriority?: string | null;
  itemStatusCategory?: string | null;
}): boolean {
  const priorities = [input.erp1ProductPriority, input.erp2ProductPriority]
    .map(priorityText)
    .filter(Boolean);
  if (priorities.length > 0) {
    return priorities.every(isDiscontinuePriority);
  }
  return (input.itemStatusCategory ?? "").trim() === "DISCONTINUE";
}

function blankPriority(
  field: "erp1ProductPriority" | "erp2ProductPriority",
): Prisma.ProductItemWhereInput {
  return { OR: [{ [field]: null }, { [field]: "" }] };
}

const discontinueEquals = {
  equals: OSF_DISCONTINUE_PRIORITY,
  mode: "insensitive" as const,
};

/** Match rows `isDiscontinuedForOsf` treats as discontinued (trimmed DB values). */
export function discontinuedProductItemWhere(): Prisma.ProductItemWhereInput {
  return {
    OR: [
      {
        AND: [
          { erp1ProductPriority: discontinueEquals },
          { erp2ProductPriority: discontinueEquals },
        ],
      },
      {
        AND: [
          { erp1ProductPriority: discontinueEquals },
          blankPriority("erp2ProductPriority"),
        ],
      },
      {
        AND: [
          { erp2ProductPriority: discontinueEquals },
          blankPriority("erp1ProductPriority"),
        ],
      },
      {
        AND: [
          blankPriority("erp1ProductPriority"),
          blankPriority("erp2ProductPriority"),
          { itemStatusCategory: "DISCONTINUE" },
        ],
      },
    ],
  };
}

export function osfExcludeDiscontinuedWhere(): Prisma.ProductItemWhereInput {
  return { NOT: discontinuedProductItemWhere() };
}
