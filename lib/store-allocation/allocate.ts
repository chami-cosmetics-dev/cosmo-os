/**
 * Short-shipment allocation: weight = need × (1 + sales).
 * Whole-number qtys summing to takeQty; cap at need while others still need.
 */

export type AllocateLocationInput = {
  key: string;
  need: number;
  sales: number;
};

export type AllocateLocationResult = {
  key: string;
  qty: number;
};

function largestRemainder(
  takeQty: number,
  weights: Array<{ key: string; weight: number; cap: number | null }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of weights) out.set(w.key, 0);
  if (takeQty <= 0 || weights.length === 0) return out;

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  if (totalWeight <= 0) {
    // Equal split among uncapped or all keys
    const keys = weights.map((w) => w.key);
    const base = Math.floor(takeQty / keys.length);
    let rem = takeQty - base * keys.length;
    for (const key of keys) {
      let q = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      const cap = weights.find((w) => w.key === key)?.cap;
      if (cap != null) q = Math.min(q, cap);
      out.set(key, q);
    }
    // Fix sum if caps reduced total
    let sum = [...out.values()].reduce((a, b) => a + b, 0);
    if (sum < takeQty) {
      const order = [...weights].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
      let left = takeQty - sum;
      for (const w of order) {
        if (left <= 0) break;
        const cur = out.get(w.key) ?? 0;
        const room = w.cap == null ? left : Math.max(0, w.cap - cur);
        const add = Math.min(room, left);
        out.set(w.key, cur + add);
        left -= add;
      }
    }
    return out;
  }

  type Frac = { key: string; floor: number; frac: number; cap: number | null };
  const parts: Frac[] = weights.map((w) => {
    const raw = (takeQty * w.weight) / totalWeight;
    const floor = Math.floor(raw);
    return { key: w.key, floor, frac: raw - floor, cap: w.cap };
  });

  let assigned = 0;
  for (const p of parts) {
    let q = p.floor;
    if (p.cap != null) q = Math.min(q, p.cap);
    out.set(p.key, q);
    assigned += q;
  }

  let remaining = takeQty - assigned;
  const byFrac = [...parts].sort(
    (a, b) => b.frac - a.frac || a.key.localeCompare(b.key),
  );
  while (remaining > 0) {
    let progressed = false;
    for (const p of byFrac) {
      if (remaining <= 0) break;
      const cur = out.get(p.key) ?? 0;
      if (p.cap != null && cur >= p.cap) continue;
      out.set(p.key, cur + 1);
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }

  return out;
}

/**
 * Allocate takeQty across locations.
 * When any location has need > 0: weight = need * (1 + sales), cap at need.
 * When all needs are 0: sales-only weights (or equal if all sales 0), no caps.
 */
export function allocateTakeQty(
  takeQty: number,
  locations: AllocateLocationInput[],
): AllocateLocationResult[] {
  const safeTake = Number.isFinite(takeQty) ? Math.max(0, Math.floor(takeQty)) : 0;
  const normalized = locations.map((loc) => ({
    key: loc.key,
    need: Number.isFinite(loc.need) ? Math.max(0, loc.need) : 0,
    sales: Number.isFinite(loc.sales) ? Math.max(0, loc.sales) : 0,
  }));

  if (safeTake === 0 || normalized.length === 0) {
    return normalized.map((l) => ({ key: l.key, qty: 0 }));
  }

  const anyNeed = normalized.some((l) => l.need > 0);

  if (anyNeed) {
    // Multi-pass: allocate with caps, redistribute leftover while needs remain
    const remainingNeed = new Map(normalized.map((l) => [l.key, l.need]));
    const allocated = new Map(normalized.map((l) => [l.key, 0]));
    let left = safeTake;

    while (left > 0) {
      const active = normalized.filter((l) => (remainingNeed.get(l.key) ?? 0) > 0);
      if (active.length === 0) {
        // Excess above all needs: sales-only among all locations
        const excessWeights = normalized.map((l) => ({
          key: l.key,
          weight: l.sales > 0 ? l.sales : 1,
          cap: null as number | null,
        }));
        const extra = largestRemainder(left, excessWeights);
        for (const [key, qty] of extra) {
          allocated.set(key, (allocated.get(key) ?? 0) + qty);
        }
        left = 0;
        break;
      }

      const weightsFixed = active.map((l) => ({
        key: l.key,
        weight: Math.max(0, l.need) * (1 + l.sales),
        cap: remainingNeed.get(l.key) ?? 0,
      }));

      const round = largestRemainder(left, weightsFixed);
      let given = 0;
      for (const [key, qty] of round) {
        if (qty <= 0) continue;
        allocated.set(key, (allocated.get(key) ?? 0) + qty);
        remainingNeed.set(key, Math.max(0, (remainingNeed.get(key) ?? 0) - qty));
        given += qty;
      }
      if (given <= 0) break;
      left -= given;
    }

    return normalized.map((l) => ({ key: l.key, qty: allocated.get(l.key) ?? 0 }));
  }

  // All needs zero
  const salesWeights = normalized.map((l) => ({
    key: l.key,
    weight: l.sales > 0 ? l.sales : 0,
    cap: null as number | null,
  }));
  const totalSales = salesWeights.reduce((s, w) => s + w.weight, 0);
  const weights =
    totalSales > 0
      ? salesWeights
      : normalized.map((l) => ({ key: l.key, weight: 1, cap: null as number | null }));
  const result = largestRemainder(safeTake, weights);
  return normalized.map((l) => ({ key: l.key, qty: result.get(l.key) ?? 0 }));
}
