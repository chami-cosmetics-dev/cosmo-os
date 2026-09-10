export type ParsedPackSize = {
  rawNumber: number;
  baseValue: number; // in base units: ml, g, or pcs
  unit: "ml" | "g" | "pcs";
  normalized: string;
};

export type PackSizeCheckResult = {
  mismatch: boolean;
  ourSize?: string;
  competitorSize?: string;
  warning?: string;
};

/**
 * Extracts pack size / volume / weight from product titles or descriptions.
 */
export function parsePackSize(text: string | null | undefined): ParsedPackSize | null {
  if (!text) return null;
  const clean = text.toLowerCase();

  // 1. Liters (e.g. 1.5L, 1 litre, 2.5 l)
  const lMatch = clean.match(/\b(\d+(?:\.\d+)?)\s*(?:l|ltr|litres?|liters?)\b/);
  if (lMatch) {
    const rawNumber = parseFloat(lMatch[1]);
    if (rawNumber > 0) {
      const baseValue = Math.round(rawNumber * 1000);
      return { rawNumber, baseValue, unit: "ml", normalized: `${baseValue}ml` };
    }
  }

  // 2. Milliliters (e.g. 236ml, 50 ml, 100m.l.)
  const mlMatch = clean.match(/\b(\d+(?:\.\d+)?)\s*(?:ml|milliliters?|millilitres?|m\.l\.)\b/);
  if (mlMatch) {
    const rawNumber = parseFloat(mlMatch[1]);
    if (rawNumber > 0) {
      return { rawNumber, baseValue: rawNumber, unit: "ml", normalized: `${rawNumber}ml` };
    }
  }

  // 3. Kilograms (e.g. 1kg, 2.5 kg)
  const kgMatch = clean.match(/\b(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilograms?)\b/);
  if (kgMatch) {
    const rawNumber = parseFloat(kgMatch[1]);
    if (rawNumber > 0) {
      const baseValue = Math.round(rawNumber * 1000);
      return { rawNumber, baseValue, unit: "g", normalized: `${baseValue}g` };
    }
  }

  // 4. Grams (e.g. 100g, 50 gm, 250 grams)
  const gMatch = clean.match(/\b(\d+(?:\.\d+)?)\s*(?:g|gm|gms|grams?)\b/);
  if (gMatch) {
    const rawNumber = parseFloat(gMatch[1]);
    if (rawNumber > 0) {
      return { rawNumber, baseValue: rawNumber, unit: "g", normalized: `${rawNumber}g` };
    }
  }

  // 5. Count / Tablets / Capsules (e.g. 60 caps, 30 tablets, 100 pcs)
  const pcsMatch = clean.match(/\b(\d+)\s*(?:pcs|pieces?|capsules?|tablets?|caps|tabs)\b/);
  if (pcsMatch) {
    const rawNumber = parseInt(pcsMatch[1], 10);
    if (rawNumber > 0) {
      return { rawNumber, baseValue: rawNumber, unit: "pcs", normalized: `${rawNumber}pcs` };
    }
  }

  return null;
}

/**
 * Compares Cosmo product title/text against competitor title/text to flag pack size discrepancies.
 */
export function checkPackSizeMismatch(
  ourTitle: string | null | undefined,
  competitorTitle: string | null | undefined,
): PackSizeCheckResult {
  const our = parsePackSize(ourTitle);
  const comp = parsePackSize(competitorTitle);

  if (!our || !comp) {
    return {
      mismatch: false,
      ourSize: our?.normalized,
      competitorSize: comp?.normalized,
    };
  }

  if (our.unit !== comp.unit) {
    return {
      mismatch: true,
      ourSize: our.normalized,
      competitorSize: comp.normalized,
      warning: `Pack unit mismatch: Our product is in ${our.unit} (${our.normalized}), but competitor is in ${comp.unit} (${comp.normalized}).`,
    };
  }

  if (Math.abs(our.baseValue - comp.baseValue) > 0.001) {
    return {
      mismatch: true,
      ourSize: our.normalized,
      competitorSize: comp.normalized,
      warning: `Pack size mismatch: Our product is ${our.normalized}, but competitor is ${comp.normalized}.`,
    };
  }

  return {
    mismatch: false,
    ourSize: our.normalized,
    competitorSize: comp.normalized,
  };
}
