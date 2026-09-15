/**
 * One-shot Hutch Test SMS via Cosmo prod portal config.
 * Usage: node scripts/with-env.mjs cosmo-prod npx tsx --tsconfig tsconfig.scripts.json scripts/send-hutch-test-sms.ts [phone]
 */
import { APP_NAME } from "../lib/branding";
import { sendSms } from "../lib/hutch-sms";
import { prisma } from "../lib/prisma";

const phone = (process.argv[2] ?? "0766713205").trim();

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: "Cosmetics.lk" },
    select: { id: true, name: true },
  });
  if (!company) {
    console.error("Cosmetics.lk company not found");
    process.exit(1);
  }

  const portal = await prisma.smsPortalConfig.findUnique({
    where: { companyId: company.id },
    select: { authUrl: true, smsUrl: true, username: true },
  });
  console.log(
    JSON.stringify({
      company: company.name,
      phone,
      username: portal?.username,
      authUrl: portal?.authUrl,
      smsUrl: portal?.smsUrl,
    }),
  );

  const result = await sendSms(
    company.id,
    phone,
    `This is a test SMS from ${APP_NAME}. Your SMS portal is configured correctly.`,
  );
  console.log(
    JSON.stringify({
      success: result.success,
      message: result.success ? null : result.message,
    }),
  );
  if (!result.success) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
