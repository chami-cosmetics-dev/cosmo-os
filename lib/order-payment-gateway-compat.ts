import "server-only";

import { cache } from "react";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type GatewayColumnState = {
  hasPaymentGatewayNames: boolean;
  hasPaymentGatewayPrimary: boolean;
};

export const getOrderPaymentGatewayColumnState = cache(
  async (): Promise<GatewayColumnState> => {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>(
      Prisma.sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Order'
          AND column_name IN ('paymentGatewayNames', 'paymentGatewayPrimary')
      `,
    );

    const names = new Set(rows.map((row) => row.column_name));
    return {
      hasPaymentGatewayNames: names.has("paymentGatewayNames"),
      hasPaymentGatewayPrimary: names.has("paymentGatewayPrimary"),
    };
  },
);
