import { NextResponse } from "next/server";

import { OsfErpError } from "@/lib/osf/erp-stock";
import {
  buildItemCodeWorkbook,
  listVaultErpItemCodes,
} from "@/lib/vault-supplement-import/item-codes";
import { requireSupplementStaff, xlsxAttachment } from "@/lib/vault-supplement-import/http";
import { ITEM_CODE_FILE_NAME } from "@/lib/vault-supplement-import/template-workbook";

export const maxDuration = 300;

export async function GET() {
  const access = await requireSupplementStaff("vault");
  if (!access.ok) return access.response;

  try {
    const codes = await listVaultErpItemCodes(access.companyId);
    const buffer = await buildItemCodeWorkbook(codes);
    return xlsxAttachment(buffer, ITEM_CODE_FILE_NAME);
  } catch (error) {
    const message = error instanceof OsfErpError || error instanceof Error
      ? error.message
      : "Supplement Vault ERP item list could not be loaded";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
