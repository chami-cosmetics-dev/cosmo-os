import { NextResponse } from "next/server";

import { isVaultOsDeployment } from "@/lib/falcon-waybill-brand";
import { requirePermission } from "@/lib/rbac";

import { XLSX_CONTENT_TYPE } from "@/lib/vault-supplement-import/template-workbook";

export function xlsxAttachment(buffer: Buffer, fileName: string) {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

export async function requireSupplementStaff(app: "vault" | "cosmo") {
  const auth = await requirePermission("contacts.master.manage");
  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: auth.error }, { status: auth.status }),
    };
  }
  const companyId = auth.context?.user?.companyId;
  if (!companyId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "No company associated with your account" }, { status: 404 }),
    };
  }
  const vault = isVaultOsDeployment();
  if (app === "vault" && !vault) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "This action is only available on Vault OS" }, { status: 409 }),
    };
  }
  if (app === "cosmo" && vault) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "This action is only available on Cosmo OS" }, { status: 409 }),
    };
  }
  return { ok: true as const, companyId };
}

export async function readUploadedXlsx(request: Request): Promise<
  { ok: true; file: Buffer } | { ok: false; response: NextResponse }
> {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "file is required" }, { status: 400 }),
    };
  }
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "file must be an .xlsx workbook" }, { status: 400 }),
    };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: "file is empty" }, { status: 400 }),
    };
  }
  return { ok: true, file: bytes };
}
