import { readFileSync, writeFileSync } from "node:fs";

const j = JSON.parse(readFileSync("./tmp/eligible-unregistered-loyalty.json", "utf8"));

function isLikelyJunk(row) {
  const phone = String(row.phone ?? "").replace(/\D/g, "");
  const name = String(row.name ?? "").toLowerCase();
  if (/000000|12345|111111|999999/.test(phone)) return true;
  if (/for[ie]+gn|mercury|test customer|dummy/.test(name)) return true;
  if (row.lifetimeTotal > 5_000_000) return true; // extreme outliers
  return false;
}

const gold = j.rows.filter((r) => r.suggestedTier === "gold");
const platinum = j.rows.filter((r) => r.suggestedTier === "platinum");
const clean = j.rows.filter((r) => !isLikelyJunk(r));
const cleanGold = clean.filter((r) => r.suggestedTier === "gold");
const cleanPlatinum = clean.filter((r) => r.suggestedTier === "platinum");

const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const lines = [
  "name,phone,email,lifetimeTotal,suggestedTier,assignedMerchant,outreachStatus,contactId,likelyJunk",
];
for (const r of j.rows) {
  lines.push(
    [
      esc(r.name),
      esc(r.phone),
      esc(r.email),
      r.lifetimeTotal,
      r.suggestedTier,
      esc(r.assignedMerchant),
      esc(r.outreachStatus),
      esc(r.contactId),
      isLikelyJunk(r) ? "yes" : "no",
    ].join(",")
  );
}
writeFileSync("./tmp/eligible-unregistered-loyalty.csv", lines.join("\n"));

const byMerchant = new Map();
for (const r of clean) {
  const m = r.assignedMerchant?.trim() || "(unassigned)";
  byMerchant.set(m, (byMerchant.get(m) ?? 0) + 1);
}
const merchantTop = [...byMerchant.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([merchant, count]) => ({ merchant, count }));

const bands = [
  { band: "100k–150k", count: clean.filter((r) => r.lifetimeTotal < 150000).length },
  { band: "150k–250k", count: clean.filter((r) => r.lifetimeTotal >= 150000 && r.lifetimeTotal < 250000).length },
  { band: "250k–500k", count: clean.filter((r) => r.lifetimeTotal >= 250000 && r.lifetimeTotal < 500000).length },
  { band: "500k–1M", count: clean.filter((r) => r.lifetimeTotal >= 500000 && r.lifetimeTotal < 1000000).length },
  { band: "1M+", count: clean.filter((r) => r.lifetimeTotal >= 1000000).length },
];

writeFileSync(
  "./tmp/eligible-unregistered-loyalty-meta.json",
  JSON.stringify(
    {
      total: j.rows.length,
      gold: gold.length,
      platinum: platinum.length,
      junkFlagged: j.rows.length - clean.length,
      cleanTotal: clean.length,
      cleanGold: cleanGold.length,
      cleanPlatinum: cleanPlatinum.length,
      alreadyInErpLoyalty: j.alreadyInErpLoyalty,
      eligibleUnassignedOs: j.eligibleUnassignedOs,
      merchantTop,
      bands,
      cleanTop30: clean.slice(0, 30),
      allClean: clean,
      generatedAt: j.generatedAt,
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      total: j.rows.length,
      gold: gold.length,
      platinum: platinum.length,
      junkFlagged: j.rows.length - clean.length,
      cleanTotal: clean.length,
      cleanGold: cleanGold.length,
      cleanPlatinum: cleanPlatinum.length,
      merchantTop,
      bands,
    },
    null,
    2
  )
);
