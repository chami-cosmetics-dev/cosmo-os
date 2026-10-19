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
  { label: "Shane test", keep: "cmu0y76mc0agpwcogi7mtin6o", drop: "cmpz3pxjd000ri904zg2an7l8", moveEmail: false },
];

const results = [];

for (const pair of pairs) {
  const outcome = await prisma.$transaction(async (tx) => {
    const drop = await tx.contactMaster.findUnique({
      where: { id: pair.drop },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        _count: { select: { adaptPurchases: true, callQueueItems: true, allocationUpdates: true } },
      },
    });
    if (!drop) return { label: pair.label, status: "already-gone" };
    const linked = drop._count.adaptPurchases + drop._count.callQueueItems + drop._count.allocationUpdates;
    if (linked > 0 || drop.phoneNumber) {
      return { label: pair.label, status: "skipped", reason: "drop card has phone or linked rows", drop };
    }
    const keep = await tx.contactMaster.findUnique({
      where: { id: pair.keep },
      select: { id: true, name: true, email: true, phoneNumber: true },
    });
    if (!keep) return { label: pair.label, status: "skipped", reason: "phone card missing" };
    let emailMoved: string | null = null;
    if (pair.moveEmail && drop.email && !keep.email) {
      await tx.contactMaster.update({
        where: { id: keep.id },
        data: { email: drop.email, emailUpdatedAt: new Date() },
      });
      emailMoved = drop.email;
    }
    await tx.contactMaster.delete({ where: { id: drop.id } });
    const after = await tx.contactMaster.findUnique({
      where: { id: keep.id },
      select: { id: true, name: true, phoneNumber: true, email: true },
    });
    return { label: pair.label, status: "deleted-mail-card", emailMoved, kept: after, removed: drop.name };
  });
  results.push(outcome);
}

writeFileSync("C:/Users/Bad-Boy/AppData/Local/Temp/split-merge.json", JSON.stringify(results, null, 2));
await prisma.$disconnect();
