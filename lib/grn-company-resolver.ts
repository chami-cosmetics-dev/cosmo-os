export type GrnCompanyLocationRef = {
  id: string;
  name: string;
  shortName?: string | null;
  erpnextCompany: string | null;
  supplierPrefix: string | null;
  isMainCompany?: boolean;
};

export function normalizeGrnCompanyName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function companyIdentity(value: string | null | undefined) {
  return normalizeGrnCompanyName(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((part) => part && !["trading", "lanka", "pvt", "private", "ltd", "limited"].includes(part))
    .join(" ");
}

function numericCode(value: string | null | undefined, pattern: RegExp) {
  const match = value?.trim().match(pattern);
  if (!match?.[1]) return null;
  return String(Number(match[1]));
}

function documentCompanyCode(value: string | null | undefined) {
  return numericCode(value, /^(?:PR|SSR|PI)(\d+)-/i);
}

function supplierCompanyCode(value: string | null | undefined) {
  return numericCode(value, /^OUT(\d+)/i);
}

export function buildGrnCompanyResolver(locations: GrnCompanyLocationRef[]) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const byDocumentCode = new Map<string, GrnCompanyLocationRef>();
  const byExactName = new Map<string, GrnCompanyLocationRef>();
  const identityCandidates = new Map<string, GrnCompanyLocationRef[]>();

  for (const location of locations) {
    const code = supplierCompanyCode(location.supplierPrefix);
    if (code && !byDocumentCode.has(code)) byDocumentCode.set(code, location);
    for (const value of [location.name, location.erpnextCompany]) {
      const exact = normalizeGrnCompanyName(value);
      if (exact && !byExactName.has(exact)) byExactName.set(exact, location);
      const identity = companyIdentity(value);
      if (!identity) continue;
      const candidates = identityCandidates.get(identity) ?? [];
      if (!candidates.some((candidate) => candidate.id === location.id)) candidates.push(location);
      identityCandidates.set(identity, candidates);
    }
  }

  function byName(value: string | null | undefined) {
    const exact = byExactName.get(normalizeGrnCompanyName(value));
    if (exact) return exact;
    const candidates = identityCandidates.get(companyIdentity(value)) ?? [];
    return candidates.length === 1 ? candidates[0] : null;
  }

  function resolveLocation(input: {
    documentName?: string | null;
    rawCompany?: string | null;
    companyLocationId?: string | null;
  }) {
    if (input.companyLocationId) {
      const location = byId.get(input.companyLocationId);
      if (location) return location;
    }
    const code = documentCompanyCode(input.documentName);
    if (code) {
      const location = byDocumentCode.get(code);
      if (location) return location;
    }
    return byName(input.rawCompany);
  }

  function resolveSupplierLocation(supplier: string | null | undefined, supplierName?: string | null) {
    const supplierCode = supplierCompanyCode(supplier);
    if (supplierCode) {
      const location = byDocumentCode.get(supplierCode);
      if (location) return location;
    }
    return byName(supplier) ?? byName(supplierName);
  }

  function displayName(input: {
    documentName?: string | null;
    rawCompany?: string | null;
    companyLocationId?: string | null;
    fallback?: string | null;
  }) {
    return resolveLocation(input)?.name ?? input.rawCompany?.trim() ?? input.fallback?.trim() ?? "Unknown company";
  }

  function label(companyName: string) {
    const location = byName(companyName);
    if (!location) return companyName.trim();
    if (location.shortName?.trim()) return location.shortName.trim().toUpperCase();
    if (location.isMainCompany || /^cosmetics\.lk$/i.test(location.erpnextCompany?.trim() ?? "")) return "COS";
    return location.name.trim().split(/\s+/)[0]?.toUpperCase() || location.name;
  }

  return { displayName, label, resolveLocation, resolveSupplierLocation };
}
