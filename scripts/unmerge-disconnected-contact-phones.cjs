/**
 * Unmerge Previous phones that have no Cosmo order name connection to the primary contact.
 * Connected = any order customerName under the secondary phone is close to ContactMaster.name
 * or to names on orders under the primary phone. Otherwise detach and create a separate contact.
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/unmerge-disconnected-contact-phones.cjs \
 *     --company-id <cuid> --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/unmerge-disconnected-contact-phones.cjs \
 *     --company-id <cuid> --apply
 *   Optional: --limit N
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const MOBILE_MAX = 100;
const NAME_MAX = 100;

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

function phoneDigitsOnly(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  return d;
}

function normalizePhone(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.slice(0, MOBILE_MAX) : null;
}

/** Mirror of lib/phone-lookup.ts buildPhoneLookupVariants */
function buildPhoneLookupVariants(raw) {
  const t = String(raw || "").trim();
  const d = phoneDigitsOnly(raw);
  const out = new Set();
  if (t) out.add(t);
  if (d) {
    out.add(d);
    if (d.length === 9) {
      out.add(`0${d}`);
      out.add(`94${d}`);
    }
    if (d.length === 10 && d.startsWith("0")) {
      out.add(d.slice(1));
      out.add(`94${d.slice(1)}`);
      out.add(`940${d.slice(1)}`);
    }
    if (d.length === 11 && d.startsWith("94")) {
      out.add(`0${d.slice(2)}`);
      out.add(d.slice(2));
    }
    if (d.length === 12 && d.startsWith("94") && d[2] === "0") {
      const local = d.slice(2);
      out.add(local);
      out.add(local.slice(1));
      out.add(`94${local.slice(1)}`);
    }
  }
  for (const variant of [...out]) {
    const digits = phoneDigitsOnly(variant);
    if (!digits) continue;
    out.add(`+${digits}`);
    if (digits.startsWith("94") && digits.length >= 11) {
      out.add(`+${digits}`);
      out.add(`00${digits}`);
    } else if (digits.length === 10 && digits.startsWith("0")) {
      out.add(`+94${digits.slice(1)}`);
      out.add(`94${digits.slice(1)}`);
    } else if (digits.length === 9) {
      out.add(`+94${digits}`);
      out.add(`94${digits}`);
      out.add(`0${digits}`);
    }
  }
  return [...out].filter((s) => s.length > 0 && s.length <= MOBILE_MAX);
}

function phonesCompatible(left, right) {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  if (!a || !b) return false;
  const leftVariants = new Set(buildPhoneLookupVariants(a));
  return buildPhoneLookupVariants(b).some((v) => leftVariants.has(v));
}

function canonicalizePersonName(value) {
  let s = String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^(ms|mrs|miss|mr|dr|prof)\s+/i, "").trim();
  return s;
}

function nameTokens(canonical) {
  return canonical.split(" ").filter(Boolean);
}

function namesClose(a, b) {
  const ca = canonicalizePersonName(a);
  const cb = canonicalizePersonName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const shorter = ca.length <= cb.length ? ca : cb;
  const longer = ca.length <= cb.length ? cb : ca;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  const ta = nameTokens(ca);
  const tb = new Set(nameTokens(cb));
  let overlap = 0;
  let longTokenHit = false;
  for (const t of ta) {
    if (!tb.has(t)) continue;
    overlap += 1;
    if (t.length >= 5) longTokenHit = true;
  }
  return longTokenHit || overlap >= 2;
}

function anyNamesConnected(referenceNames, candidateNames) {
  for (const cand of candidateNames) {
    for (const ref of referenceNames) {
      if (namesClose(cand, ref)) return true;
    }
  }
  return false;
}

function mostFrequentName(names) {
  const counts = new Map();
  for (const n of names) {
    const trimmed = String(n || "").trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best ? best.slice(0, NAME_MAX) : null;
}

function getAddressField(address, field) {
  if (!address || typeof address !== "object") return "";
  const value = address[field];
  return typeof value === "string" ? value.trim() : "";
}

function getCustomerNameFromAddress(address) {
  const name = getAddressField(address, "name");
  if (name) return name;
  const first = getAddressField(address, "first_name");
  const last = getAddressField(address, "last_name");
  return [first, last].filter(Boolean).join(" ").trim();
}

/** Order has no customerName column — resolve from shipping/billing JSON. */
function resolveOrderCustomerName(order) {
  const candidates = [
    getCustomerNameFromAddress(order.shippingAddress),
    getCustomerNameFromAddress(order.billingAddress),
  ];
  for (const c of candidates) {
    if (c && c.trim()) return c.trim();
  }
  return null;
}

function csvEscape(value) {
  return JSON.stringify(value == null ? "" : String(value));
}

function phoneOwnershipKey(phone) {
  const digits = phoneDigitsOnly(phone);
  if (digits.length === 10 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 11 && digits.startsWith("94")) return digits.slice(2);
  if (digits.length === 9) return digits;
  return digits || normalizePhone(phone) || "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companyId = typeof args["company-id"] === "string" ? args["company-id"] : null;
  const dryRun = Boolean(args["dry-run"]);
  const apply = Boolean(args["apply"]);
  const limit =
    typeof args.limit === "string" && /^\d+$/.test(args.limit) ? Number(args.limit) : null;

  if (!companyId || (!dryRun && !apply) || (dryRun && apply)) {
    console.error(
      "Usage: node scripts/unmerge-disconnected-contact-phones.cjs --company-id <cuid> (--dry-run | --apply) [--limit N]"
    );
    process.exit(1);
  }

  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  const decisions = [];
  const counts = {
    contactsScanned: 0,
    phonesKept: 0,
    phonesSplitCreated: 0,
    phonesDetachedOnly: 0,
    phonesDedupedPrimaryVariant: 0,
    phonesSkippedBlank: 0,
  };

  try {
    const company = await prisma.company.findFirst({
      where: { id: companyId },
      select: { id: true, name: true },
    });
    if (!company) {
      console.error(`Company not found: ${companyId}`);
      process.exit(1);
    }

    const contacts = await prisma.contactMaster.findMany({
      where: { companyId, phones: { some: {} } },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        email: true,
        phones: { select: { id: true, phoneNumber: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: { id: "asc" },
      ...(limit ? { take: limit } : {}),
    });

    counts.contactsScanned = contacts.length;

    // Ownership index: canonical digit key -> { contactId, asPrimary, asSecondary }
    const ownersByKey = new Map();
    const allCompanyContacts = await prisma.contactMaster.findMany({
      where: { companyId },
      select: {
        id: true,
        phoneNumber: true,
        phones: { select: { phoneNumber: true } },
      },
    });
    for (const c of allCompanyContacts) {
      if (c.phoneNumber) {
        const key = phoneOwnershipKey(c.phoneNumber);
        if (key) {
          const cur = ownersByKey.get(key) || [];
          cur.push({ contactId: c.id, as: "primary" });
          ownersByKey.set(key, cur);
        }
      }
      for (const p of c.phones) {
        const key = phoneOwnershipKey(p.phoneNumber);
        if (!key) continue;
        const cur = ownersByKey.get(key) || [];
        cur.push({ contactId: c.id, as: "secondary" });
        ownersByKey.set(key, cur);
      }
    }

    function findOtherOwner(phone, excludeContactId) {
      const key = phoneOwnershipKey(phone);
      if (!key) return null;
      const owners = ownersByKey.get(key) || [];
      return owners.find((o) => o.contactId !== excludeContactId) || null;
    }

    function registerOwner(phone, contactId, as) {
      const key = phoneOwnershipKey(phone);
      if (!key) return;
      const cur = ownersByKey.get(key) || [];
      cur.push({ contactId, as });
      ownersByKey.set(key, cur);
    }

    function unregisterSecondary(phone, contactId) {
      const key = phoneOwnershipKey(phone);
      if (!key) return;
      const cur = ownersByKey.get(key) || [];
      ownersByKey.set(
        key,
        cur.filter((o) => !(o.contactId === contactId && o.as === "secondary"))
      );
    }

    for (const contact of contacts) {
      const primary = normalizePhone(contact.phoneNumber);
      const primaryVariants = new Set(primary ? buildPhoneLookupVariants(primary) : []);

      // Load all orders for primary + all secondaries in one query
      const allVariants = new Set(primaryVariants);
      for (const sp of contact.phones) {
        for (const v of buildPhoneLookupVariants(sp.phoneNumber)) allVariants.add(v);
      }
      const variantList = [...allVariants];
      const orders =
        variantList.length > 0
          ? await prisma.order.findMany({
              where: { companyId, customerPhone: { in: variantList } },
              select: {
                customerPhone: true,
                createdAt: true,
                shippingAddress: true,
                billingAddress: true,
              },
            })
          : [];

      const primaryOrderNames = [];
      const ordersBySecondaryId = new Map();

      for (const sp of contact.phones) {
        ordersBySecondaryId.set(sp.id, []);
      }

      for (const order of orders) {
        const phone = order.customerPhone;
        if (!phone) continue;
        const customerName = resolveOrderCustomerName(order);
        const enriched = { ...order, customerName };
        if (primaryVariants.has(phone) || (primary && phonesCompatible(primary, phone))) {
          if (customerName) primaryOrderNames.push(customerName);
          continue;
        }
        for (const sp of contact.phones) {
          if (phonesCompatible(sp.phoneNumber, phone)) {
            ordersBySecondaryId.get(sp.id).push(enriched);
          }
        }
      }

      const referenceNames = [
        ...(contact.name?.trim() ? [contact.name.trim()] : []),
        ...primaryOrderNames,
      ];

      for (const sp of contact.phones) {
        const secondary = normalizePhone(sp.phoneNumber);
        if (!secondary) {
          counts.phonesSkippedBlank += 1;
          decisions.push({
            action: "skip_blank",
            parentContactId: contact.id,
            parentName: contact.name,
            primaryPhone: primary,
            secondaryPhone: sp.phoneNumber,
            contactPhoneId: sp.id,
            reason: "blank_phone",
          });
          continue;
        }

        if (primary && phonesCompatible(primary, secondary)) {
          counts.phonesDedupedPrimaryVariant += 1;
          decisions.push({
            action: "dedupe_primary_variant",
            parentContactId: contact.id,
            parentName: contact.name,
            primaryPhone: primary,
            secondaryPhone: secondary,
            contactPhoneId: sp.id,
            reason: "secondary_is_format_variant_of_primary",
          });
          if (apply) {
            await prisma.contactPhone.delete({ where: { id: sp.id } });
            unregisterSecondary(secondary, contact.id);
          }
          continue;
        }

        const secondaryOrders = ordersBySecondaryId.get(sp.id) || [];
        const candidateNames = secondaryOrders
          .map((o) => o.customerName?.trim())
          .filter(Boolean);
        const connected =
          candidateNames.length > 0 && anyNamesConnected(referenceNames, candidateNames);

        if (connected) {
          counts.phonesKept += 1;
          decisions.push({
            action: "keep",
            parentContactId: contact.id,
            parentName: contact.name,
            primaryPhone: primary,
            secondaryPhone: secondary,
            contactPhoneId: sp.id,
            reason: "order_customer_name_connected",
            candidateNames: [...new Set(candidateNames)].slice(0, 5),
            referenceNames: [...new Set(referenceNames)].slice(0, 5),
          });
          continue;
        }

        const otherOwner = findOtherOwner(secondary, contact.id);
        if (otherOwner) {
          counts.phonesDetachedOnly += 1;
          decisions.push({
            action: "detach_only",
            parentContactId: contact.id,
            parentName: contact.name,
            primaryPhone: primary,
            secondaryPhone: secondary,
            contactPhoneId: sp.id,
            reason:
              candidateNames.length === 0
                ? "no_orders_and_owned_elsewhere"
                : "name_not_connected_and_owned_elsewhere",
            otherContactId: otherOwner.contactId,
            otherAs: otherOwner.as,
            candidateNames: [...new Set(candidateNames)].slice(0, 5),
          });
          if (apply) {
            await prisma.contactPhone.delete({ where: { id: sp.id } });
            unregisterSecondary(secondary, contact.id);
          }
          continue;
        }

        const newName = mostFrequentName(candidateNames) || "Unknown";
        const latestOrderAt = secondaryOrders.reduce((max, o) => {
          if (!o.createdAt) return max;
          if (!max || o.createdAt > max) return o.createdAt;
          return max;
        }, null);

        counts.phonesSplitCreated += 1;
        decisions.push({
          action: "split_create",
          parentContactId: contact.id,
          parentName: contact.name,
          primaryPhone: primary,
          secondaryPhone: secondary,
          contactPhoneId: sp.id,
          reason:
            candidateNames.length === 0 ? "no_orders_no_connection" : "name_not_connected",
          newContactName: newName,
          lastPurchaseAt: latestOrderAt ? latestOrderAt.toISOString() : null,
          candidateNames: [...new Set(candidateNames)].slice(0, 5),
          referenceNames: [...new Set(referenceNames)].slice(0, 5),
        });

        if (apply) {
          const created = await prisma.$transaction(async (tx) => {
            const row = await tx.contactMaster.create({
              data: {
                companyId,
                name: newName,
                email: null,
                phoneNumber: secondary,
                source: "unmerge-phone",
                lastPurchaseAt: latestOrderAt,
              },
              select: { id: true },
            });
            await tx.contactPhone.delete({ where: { id: sp.id } });
            return row;
          });
          unregisterSecondary(secondary, contact.id);
          registerOwner(secondary, created.id, "primary");
          decisions[decisions.length - 1].newContactId = created.id;
        }
      }
    }

    const tmpDir = path.join(__dirname, "..", "tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const csvPath = path.join(tmpDir, `unmerge-phone-plan-${stamp}.csv`);
    const csvPathAlias = path.join(tmpDir, "unmerge-phone-plan.csv");
    const header = [
      "action",
      "parentContactId",
      "parentName",
      "primaryPhone",
      "secondaryPhone",
      "contactPhoneId",
      "reason",
      "newContactName",
      "newContactId",
      "otherContactId",
      "candidateNames",
      "referenceNames",
    ];
    const csvLines = [
      header.join(","),
      ...decisions.map((d) =>
        [
          csvEscape(d.action),
          csvEscape(d.parentContactId),
          csvEscape(d.parentName),
          csvEscape(d.primaryPhone),
          csvEscape(d.secondaryPhone),
          csvEscape(d.contactPhoneId),
          csvEscape(d.reason),
          csvEscape(d.newContactName),
          csvEscape(d.newContactId),
          csvEscape(d.otherContactId),
          csvEscape((d.candidateNames || []).join("|")),
          csvEscape((d.referenceNames || []).join("|")),
        ].join(",")
      ),
    ];
    const csvBody = csvLines.join("\n");
    // Timestamped file first so a locked Excel copy of the alias cannot fail the run after DB writes.
    fs.writeFileSync(csvPath, csvBody, "utf8");
    try {
      fs.writeFileSync(csvPathAlias, csvBody, "utf8");
    } catch (err) {
      console.error(
        `[unmerge] warn: could not refresh ${path.basename(csvPathAlias)} (${err.code || err.message}); wrote ${path.basename(csvPath)}`
      );
    }

    const summary = {
      companyId: company.id,
      companyName: company.name,
      mode: apply ? "apply" : "dry-run",
      limit,
      ...counts,
      csvPath: path.relative(path.join(__dirname, ".."), csvPath).replace(/\\/g, "/"),
      topSplits: decisions.filter((d) => d.action === "split_create").slice(0, 25),
      topKept: decisions.filter((d) => d.action === "keep").slice(0, 15),
      topDetach: decisions.filter((d) => d.action === "detach_only").slice(0, 15),
      topDedupe: decisions
        .filter((d) => d.action === "dedupe_primary_variant")
        .slice(0, 10),
      hansanie: decisions.filter(
        (d) =>
          /hansanie/i.test(String(d.parentName || "")) ||
          d.primaryPhone === "0717384963" ||
          d.secondaryPhone === "0776239675" ||
          d.secondaryPhone === "0773150518"
      ),
    };

    console.log(JSON.stringify(summary, null, 2));
    console.error(
      `[unmerge] ${summary.mode} contacts=${counts.contactsScanned} keep=${counts.phonesKept} split=${counts.phonesSplitCreated} detach=${counts.phonesDetachedOnly} dedupe=${counts.phonesDedupedPrimaryVariant} csv=${summary.csvPath}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[unmerge] fatal", err);
  process.exit(1);
});
