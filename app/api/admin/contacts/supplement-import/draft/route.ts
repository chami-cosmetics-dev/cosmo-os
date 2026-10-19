import { NextResponse } from "next/server";

import { loadCosmoSupplementDraft } from "@/lib/vault-supplement-import/draft-source";
import { readItemCodeWorkbook } from "@/lib/vault-supplement-import/item-codes";
import { readUploadedXlsx, requireSupplementStaff, xlsxAttachment } from "@/lib/vault-supplement-import/http";
import { buildPurchasesWorkbook, DRAFT_FILE_NAME } from "@/lib/vault-supplement-import/template-workbook";

export const maxDuration = 300;

export async function POST(request: Request) {
  const access = await requireSupplementStaff("cosmo");
  if (!access.ok) return access.response;

  const uploaded = await readUploadedXlsx(request);
  if (!uploaded.ok) return uploaded.response;

  const codes = await readItemCodeWorkbook(uploaded.file);
  if (!codes.ok) {
    return NextResponse.json({ error: codes.error }, { status: 400 });
  }

  const rows = await loadCosmoSupplementDraft(access.companyId, new Set(codes.codes));
  const buffer = await buildPurchasesWorkbook(rows);
  return xlsxAttachment(buffer, DRAFT_FILE_NAME);
}
