export type ConfirmLine = {
  itemCode: string;
  qty: number;
  availableQty: number;
};

export type ConfirmDecision =
  | { ok: true; postLines: Array<{ itemCode: string; qty: number }> }
  | { ok: false; reason: "not_open" | "all_zero" | "short_stock"; itemCode?: string };

export function decideShopReturnConfirm(input: {
  status: string;
  lines: ConfirmLine[];
}): ConfirmDecision {
  if (input.status !== "requested") return { ok: false, reason: "not_open" };
  const positive = input.lines.filter((line) => line.qty > 0);
  if (positive.length === 0) return { ok: false, reason: "all_zero" };
  const short = positive.find((line) => line.qty > line.availableQty);
  if (short) return { ok: false, reason: "short_stock", itemCode: short.itemCode };
  return {
    ok: true,
    postLines: positive.map((line) => ({ itemCode: line.itemCode, qty: line.qty })),
  };
}
