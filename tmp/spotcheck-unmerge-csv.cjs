/** Spot-check tmp/unmerge-phone-plan.csv — no DB. */
const fs = require("fs");
const path = require("path");

const csvPath = path.join(__dirname, "unmerge-phone-plan.csv");
const lines = fs.readFileSync(csvPath, "utf8").trim().split(/\n/);

function parse(line) {
  const parts = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

const rows = lines.slice(1).map(parse).map((p) => ({
  action: p[0],
  parentId: p[1],
  parent: p[2],
  primary: p[3],
  secondary: p[4],
  reason: p[6],
  newName: p[7],
  otherId: p[9],
  cands: p[10],
  refs: p[11],
}));

const byAction = {};
const byReason = {};
for (const r of rows) {
  byAction[r.action] = (byAction[r.action] || 0) + 1;
  byReason[r.reason] = (byReason[r.reason] || 0) + 1;
}

function summarize(label, list) {
  const actions = {};
  for (const r of list) actions[r.action] = (actions[r.action] || 0) + 1;
  return {
    label,
    n: list.length,
    actions,
    sample: list.slice(0, 10).map((r) => ({
      action: r.action,
      secondary: r.secondary,
      reason: r.reason,
      cands: r.cands,
      newName: r.newName,
      otherId: r.otherId || null,
    })),
  };
}

const hansanie = rows.filter(
  (r) => /hansanie/i.test(r.parent) || r.primary === "0717384963"
);
const kaushalya = rows.filter((r) => /kaushalya caldera/i.test(r.parent));
const dahamdi = rows.filter((r) => /^Dahamdi$/i.test(r.parent));

console.log(
  JSON.stringify(
    {
      totalRows: rows.length,
      byAction,
      byReason,
      hansanie: summarize("Hansanie", hansanie),
      kaushalya: summarize("Kaushalya", kaushalya),
      dahamdi: summarize("Dahamdi", dahamdi),
      keptSamples: rows
        .filter((r) => r.action === "keep")
        .slice(0, 8)
        .map((r) => ({
          parent: r.parent,
          secondary: r.secondary,
          cands: r.cands,
          refs: r.refs,
        })),
      splitWithOrders: rows.filter(
        (r) => r.action === "split_create" && r.reason === "name_not_connected"
      ).length,
      splitNoOrders: rows.filter(
        (r) => r.action === "split_create" && r.reason === "no_orders_no_connection"
      ).length,
    },
    null,
    2
  )
);
