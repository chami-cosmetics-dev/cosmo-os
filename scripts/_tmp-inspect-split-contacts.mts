import { writeFileSync } from "node:fs";

import { prisma } from "../lib/prisma";

const pairs = [
  { label: "Amesha", keep: "cms85ammn0005l404khqs4ibg", drop: "cmpplyjok0013ie04f13ibblh", moveEmail: true },
  { label: "Sachintha", keep: "cmu0y1aji027pwcogsly9q4nb", drop: "cmpm52g92000tk304xeg8y5qn", moveEmail: true },
  { label: "Sampath", keep: "cmv52kfqq007dwciwfak0ybp4", drop: "cmrrb1l6v0005js04861xoxlt", moveEmail: true },
  { label: "Letishiya", keep: "cmpm59747001bk30476odvtv8", drop: "cmsvtkkwl000zju04u6twde4k", moveEmail: true },
  { label: "Jeewani", keep: "cmt44zagg0009l104j6dtlbze", drop: "cms21l0mn000vjv04s1032ljj", moveEmail: true },
  { label: "Kavindu", keep: "cms8tkwu5006mjy04rs92nizq", drop: "cmpmft4rz000tie04y7rr1diu", moveEmail: true },
  { label: "Devni", keep: "cmqjcez890005jp043wx58g61", drop: "cmr1wqpd70005ib04rjn7dq67", moveEmail: true },
  { label: "Nimesh", keep: "cmv7yujw20fd7wckw4ztlmv6r", drop: "cmqduekln0013i9042k89cvja", moveEmail: true },
  { label: "Shane", keep: "cmu0y76mc0agpwcogi7mtin6o", drop: "cmpz3pxjd000ri904zg2an7l8", moveEmail: false },
];

async function snapshot(id: string) {
  const contact = await prisma.contactMaster.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phoneNumber: true,
      email: true,
      purchaseOrderCount: true,
      purchaseTotalValue: true,
      source: true,
      assignedMerchant: true,
      remarks: true,
      phones: { select: { phoneNumber: true } },
      emails: { select: { email: true, isPrimary: true } },
      _count: {
        select: {
          adaptPurchases: true,
          callQueueItems: true,
          allocationUpdates: true,
          osRegistrationCaptures: true,
          removedEmails: true,
        },
      },
    },
  });
  return contact;
}

const rows = [];
for (const pair of pairs) {
  rows.push({
    label: pair.label,
    moveEmail: pair.moveEmail,
    keep: await snapshot(pair.keep),
    drop: await snapshot(pair.drop),
  });
}
writeFileSync("C:/Users/Bad-Boy/AppData/Local/Temp/split-inspect.json", JSON.stringify(rows, null, 2));
await prisma.$disconnect();
