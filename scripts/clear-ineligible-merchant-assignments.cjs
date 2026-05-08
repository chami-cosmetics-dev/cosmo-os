/* eslint-disable no-console, @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function normalizeDepartmentName(name) {
  return String(name ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function isEligibleDepartment(name) {
  return new Set(["digitalmarketing", "salesmarketing", "salsemarketing"]).has(
    normalizeDepartmentName(name)
  );
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      employeeProfile: {
        select: {
          department: { select: { name: true } },
        },
      },
    },
  });

  const eligibleIds = new Set(
    users
      .filter((user) => isEligibleDepartment(user.employeeProfile?.department?.name))
      .map((user) => user.id)
  );
  const ineligibleIds = users
    .filter((user) => !eligibleIds.has(user.id))
    .map((user) => user.id);

  const locations = await prisma.companyLocation.updateMany({
    where: { defaultMerchantUserId: { in: ineligibleIds } },
    data: { defaultMerchantUserId: null },
  });

  const orders = await prisma.order.updateMany({
    where: { assignedMerchantId: { in: ineligibleIds } },
    data: { assignedMerchantId: null },
  });

  console.log(`Eligible merchant users: ${eligibleIds.size}`);
  console.log(`Ineligible users checked: ${ineligibleIds.length}`);
  console.log(`Cleared shop default merchants: ${locations.count}`);
  console.log(`Cleared order merchant assignments: ${orders.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
