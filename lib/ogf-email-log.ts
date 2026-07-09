import { prisma } from "@/lib/prisma";

export async function logOgfEmail({
  companyId,
  batchCode,
  orderCount,
  emailTo,
  status,
  errorMessage,
  source = "cron",
}: {
  companyId: string;
  batchCode: string;
  orderCount: number;
  emailTo: string;
  status: "sent" | "failed";
  errorMessage?: string;
  source?: "cron" | "manual";
}): Promise<void> {
  try {
    await prisma.ogfEmailLog.create({
      data: {
        companyId,
        batchCode,
        orderCount,
        emailTo,
        status,
        errorMessage: errorMessage ?? null,
        source,
      },
    });
  } catch (err) {
    console.error("[ogf-email-log] failed to write log:", err);
  }
}
