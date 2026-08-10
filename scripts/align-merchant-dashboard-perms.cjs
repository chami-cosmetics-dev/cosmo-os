/**
 * Align merchant-level-01/02 permissions:
 * - remove dashboard.view (company overview)
 * - ensure dashboard.merchant_view + contacts.insight.read
 *
 * Usage:
 *   node scripts/with-env.mjs cosmo-prod node scripts/align-merchant-dashboard-perms.cjs --dry-run
 *   node scripts/with-env.mjs cosmo-prod node scripts/align-merchant-dashboard-perms.cjs
 */

const { PrismaClient } = require("@prisma/client");

const ROLE_NAMES = ["merchant-level-01", "merchant-level-02"];
const REMOVE_KEYS = ["dashboard.view"];
const ENSURE_KEYS = ["dashboard.merchant_view", "contacts.insight.read"];

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

async function main() {
  const dryRun = Boolean(parseArgs(process.argv.slice(2))["dry-run"]);
  const rawUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({
    datasources: {
      db: { url: rawUrl.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || rawUrl },
    },
  });

  console.log(`[align-merchant-perms] dryRun=${dryRun}`);

  try {
    const perms = await prisma.permission.findMany({
      where: { key: { in: [...REMOVE_KEYS, ...ENSURE_KEYS] } },
      select: { id: true, key: true },
    });
    const byKey = new Map(perms.map((p) => [p.key, p.id]));
    for (const key of [...REMOVE_KEYS, ...ENSURE_KEYS]) {
      if (!byKey.has(key)) throw new Error(`Missing permission: ${key}`);
    }

    for (const roleName of ROLE_NAMES) {
      const role = await prisma.role.findUnique({
        where: { name: roleName },
        select: {
          id: true,
          name: true,
          rolePermissions: { select: { permissionId: true, permission: { select: { key: true } } } },
        },
      });
      if (!role) {
        console.log(JSON.stringify({ role: roleName, found: false }));
        continue;
      }

      const current = new Set(role.rolePermissions.map((rp) => rp.permission.key));
      const toRemove = REMOVE_KEYS.filter((k) => current.has(k));
      const toAdd = ENSURE_KEYS.filter((k) => !current.has(k));

      if (!dryRun) {
        if (toRemove.length) {
          await prisma.rolePermission.deleteMany({
            where: {
              roleId: role.id,
              permissionId: { in: toRemove.map((k) => byKey.get(k)) },
            },
          });
        }
        if (toAdd.length) {
          await prisma.rolePermission.createMany({
            data: toAdd.map((k) => ({
              roleId: role.id,
              permissionId: byKey.get(k),
            })),
            skipDuplicates: true,
          });
        }
      }

      console.log(
        JSON.stringify({
          role: roleName,
          before: [...current].filter((k) => k.startsWith("dashboard") || k.includes("insight")),
          remove: toRemove,
          add: toAdd,
        })
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
