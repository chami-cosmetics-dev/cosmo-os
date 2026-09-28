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
 * SKU is discontinued when every ERP that has a Product Priority says Discontinue.
 * A live priority on the other ERP keeps the SKU.
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
