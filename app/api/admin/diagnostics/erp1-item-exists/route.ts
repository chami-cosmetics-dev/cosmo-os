import { NextResponse } from "next/server";

import { auth0 } from "@/lib/auth0";
import { verifyExactErpItem } from "@/lib/osf/purchase-history";
import { OsfErpError } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";

const COMPANY_ID = "cmn2xcas1002crl5xtgoq28f5";
const INSTANCE_ID = "cmr0zgv9e0003jp042b584n5b";
const LOCATION_ID = "cmr0ztcao0001l804fi3qox8i";
const ERP_COMPANY = "Cosmetics.lk";
const ITEM_CODE = "ACN002_1";
const noStore = { "Cache-Control": "no-store" };

type Result = "EXISTS" | "NOT_FOUND" | "PERMISSION_DENIED";

function result(status: Result, httpStatus = 200) {
  return NextResponse.json({ status }, { status: httpStatus, headers: noStore });
}

export async function GET(request: Request) {
  try {
    // Read existing identity and roles directly: normal RBAC session resolution can
    // synchronize User records, which this diagnostic must never do.
    const session = await auth0.getSession();
    if (!session?.user?.sub) return result("PERMISSION_DENIED", 401);

    const admin = await prisma.user.findFirst({
      where: {
        auth0Id: session.user.sub,
        companyId: COMPANY_ID,
        userRoles: { some: { role: { name: { in: ["admin", "super_admin"] } } } },
      },
      select: { id: true },
    });
    if (!admin) return result("PERMISSION_DENIED", 403);

    const params = new URL(request.url).searchParams;
    if (params.size !== 1 || params.getAll("itemCode").length !== 1 ||
        params.get("itemCode") !== ITEM_CODE) {
      return new Response(null, { status: 400, headers: noStore });
    }

    const [instance, location] = await Promise.all([
      prisma.erpnextInstance.findFirst({
        where: { id: INSTANCE_ID, companyId: COMPANY_ID },
        select: { baseUrl: true, apiKey: true, apiSecret: true },
      }),
      prisma.companyLocation.findFirst({
        where: {
          id: LOCATION_ID, companyId: COMPANY_ID,
          erpnextInstanceId: INSTANCE_ID, erpnextCompany: ERP_COMPANY,
        },
        select: { id: true },
      }),
    ]);
    if (!instance || !location || !instance.baseUrl || !instance.apiKey || !instance.apiSecret) {
      return new Response(null, { status: 503, headers: noStore });
    }

    const match = await verifyExactErpItem({
      baseUrl: instance.baseUrl.replace(/\/$/, ""),
      apiKey: instance.apiKey,
      apiSecret: instance.apiSecret,
    }, ITEM_CODE);
    if (match === "VERIFIED") return result("EXISTS");
    if (match === "MAPPING_UNAVAILABLE") return result("NOT_FOUND");
    return new Response(null, { status: 502, headers: noStore });
  } catch (error) {
    if (error instanceof OsfErpError && /^ERPNext GET .+ \[(401|403)\]:/.test(error.message)) {
      return result("PERMISSION_DENIED", 403);
    }
    return new Response(null, { status: 502, headers: noStore });
  }
}

