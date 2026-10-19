import { buildTemplateWorkbook, TEMPLATE_FILE_NAME } from "@/lib/vault-supplement-import/template-workbook";
import { requireSupplementStaff, xlsxAttachment } from "@/lib/vault-supplement-import/http";

export async function GET() {
  const access = await requireSupplementStaff("vault");
  if (!access.ok) return access.response;
  const buffer = await buildTemplateWorkbook();
  return xlsxAttachment(buffer, TEMPLATE_FILE_NAME);
}
