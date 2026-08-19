/**
 * Count ContactMaster duplicate phones (exact + canonical).
 *   node scripts/with-env.mjs cosmo-prod node tmp/count-phone-dupes.cjs
 */
const { PrismaClient } = require("@prisma/client");

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: (process.env.DATABASE_URL || "").replace(
        /(ep-[^.]+)-pooler(\.[^/]+)/,
        "$1$2"
      ),
    },
  },
});

async function main() {
  const [
    totals,
    exactDupes,
    exactDupeRows,
    canonicalDupes,
    blankPhone,
    extraPhones,
  ] = await Promise.all([
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS total
      FROM "ContactMaster"
      WHERE "companyId" = ${COMPANY_ID}
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS groups, COALESCE(SUM(cnt - 1), 0)::int AS extra_rows
      FROM (
        SELECT COUNT(*)::int AS cnt
        FROM "ContactMaster"
        WHERE "companyId" = ${COMPANY_ID}
          AND "phoneNumber" IS NOT NULL
          AND TRIM("phoneNumber") <> ''
        GROUP BY "phoneNumber"
        HAVING COUNT(*) > 1
      ) t
    `,
    prisma.$queryRaw`
      SELECT "phoneNumber" AS phone, COUNT(*)::int AS count,
             array_agg(name ORDER BY name) AS names,
             array_agg(COALESCE(source, '') ORDER BY name) AS sources
      FROM "ContactMaster"
      WHERE "companyId" = ${COMPANY_ID}
        AND "phoneNumber" IS NOT NULL
        AND TRIM("phoneNumber") <> ''
      GROUP BY "phoneNumber"
      HAVING COUNT(*) > 1
      ORDER BY count DESC, "phoneNumber"
      LIMIT 20
    `,
    prisma.$queryRaw`
      WITH digits AS (
        SELECT
          id,
          name,
          "phoneNumber",
          COALESCE(source, '') AS source,
          regexp_replace(COALESCE("phoneNumber", ''), '\\D', '', 'g') AS d
        FROM "ContactMaster"
        WHERE "companyId" = ${COMPANY_ID}
          AND "phoneNumber" IS NOT NULL
          AND TRIM("phoneNumber") <> ''
      ),
      canon AS (
        SELECT
          id,
          name,
          "phoneNumber",
          source,
          CASE
            WHEN d LIKE '94%' AND length(d) >= 11 THEN
              CASE
                WHEN length(substring(d FROM 3)) = 9 THEN '0' || substring(d FROM 3)
                WHEN length(substring(d FROM 3)) = 10 AND substring(d FROM 3) LIKE '0%'
                  THEN substring(d FROM 3)
                ELSE NULL
              END
            WHEN length(d) = 9 THEN '0' || d
            WHEN length(d) = 10 AND d LIKE '0%' THEN d
            ELSE NULL
          END AS canon
        FROM digits
      )
      SELECT
        COUNT(*) FILTER (WHERE cnt > 1)::int AS groups,
        COALESCE(SUM(GREATEST(cnt - 1, 0)) FILTER (WHERE cnt > 1), 0)::int AS extra_rows
      FROM (
        SELECT canon, COUNT(*)::int AS cnt
        FROM canon
        WHERE canon IS NOT NULL
        GROUP BY canon
      ) t
    `,
    prisma.contactMaster.count({
      where: {
        companyId: COMPANY_ID,
        OR: [{ phoneNumber: null }, { phoneNumber: "" }],
      },
    }),
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS extra_phone_rows,
             COUNT(DISTINCT cp."contactId")::int AS contacts_with_extra
      FROM "ContactPhone" cp
      JOIN "ContactMaster" cm ON cm.id = cp."contactId"
      WHERE cm."companyId" = ${COMPANY_ID}
    `,
  ]);

  const canonicalSamples = await prisma.$queryRaw`
    WITH digits AS (
      SELECT
        name,
        "phoneNumber",
        COALESCE(source, '') AS source,
        regexp_replace(COALESCE("phoneNumber", ''), '\\D', '', 'g') AS d
      FROM "ContactMaster"
      WHERE "companyId" = ${COMPANY_ID}
        AND "phoneNumber" IS NOT NULL
        AND TRIM("phoneNumber") <> ''
    ),
    canon AS (
      SELECT
        name,
        "phoneNumber",
        source,
        CASE
          WHEN d LIKE '94%' AND length(d) >= 11 THEN
            CASE
              WHEN length(substring(d FROM 3)) = 9 THEN '0' || substring(d FROM 3)
              WHEN length(substring(d FROM 3)) = 10 AND substring(d FROM 3) LIKE '0%'
                THEN substring(d FROM 3)
              ELSE NULL
            END
          WHEN length(d) = 9 THEN '0' || d
          WHEN length(d) = 10 AND d LIKE '0%' THEN d
          ELSE NULL
        END AS canon
      FROM digits
    )
    SELECT
      canon AS phone,
      COUNT(*)::int AS count,
      array_agg("phoneNumber" ORDER BY "phoneNumber") AS phones_raw,
      array_agg(name ORDER BY name) AS names,
      array_agg(source ORDER BY name) AS sources
    FROM canon
    WHERE canon IS NOT NULL
    GROUP BY canon
    HAVING COUNT(*) > 1
    ORDER BY count DESC, canon
    LIMIT 20
  `;

  console.log(
    JSON.stringify(
      {
        total: totals[0].total,
        blankOrNullPhone: blankPhone,
        exactSamePhoneString: exactDupes[0],
        exactSamples: exactDupeRows,
        canonicalSameNumber: canonicalDupes[0],
        canonicalSamples,
        extraPhonesOnCards: extraPhones[0],
      },
      null,
      2
    )
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
