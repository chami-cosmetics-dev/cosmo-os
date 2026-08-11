/**
 * For phones in Dilhan Excel, look up ERPNext Customer.owner (creator) on ERP1+ERP2.
 * Output Excel only — does not write to Cosmo.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/export-erp-customer-creators.cjs \
 *     --file "c:\Users\Bad-Boy\Downloads\Dilhan_Doc-02.xlsx" \
 *     --out "c:\Users\Bad-Boy\Downloads\Dilhan_Doc-02-erp-creators.xlsx"
 */

const { PrismaClient } = require("@prisma/client");
const XLSX = require("xlsx");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}

function digitsOnly(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

/** ERP mobile_no style: 10 digits starting with 0 */
function toErpMobile(raw) {
  let d = digitsOnly(raw);
  if (!d) return null;
  if (d.length === 11 && d.startsWith("94")) d = d.slice(2);
  if (d.length === 12 && d.startsWith("940")) d = d.slice(3);
  if (d.length === 9) d = `0${d}`;
  if (d.length === 10 && d.startsWith("0")) return d;
  return null;
}

function phoneVariants(raw) {
  const erp = toErpMobile(raw);
  const d = digitsOnly(raw);
  const out = new Set();
  if (erp) out.add(erp);
  if (d) {
    out.add(d);
    if (d.length === 9) {
      out.add(`0${d}`);
      out.add(`94${d}`);
      out.add(`+94${d}`);
    }
    if (d.length === 10 && d.startsWith("0")) {
      out.add(d.slice(1));
      out.add(`94${d.slice(1)}`);
      out.add(`+94${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
      out.add(`+${d}`);
    }
  }
  const s = String(raw ?? "").trim();
  if (s) out.add(s);
  return [...out];
}

function authHeaders(cfg) {
  return {
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    Accept: "application/json",
  };
}

async function erpGet(cfg, path) {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}${path}`, {
    headers: authHeaders(cfg),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ERP GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function lookupCustomersByMobiles(cfg, mobiles) {
  /** @type {Map<string, object>} */
  const byMobile = new Map();
  const chunkSize = 40;
  for (let i = 0; i < mobiles.length; i += chunkSize) {
    const chunk = mobiles.slice(i, i + chunkSize);
    const filters = encodeURIComponent(JSON.stringify([["mobile_no", "in", chunk]]));
    const fields = encodeURIComponent(
      JSON.stringify([
        "name",
        "customer_name",
        "mobile_no",
        "email_id",
        "owner",
        "creation",
        "modified_by",
        "modified",
      ])
    );
    const path = `/api/resource/Customer?filters=${filters}&fields=${fields}&limit_page_length=${chunk.length}`;
    const json = await erpGet(cfg, path);
    const rows = json?.data ?? [];
    for (const row of rows) {
      const m = String(row.mobile_no || "").trim();
      if (m) byMobile.set(m, row);
    }
    if ((i / chunkSize) % 5 === 0) {
      console.log(`[erp] ${cfg.label} mobile lookup ${Math.min(i + chunkSize, mobiles.length)}/${mobiles.length}`);
    }
  }
  return byMobile;
}

async function resolveUserFullNames(cfg, usernames) {
  /** @type {Map<string, string>} */
  const map = new Map();
  const unique = [...new Set(usernames.filter(Boolean))];
  const chunkSize = 40;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const filters = encodeURIComponent(JSON.stringify([["name", "in", chunk]]));
    const fields = encodeURIComponent(JSON.stringify(["name", "full_name", "email"]));
    const path = `/api/resource/User?filters=${filters}&fields=${fields}&limit_page_length=${chunk.length}`;
    try {
      const json = await erpGet(cfg, path);
      for (const row of json?.data ?? []) {
        map.set(row.name, row.full_name || row.email || row.name);
      }
    } catch (err) {
      console.warn(`[erp] User lookup failed on ${cfg.label}:`, err instanceof Error ? err.message : err);
    }
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath =
    typeof args.file === "string"
      ? args.file
      : "c:\\Users\\Bad-Boy\\Downloads\\Dilhan_Doc-02.xlsx";
  const outPath =
    typeof args.out === "string"
      ? args.out
      : "c:\\Users\\Bad-Boy\\Downloads\\Dilhan_Doc-02-erp-creators.xlsx";

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  console.log(`[erp-creators] file=${filePath}`);

  try {
    const instances = await prisma.erpnextInstance.findMany({
      where: { companyId: COMPANY_ID },
      select: { id: true, label: true, baseUrl: true, apiKey: true, apiSecret: true },
      orderBy: { label: "asc" },
    });
    if (!instances.length) throw new Error("No ERPNext instances for company");

    const wbIn = XLSX.readFile(filePath);
    const sheet = wbIn.Sheets[wbIn.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const phones = rows
      .map((r) => r.PHONE_NUMBER ?? r.phone_number ?? r.Phone ?? r.phone)
      .filter((p) => p != null && String(p).trim() !== "")
      .map((p) => String(p).trim());

    console.log(`[erp-creators] phones=${phones.length} erpInstances=${instances.length}`);

    const allErpMobiles = [
      ...new Set(phones.map(toErpMobile).filter(Boolean)),
    ];
    console.log(`[erp-creators] unique ERP mobiles=${allErpMobiles.length}`);

    /** label -> Map(mobile -> customer) */
    const byInstance = new Map();
    /** label -> Map(username -> fullName) */
    const userNamesByInstance = new Map();

    for (const inst of instances) {
      const cfg = {
        label: inst.label,
        baseUrl: inst.baseUrl,
        apiKey: inst.apiKey,
        apiSecret: inst.apiSecret,
      };
      console.log(`[erp-creators] querying ${inst.label} …`);
      const found = await lookupCustomersByMobiles(cfg, allErpMobiles);
      byInstance.set(inst.label, found);
      const owners = [...found.values()].map((c) => c.owner).filter(Boolean);
      const names = await resolveUserFullNames(cfg, owners);
      userNamesByInstance.set(inst.label, names);
      console.log(`[erp-creators] ${inst.label} matched customers=${found.size}`);
    }

    const outRows = [];
    let foundAny = 0;
    let notFound = 0;

    for (const phone of phones) {
      const erpMobile = toErpMobile(phone);
      const variants = phoneVariants(phone);
      let hit = null;
      let hitLabel = null;

      for (const [label, map] of byInstance.entries()) {
        for (const v of variants) {
          if (map.has(v)) {
            hit = map.get(v);
            hitLabel = label;
            break;
          }
        }
        if (hit) break;
        if (erpMobile && map.has(erpMobile)) {
          hit = map.get(erpMobile);
          hitLabel = label;
          break;
        }
      }

      if (!hit) {
        notFound += 1;
        outRows.push({
          PHONE_NUMBER: phone,
          ERP_MOBILE: erpMobile,
          FOUND_IN_ERP: "no",
          ERP_INSTANCE: null,
          CUSTOMER_ID: null,
          CUSTOMER_NAME: null,
          CREATED_BY_USER: null,
          CREATED_BY_NAME: null,
          CREATED_AT: null,
          MODIFIED_BY: null,
          MODIFIED_AT: null,
        });
        continue;
      }

      foundAny += 1;
      const nameMap = userNamesByInstance.get(hitLabel) || new Map();
      outRows.push({
        PHONE_NUMBER: phone,
        ERP_MOBILE: hit.mobile_no || erpMobile,
        FOUND_IN_ERP: "yes",
        ERP_INSTANCE: hitLabel,
        CUSTOMER_ID: hit.name || null,
        CUSTOMER_NAME: hit.customer_name || null,
        CREATED_BY_USER: hit.owner || null,
        CREATED_BY_NAME: hit.owner ? nameMap.get(hit.owner) || hit.owner : null,
        CREATED_AT: hit.creation || null,
        MODIFIED_BY: hit.modified_by || null,
        MODIFIED_AT: hit.modified || null,
      });
    }

    const wbOut = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(outRows), "ERP Creators");

    // summary sheet: creators ranked
    const creatorCounts = new Map();
    for (const row of outRows) {
      if (row.FOUND_IN_ERP !== "yes") continue;
      const key = `${row.CREATED_BY_NAME || row.CREATED_BY_USER || "(unknown)"}|${row.ERP_INSTANCE || ""}`;
      creatorCounts.set(key, (creatorCounts.get(key) || 0) + 1);
    }
    const summary = [...creatorCounts.entries()]
      .map(([k, count]) => {
        const [name, inst] = k.split("|");
        return { CREATED_BY_NAME: name, ERP_INSTANCE: inst, COUNT: count };
      })
      .sort((a, b) => b.COUNT - a.COUNT);
    XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(summary), "By Creator");

    XLSX.writeFile(wbOut, outPath);

    console.log(
      JSON.stringify(
        {
          phones: phones.length,
          foundInErp: foundAny,
          notFoundInErp: notFound,
          outPath,
          topCreators: summary.slice(0, 15),
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
