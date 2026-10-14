import { readFileSync } from "node:fs";

import { importSupplementPurchases } from "../lib/vault-supplement-import/import-run";

const companyId = "cmp5k145c006irlhemjfidlb5";
const files = [
  "C:/Users/Bad-Boy/Downloads/Supplement sales history for VOS - 13.10.2026 (1).xlsx",
  "C:/Users/Bad-Boy/Downloads/Origins trading Sales history for VOS -13.10.2026 (1).xlsx",
  "C:/Users/Bad-Boy/Downloads/AE Sale history for VOS-13.10.2026.xlsx",
];

for (const file of files) {
  const started = Date.now();
  console.log(`START ${file}`);
  const summary = await importSupplementPurchases({
    companyId,
    file: readFileSync(file),
  });
  const reasons = new Map<string, number>();
  for (const row of summary.rejected) {
    reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
  }
  console.log(
    JSON.stringify(
      {
        file: file.split("/").pop(),
        seconds: Math.round((Date.now() - started) / 1000),
        rowsRead: summary.rowsRead,
        rowsAccepted: summary.rowsAccepted,
        rowsRejected: summary.rowsRejected,
        contactsCreated: summary.contactsCreated,
        contactsMatched: summary.contactsMatched,
        purchaseLinesAdded: summary.purchaseLinesAdded,
        purchaseLinesUpdated: summary.purchaseLinesUpdated,
        reasons: Object.fromEntries(reasons),
        sampleRejected: summary.rejected.slice(0, 12),
      },
      null,
      2,
    ),
  );
}
