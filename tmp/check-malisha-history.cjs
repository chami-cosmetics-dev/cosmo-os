const { PrismaClient } = require("@prisma/client");
const raw = process.env.DATABASE_URL || "";
const prisma = new PrismaClient({
  datasources: { db: { url: raw.replace(/(ep-[^.]+)-pooler(\.[^/]+)/, "$1$2") || raw } },
});
const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";

async function main() {
  const emailOrders = await prisma.order.findMany({
    where: {
      companyId: COMPANY_ID,
      customerEmail: { equals: "malishadealmeida@gmail.com", mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      customerPhone: true,
      customerEmail: true,
      erpnextInvoiceId: true,
      totalPrice: true,
      createdAt: true,
    },
  });
  const otherPhone = await prisma.order.findMany({
    where: {
      companyId: COMPANY_ID,
      customerPhone: { in: ["0713909515", "713909515", "+94713909515", "94713909515"] },
    },
    select: {
      id: true,
      name: true,
      customerPhone: true,
      erpnextInvoiceId: true,
      totalPrice: true,
      createdAt: true,
    },
  });
  const adaptOld = await prisma.adaptPurchaseHistory.findMany({
    where: { contactId: "cmseiad592dc9wcygs4nya7rg", companyId: COMPANY_ID },
    select: { id: true, salesInvoiceNo: true, invoiceDate: true, ttlAmount: true },
  });
  const adaptNew = await prisma.adaptPurchaseHistory.findMany({
    where: { contactId: "cmplzwk1n001njy049q1ddujb", companyId: COMPANY_ID },
    select: { id: true, salesInvoiceNo: true, invoiceDate: true, ttlAmount: true },
  });
  const shaneOrders = await prisma.order.findMany({
    where: {
      companyId: COMPANY_ID,
      OR: [
        { customerPhone: { in: ["0740332575", "740332575", "+94740332575"] } },
        { erpnextInvoiceId: "600-002476" },
        { name: "60017797" },
      ],
    },
    select: {
      id: true,
      name: true,
      customerPhone: true,
      customerEmail: true,
      erpnextInvoiceId: true,
      totalPrice: true,
      createdAt: true,
    },
  });
  const blank = await prisma.contactMaster.findUnique({
    where: { id: "cmplzwk1n001njy049q1ddujb" },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      lastPurchaseAt: true,
      createdAt: true,
      source: true,
    },
  });
  console.log(
    JSON.stringify(
      {
        blank,
        emailOrders,
        otherPhoneOrders: otherPhone,
        adaptOn071: adaptOld,
        adaptOn070: adaptNew,
        shaneOrders,
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
