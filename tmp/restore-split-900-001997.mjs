import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const orderId = "cmwey46ht001xjs08ze44tvbs";

const latest = await prisma.approvalRequest.findFirst({
  where: { orderId, type: "order_payment_approval" },
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    status: true,
    requestNote: true,
    paymentLines: { select: { paymentMethod: true, amount: true } },
  },
});

console.log("BEFORE", JSON.stringify(latest, null, 2));

if (!latest) {
  console.error("No approval found");
  process.exit(1);
}

const updated = await prisma.approvalRequest.update({
  where: { id: latest.id },
  data: {
    status: "pending",
    reviewNote: null,
    reviewedAt: null,
    reviewedById: null,
    updatedAt: new Date(),
  },
  select: {
    id: true,
    status: true,
    requestNote: true,
    reviewNote: true,
    paymentLines: { select: { paymentMethod: true, amount: true } },
  },
});

console.log("RESTORED", JSON.stringify(updated, null, 2));
await prisma.$disconnect();
